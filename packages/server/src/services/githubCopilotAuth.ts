/**
 * GitHub Copilot 认证服务
 *
 * 实现 OAuth 2.0 Device Authorization Grant 流程
 * 参考: https://datatracker.ietf.org/doc/html/rfc8628
 */

// GitHub Copilot Chat 的 OAuth Client ID（公开）
export const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98";

// Copilot 请求头（模拟 VS Code Copilot 扩展）
export const COPILOT_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.32.4",
  "Editor-Version": "vscode/1.105.1",
  "Editor-Plugin-Version": "copilot-chat/0.32.4",
  "Copilot-Integration-Id": "vscode-chat",
};

/**
 * Copilot 认证信息
 */
export interface CopilotAuthInfo {
  // OAuth access_token（长期有效，用于刷新 Copilot API token）
  refreshToken: string;
  // Copilot API token（短期有效，约 30 分钟）
  accessToken: string;
  // Copilot API token 过期时间戳（毫秒）
  expiresAt: number;
  // GitHub Enterprise URL（可选，企业版使用）
  enterpriseUrl?: string;
}

/**
 * Device Flow 响应
 */
export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * Token 轮询响应
 */
interface TokenPollingResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Copilot Token 响应
 */
interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in?: number;
  endpoints?: {
    api: string;
    "origin-tracker": string;
    telemetry: string;
  };
}

/**
 * 规范化域名（去除协议前缀）
 */
function normalizeDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * 获取 GitHub API 域名
 */
function getGitHubDomain(enterpriseUrl?: string): string {
  if (enterpriseUrl) {
    return normalizeDomain(enterpriseUrl);
  }
  return "github.com";
}

/**
 * 获取 Copilot API 基础 URL
 */
export function getCopilotApiBaseUrl(enterpriseUrl?: string): string {
  if (enterpriseUrl) {
    return `https://copilot-api.${normalizeDomain(enterpriseUrl)}`;
  }
  return "https://api.githubcopilot.com";
}

/**
 * 1. 启动设备授权流程
 *
 * 请求 GitHub 获取 device_code 和 user_code
 */
