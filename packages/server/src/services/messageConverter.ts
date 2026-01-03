/**
 * 消息格式转换服务
 *
 * 统一处理不同格式消息的转换:
 * - OpenAI API 格式 (tool_calls, tool_call_id)
 * - AI SDK v6 格式 (content array with type)
 */

/**
 * 用户消息内容部分（支持图片）
 */
export type UserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * OpenAI 格式的消息
 */
export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  // content 可以是字符串，也可以是多部分数组（用于图片等）
  content: string | null | UserContentPart[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

/**
 * AI SDK v6 格式的内容部分
 * 注意: tool-call 使用 `input` 字段而不是 `args`，这是 @ai-sdk/openai-compatible 的要求
 * 图片使用 image 格式: { type: "image", image: "base64..." 或 URL, mediaType?: "image/xxx" }
 */
export type AISDKContentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: Record<string, any> }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: ToolResultOutput }
  | { type: "reasoning"; text: string }
  | { type: "image"; image: string; mediaType?: string }; // AI SDK 的图片格式

/**
 * 工具结果输出格式 (AI SDK v6 要求)
 */
export type ToolResultOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown }
  | { type: "error-text"; value: string };

/**
 * AI SDK v6 格式的消息
 */
export interface AISDKMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | AISDKContentPart[];
}

/**
 * 日志前缀 (用于调试)
 */
let logPrefix = "[MessageConverter]";

/**
 * 设置日志前缀
 */
export function setLogPrefix(prefix: string): void {
  logPrefix = prefix;
}

/**
 * 将值转换为 AI SDK v6 的 ToolResultOutput 格式
 */
export function toToolResultOutput(value: unknown): ToolResultOutput {
  if (typeof value === "string") {
    // 尝试解析 JSON 字符串
    try {
      const parsed = JSON.parse(value);
      return { type: "json", value: parsed };
    } catch {
      // 纯文本内容
      return { type: "text", value: value };
    }
  }

  if (value === null || value === undefined) {
    return { type: "text", value: "" };
  }

  if (typeof value === "object") {
    // 检查是否已经是正确格式
    const obj = value as Record<string, unknown>;
    if (obj.type === "text" || obj.type === "json" || obj.type === "error-text") {
      return obj as ToolResultOutput;
    }
    // 包装为 JSON 格式
    return { type: "json", value: value };
  }

  // 其他类型转为文本
  return { type: "text", value: String(value) };
}

/**
 * 从消息列表中构建 toolCallId -> toolName 的映射
 */
export function buildToolCallIdToNameMap(messages: OpenAIMessage[]): Record<string, string> {
  const toolCallIdToName: Record<string, string> = {};

  for (const msg of messages) {
    if (msg.role === "assistant") {
      // OpenAI 格式: tool_calls 数组
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.id && tc.function?.name) {
            toolCallIdToName[tc.id] = tc.function.name;
          }
        }
      }
      // AI SDK 格式: content 数组中的 tool-call 对象
      if (Array.isArray(msg.content)) {
        for (const part of msg.content as AISDKContentPart[]) {
          if (part.type === "tool-call" && part.toolCallId && part.toolName) {
            toolCallIdToName[part.toolCallId] = part.toolName;
          }
        }
      }
    }
  }

  return toolCallIdToName;
}

/**
 * 转换 tool 消息为 AI SDK v6 格式
 */
function convertToolMessage(
  msg: OpenAIMessage,
  toolCallIdToName: Record<string, string>
): AISDKMessage {
  // 检查是否已经是 AI SDK 格式（content 是数组）
  if (Array.isArray(msg.content)) {
    // 已经是数组格式，但需要确保 output 是正确格式
    const normalizedContent = (msg.content as any[]).map((part: any) => {
      if (part.type === "tool-result") {
        // 如果有 result 字段但没有 output 字段，进行转换
        if (part.result !== undefined && part.output === undefined) {
          const { result, ...rest } = part;
          return { ...rest, output: toToolResultOutput(result) };
        }
        // 确保 output 是正确格式
        if (part.output !== undefined) {
          const outputObj = part.output as Record<string, unknown>;
          if (!(outputObj.type === "text" || outputObj.type === "json" || outputObj.type === "error-text")) {
            return { ...part, output: toToolResultOutput(part.output) };
          }
        }
      }
      return part;
    });
    return { role: "tool", content: normalizedContent };
  }

  // OpenAI 格式：tool 消息的 content 是字符串
  const toolCallId = msg.tool_call_id!;
  const toolName = toolCallIdToName[toolCallId] || msg.name || "unknown";

  console.log(`${logPrefix} 转换 tool 消息: toolCallId=${toolCallId}, toolName=${toolName}`);

  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName,
        output: toToolResultOutput(msg.content),
      },
    ],
  };
}