export async function initiateDeviceFlow(
  enterpriseUrl?: string
): Promise<DeviceFlowResponse> {
  const domain = getGitHubDomain(enterpriseUrl);

  const response = await fetch(`https://${domain}/login/device/code`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...COPILOT_HEADERS,
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`启动设备授权失败: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * 2. 轮询获取 OAuth access_token
 *
 * 用户在浏览器中完成授权后，此函数返回 access_token
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  enterpriseUrl?: string,
  onPolling?: () => void
): Promise<string> {
  const domain = getGitHubDomain(enterpriseUrl);
  const pollInterval = Math.max(interval, 5) * 1000; // 至少 5 秒

  while (true) {
    // 通知调用方正在轮询
    onPolling?.();

    const response = await fetch(
      `https://${domain}/login/oauth/access_token`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: COPILOT_CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token 轮询请求失败: ${response.status} - ${errorText}`);
    }

    const data: TokenPollingResponse = await response.json();

    // 成功获取 token
    if (data.access_token) {
      return data.access_token;
    }

    // 处理错误
    if (data.error) {
      switch (data.error) {
        case "authorization_pending":
          // 用户尚未授权，继续轮询
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;

        case "slow_down":
          // 需要降低轮询频率
          await new Promise((resolve) =>
            setTimeout(resolve, pollInterval + 5000)
          );
          continue;

        case "expired_token":
          throw new Error("设备码已过期，请重新开始授权");

        case "access_denied":
          throw new Error("用户拒绝授权");

        default:
          throw new Error(data.error_description || data.error || "授权失败");
      }
    }

    // 未知响应，等待后重试
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

/**
 * 3. 获取/刷新 Copilot API Token
 *
 * 使用 OAuth access_token（refreshToken）获取短期有效的 Copilot API token
 */
export async function getCopilotToken(
  refreshToken: string,
  enterpriseUrl?: string
): Promise<{ token: string; expiresAt: number }> {
  const domain = getGitHubDomain(enterpriseUrl);
  const apiDomain = enterpriseUrl ? `api.${normalizeDomain(enterpriseUrl)}` : "api.github.com";

  const response = await fetch(
    `https://${apiDomain}/copilot_internal/v2/token`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${refreshToken}`,
        ...COPILOT_HEADERS,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("GitHub 授权已过期，请重新登录");
    }
    throw new Error(`获取 Copilot Token 失败: ${response.status} - ${errorText}`);
  }

  const data: CopilotTokenResponse = await response.json();

  return {
    token: data.token,
    // expires_at 是秒级时间戳，转换为毫秒
    expiresAt: data.expires_at * 1000,
  };
}

/**
 * 完整的 Device Flow 授权流程
 *
 * 此函数用于后端启动授权，返回用于显示给用户的信息
 */
export async function startDeviceFlowAuth(enterpriseUrl?: string): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}> {
  const deviceData = await initiateDeviceFlow(enterpriseUrl);

  return {
    deviceCode: deviceData.device_code,
    userCode: deviceData.user_code,
    verificationUri: deviceData.verification_uri,
    expiresIn: deviceData.expires_in,
    interval: deviceData.interval,
  };
}

/**
 * 完成授权流程
 *
 * 轮询获取 token 并换取 Copilot API token
 */
export async function completeDeviceFlowAuth(
  deviceCode: string,
  interval: number,
  enterpriseUrl?: string,
  onPolling?: () => void
): Promise<CopilotAuthInfo> {
  // 轮询获取 OAuth access_token
  const oauthToken = await pollForToken(
    deviceCode,
    interval,
    enterpriseUrl,
    onPolling
  );

  // 使用 OAuth token 获取 Copilot API token
  const copilotToken = await getCopilotToken(oauthToken, enterpriseUrl);

  return {
    refreshToken: oauthToken,
    accessToken: copilotToken.token,
    expiresAt: copilotToken.expiresAt,
    enterpriseUrl,
  };
}

/**
 * 刷新 Copilot Token（如果已过期或即将过期）
 *
 * @param auth 当前认证信息
 * @param bufferMs 提前刷新的缓冲时间（默认 5 分钟）
 * @returns 更新后的认证信息
 */
export async function refreshCopilotTokenIfNeeded(
  auth: CopilotAuthInfo,
  bufferMs: number = 5 * 60 * 1000
): Promise<CopilotAuthInfo> {
  const now = Date.now();

  // 如果 token 尚未过期（考虑缓冲时间），直接返回
  if (auth.expiresAt - now > bufferMs) {
    return auth;
  }

  // 刷新 token
  const newToken = await getCopilotToken(auth.refreshToken, auth.enterpriseUrl);

  return {
    ...auth,
    accessToken: newToken.token,
    expiresAt: newToken.expiresAt,
  };
}

/**
 * 验证认证信息是否有效
 */
export function isAuthValid(auth: CopilotAuthInfo | null | undefined): boolean {
  if (!auth) return false;
  if (!auth.refreshToken) return false;
  if (!auth.accessToken) return false;
  // accessToken 可能过期，但只要有 refreshToken 就可以刷新
  return true;
}

/**
 * GitHub Copilot 支持的模型列表
 * 数据来源: https://models.dev/api.json
 */
export const COPILOT_MODELS = [
  // GPT 系列
  { id: "gpt-4o", name: "GPT-4o", vision: true, functionCalling: true, reasoning: false, contextLength: 64000 },
  { id: "gpt-4.1", name: "GPT-4.1", vision: true, functionCalling: true, reasoning: false, contextLength: 128000 },
  { id: "gpt-5", name: "GPT-5", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5.1", name: "GPT-5.1", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5.2", name: "GPT-5.2", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5-codex", name: "GPT-5 Codex", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5.1-codex", name: "GPT-5.1 Codex", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  // o 系列 (推理模型)
  { id: "o3-mini", name: "o3-mini", vision: false, functionCalling: false, reasoning: true, contextLength: 128000 },
  { id: "o3", name: "o3 (Preview)", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "o4-mini", name: "o4-mini (Preview)", vision: false, functionCalling: false, reasoning: true, contextLength: 128000 },
  // Claude 系列
  { id: "claude-3.5-sonnet", name: "Claude Sonnet 3.5", vision: true, functionCalling: true, reasoning: false, contextLength: 90000 },
  { id: "claude-3.7-sonnet", name: "Claude Sonnet 3.7", vision: true, functionCalling: true, reasoning: false, contextLength: 200000 },
  { id: "claude-3.7-sonnet-thought", name: "Claude Sonnet 3.7 Thinking", vision: true, functionCalling: true, reasoning: true, contextLength: 200000 },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "claude-opus-4", name: "Claude Opus 4", vision: true, functionCalling: false, reasoning: true, contextLength: 80000 },
  { id: "claude-opus-41", name: "Claude Opus 4.1", vision: true, functionCalling: false, reasoning: true, contextLength: 80000 },
  { id: "claude-opus-4.5", name: "Claude Opus 4.5", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  // Gemini 系列
  { id: "gemini-2.0-flash-001", name: "Gemini 2.0 Flash", vision: true, functionCalling: true, reasoning: false, contextLength: 1000000 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", vision: true, functionCalling: true, reasoning: false, contextLength: 128000 },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", vision: true, functionCalling: true, reasoning: true, contextLength: 128000 },
  // 其他
  { id: "grok-code-fast-1", name: "Grok Code Fast 1", vision: false, functionCalling: true, reasoning: true, contextLength: 128000 },
];