/**
 * 转换 assistant 消息为 AI SDK v6 格式
 */
function convertAssistantMessage(msg: OpenAIMessage): AISDKMessage {
  // 检查是否已经是 AI SDK 格式（content 是数组且包含有效的 part）
  if (Array.isArray(msg.content)) {
    const isValidAISDKFormat = (msg.content as any[]).every((part: any) =>
      part.type === "text" ||
      part.type === "tool-call" ||
      part.type === "tool-result" ||
      part.type === "reasoning" ||
      part.type === "image"
    );
    if (isValidAISDKFormat) {
      // 已经是 AI SDK 格式，直接返回
      return msg as AISDKMessage;
    }
  }

  // OpenAI 格式：检查是否有 tool_calls
  if (msg.tool_calls) {
    const parts: AISDKContentPart[] = [];

    // 如果有文本内容，添加 text part
    if (msg.content && typeof msg.content === "string") {
      parts.push({
        type: "text",
        text: msg.content,
      });
    }

    // 添加 tool-call parts
    // 注意: @ai-sdk/openai-compatible 使用 `input` 字段，不是 `args`
    for (const tc of msg.tool_calls) {
      let input = tc.function.arguments as string | Record<string, any>;
      // 安全解析 arguments
      if (typeof input === "string") {
        try {
          input = JSON.parse(input);
        } catch {
          input = {};
        }
      }
      parts.push({
        type: "tool-call",
        toolCallId: tc.id,
        toolName: tc.function.name,
        input: input as Record<string, any>,
      });
    }

    return {
      role: "assistant",
      content: parts,
    };
  }

  // 普通 assistant 消息
  // assistant 消息的 content 应该是字符串
  const assistantContent = typeof msg.content === "string" ? msg.content : (msg.content ? JSON.stringify(msg.content) : "");
  return {
    role: "assistant",
    content: assistantContent,
  };
}

/**
 * 转换用户消息的内容（处理图片）
 */
function convertUserContent(content: string | null | UserContentPart[]): string | AISDKContentPart[] {
  // 字符串或 null，直接返回
  if (content === null || typeof content === "string") {
    return content || "";
  }
  
  // 数组格式，需要转换 image_url 为 AI SDK 的 image 格式
  console.log(`${logPrefix} 检测到多部分消息内容，共 ${content.length} 个部分`);
  
  return content.map((part, index): AISDKContentPart => {
    if (part.type === "text") {
      console.log(`${logPrefix}   [${index}] text: ${part.text.substring(0, 50)}...`);
      return { type: "text", text: part.text };
    }
    if (part.type === "image_url") {
      const imageUrl = part.image_url.url;
      const isBase64 = imageUrl.startsWith("data:image/");
      console.log(`${logPrefix}   [${index}] image_url: ${isBase64 ? `base64 (${imageUrl.length} chars)` : imageUrl.substring(0, 50)}`);
      
      // AI SDK v6 使用 image 格式: { type: "image", image: "base64..." 或 URL, mediaType?: "image/xxx" }
      if (isBase64) {
        // 从 data URL 提取 mediaType 和纯 base64 数据
        // 格式: data:image/png;base64,xxxxx
        const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          const mediaType = match[1];
          const base64Data = match[2];
          // AI SDK 接受纯 base64 字符串或完整的 data URL
          return { type: "image", image: base64Data, mediaType };
        }
        // 如果没有匹配到，尝试直接使用完整的 data URL
        return { type: "image", image: imageUrl, mediaType: "image/png" };
      }
      // 如果是外部 URL，也使用 image 格式
      return { type: "image", image: imageUrl, mediaType: "image/png" };
    }
    // 未知类型，作为文本处理
    console.log(`${logPrefix}   [${index}] unknown type: ${(part as any).type}`);
    return { type: "text", text: JSON.stringify(part) };
  });
}

/**
 * 将 OpenAI 格式消息转换为 AI SDK v6 格式
 *
 * AI SDK v6 要求:
 * - tool 消息的 content 必须是数组格式
 * - tool-result 的 output 必须是 ToolResultOutput 格式
 */
export function convertMessagesToAISDK(messages: OpenAIMessage[]): AISDKMessage[] {
  // 首先构建 toolCallId -> toolName 的映射
  const toolCallIdToName = buildToolCallIdToNameMap(messages);

  return messages.map((msg) => {
    if (msg.role === "tool") {
      return convertToolMessage(msg, toolCallIdToName);
    }

    if (msg.role === "assistant") {
      return convertAssistantMessage(msg);
    }

    // system 和 user 消息：需要转换内容格式（处理图片）
    return {
      role: msg.role,
      content: convertUserContent(msg.content),
    };
  });
}

/**
 * 调试：打印消息格式
 */
export function logMessages(messages: AISDKMessage[], prefix?: string): void {
  const p = prefix || logPrefix;
  console.log(`${p} 消息列表 (共 ${messages.length} 条):`);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const contentPreview = Array.isArray(msg.content)
      ? `[Array(${msg.content.length}): ${(msg.content as AISDKContentPart[]).map((p) => p.type).join(", ")}]`
      : typeof msg.content === "string"
        ? msg.content.substring(0, 100) + (msg.content.length > 100 ? "..." : "")
        : JSON.stringify(msg.content);
    console.log(`${p}   [${i}] role=${msg.role}, content=${contentPreview}`);

    if (msg.role === "tool" && Array.isArray(msg.content)) {
      const firstPart = msg.content[0];
      if (firstPart) {
        console.log(`${p}       tool-result details:`, JSON.stringify(firstPart, null, 2).substring(0, 500));
      }
    }
  }
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  id: string;
  name: string;
  arguments: string;
  status: "completed" | "failed" | "awaiting_confirmation";
  result?: string;
  error?: string;
}

/**
 * 将工具执行结果转换为纯文本格式
 *
 * 避免多次 JSON stringify 导致的转义字符累积问题
 */
export function formatToolResultAsText(
  toolName: string,
  result: string | undefined,
  error?: string
): string {
  if (error) {
    return `[错误] ${error}`;
  }

  if (!result) {
    return "工具执行完成";
  }

  // 尝试解析 JSON 结果
  try {
    const parsed = JSON.parse(result);

    // 对于 read_article 工具，直接输出内容
    if (toolName === "read_article") {
      const parts: string[] = [];
      if (parsed.title) {
        parts.push(`标题: ${parsed.title}`);
      }
      if (parsed.content) {
        parts.push(parsed.content);
      }
      if (parsed.totalLines !== undefined) {
        parts.push(`\n[共 ${parsed.totalLines} 行${parsed.hasMoreAfter ? `，还有 ${parsed.totalLines - parsed.endLine} 行未显示` : ""}]`);
      }
      if (parsed.note) {
        parts.push(`\n注意: ${parsed.note}`);
      }
      return parts.join("\n") || "（空文章）";
    }

    // 其他工具：简单格式化输出
    return Object.entries(parsed)
      .map(([key, value]) => {
        if (typeof value === "object") {
          return `${key}: ${JSON.stringify(value)}`;
        }
        return `${key}: ${value}`;
      })
      .join("\n");
  } catch {
    // 解析失败，使用原始值
    return result;
  }
}

/**
 * 构建工具结果消息（用于继续 AI Loop）
 */
export function buildToolResultMessages(
  toolResults: ToolExecutionResult[]
): OpenAIMessage[] {
  return toolResults.map((tc) => ({
    role: "tool" as const,
    content: formatToolResultAsText(tc.name, tc.result, tc.error),
    tool_call_id: tc.id,
  }));
}

/**
 * 构建 assistant 消息（带工具调用）
 */
export function buildAssistantMessageWithToolCalls(
  content: string,
  toolCalls: Array<{ id: string; name: string; arguments: string }>
): OpenAIMessage {
  return {
    role: "assistant",
    content,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    })),
  };
}
