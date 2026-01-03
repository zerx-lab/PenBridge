import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { t, protectedProcedure } from "../shared";
import { AppDataSource } from "../../db";
import { CopilotAuth } from "../../entities/CopilotAuth";
import { AIProvider, AIModel } from "../../entities/AIProvider";
import {
  startDeviceFlowAuth,
  completeDeviceFlowAuth,
  getCopilotToken,
  COPILOT_MODELS,
} from "../../services/githubCopilotAuth";

// 存储正在进行的设备授权流程
const pendingDeviceFlows = new Map<
  number,
  {
    deviceCode: string;
    interval: number;
    enterpriseUrl?: string;
    expiresAt: number;
  }
>();

export const copilotAuthRouter = t.router({
  /**
   * 获取 GitHub Copilot 认证状态
   */
  getStatus: protectedProcedure.query(async () => {
    const repo = AppDataSource.getRepository(CopilotAuth);
    const auth = await repo.findOne({ where: { userId: 1 } });

    if (!auth) {
      return { connected: false };
    }

    // 检查 token 是否过期
    const isExpired = auth.expiresAt < Date.now();

    return {
      connected: true,
      username: auth.username,
      enterpriseUrl: auth.enterpriseUrl,
      isExpired,
      expiresAt: auth.expiresAt,
    };
  }),

  /**
   * 启动 GitHub Copilot 设备授权流程
   */
  startAuth: protectedProcedure
    .input(
      z.object({
        enterpriseUrl: z.string().url().optional(),
      }).optional()
    )
    .mutation(async ({ input }) => {
      try {
        const result = await startDeviceFlowAuth(input?.enterpriseUrl);

        // 存储设备授权信息，用于后续轮询
        pendingDeviceFlows.set(1, {
          deviceCode: result.deviceCode,
          interval: result.interval,
          enterpriseUrl: input?.enterpriseUrl,
          expiresAt: Date.now() + result.expiresIn * 1000,
        });

        return {
          userCode: result.userCode,
          verificationUri: result.verificationUri,
          expiresIn: result.expiresIn,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "启动授权流程失败",
        });
      }
    }),

  /**
   * 完成设备授权（轮询等待用户授权）
   */
  completeAuth: protectedProcedure.mutation(async () => {
    const pendingFlow = pendingDeviceFlows.get(1);

    if (!pendingFlow) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "没有正在进行的授权流程，请先调用 startAuth",
      });
    }

    // 检查是否过期
    if (Date.now() > pendingFlow.expiresAt) {
      pendingDeviceFlows.delete(1);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "授权流程已过期，请重新开始",
      });
    }

    try {
      const authInfo = await completeDeviceFlowAuth(
        pendingFlow.deviceCode,
        pendingFlow.interval,
        pendingFlow.enterpriseUrl
      );

      // 清理待处理的流程
      pendingDeviceFlows.delete(1);

      // 尝试获取 GitHub 用户名
      let username: string | undefined;
      try {
        const userResponse = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${authInfo.refreshToken}`,
            Accept: "application/json",
          },
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          username = userData.login;
        }
      } catch {
        // 获取用户名失败，忽略
      }

      // 保存认证信息到数据库
      const repo = AppDataSource.getRepository(CopilotAuth);
      let auth = await repo.findOne({ where: { userId: 1 } });

      if (auth) {
        // 更新现有记录
        auth.refreshToken = authInfo.refreshToken;
        auth.accessToken = authInfo.accessToken;
        auth.expiresAt = authInfo.expiresAt;
        auth.enterpriseUrl = authInfo.enterpriseUrl;
        auth.username = username;
      } else {
        // 创建新记录
        auth = repo.create({
          userId: 1,
          refreshToken: authInfo.refreshToken,
          accessToken: authInfo.accessToken,
          expiresAt: authInfo.expiresAt,
          enterpriseUrl: authInfo.enterpriseUrl,
          username,
        });
      }

      await repo.save(auth);

      // 自动创建 GitHub Copilot Provider（如果不存在）
      await ensureCopilotProvider(authInfo.enterpriseUrl);

      return {
        success: true,
        username,
      };
    } catch (error) {
      // 如果是授权待定错误，重新抛出特殊状态
      if (
        error instanceof Error &&
        error.message.includes("authorization_pending")
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "等待用户授权中...",
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "完成授权失败",
      });
    }
  }),

  /**
   * 取消正在进行的授权流程
   */
  cancelAuth: protectedProcedure.mutation(async () => {
    pendingDeviceFlows.delete(1);
    return { success: true };
  }),

  /**
   * 刷新 Copilot Token
   */
  refreshToken: protectedProcedure.mutation(async () => {
    const repo = AppDataSource.getRepository(CopilotAuth);
    const auth = await repo.findOne({ where: { userId: 1 } });

    if (!auth) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "未连接 GitHub Copilot",
      });
    }

    try {
      const newToken = await getCopilotToken(
        auth.refreshToken,
        auth.enterpriseUrl
      );

      auth.accessToken = newToken.token;
      auth.expiresAt = newToken.expiresAt;
      await repo.save(auth);

      return {
        success: true,
        expiresAt: newToken.expiresAt,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "刷新 Token 失败",
      });
    }
  }),

  /**
   * 断开 GitHub Copilot 连接
   */
  disconnect: protectedProcedure.mutation(async () => {
    const repo = AppDataSource.getRepository(CopilotAuth);
    await repo.delete({ userId: 1 });

    // 同时删除关联的 Provider 和 Models
    const providerRepo = AppDataSource.getRepository(AIProvider);
    const modelRepo = AppDataSource.getRepository(AIModel);

    const provider = await providerRepo.findOne({
      where: { userId: 1, sdkType: "github-copilot" },
    });

    if (provider) {
      await modelRepo.delete({ providerId: provider.id });
      await providerRepo.delete({ id: provider.id });
    }

    return { success: true };
  }),

  /**
   * 获取 Copilot 支持的模型列表
   */
  getModels: protectedProcedure.query(async () => {
    return COPILOT_MODELS;
  }),

  /**
   * 获取认证信息（用于 AI 调用）
   */
  getAuthInfo: protectedProcedure.query(async () => {
    const repo = AppDataSource.getRepository(CopilotAuth);
    const auth = await repo.findOne({ where: { userId: 1 } });

    if (!auth) {
      return null;
    }

    return {
      refreshToken: auth.refreshToken,
      accessToken: auth.accessToken,
      expiresAt: auth.expiresAt,
      enterpriseUrl: auth.enterpriseUrl,
    };
  }),
});

/**
 * 确保 GitHub Copilot Provider 存在
 */
async function ensureCopilotProvider(enterpriseUrl?: string) {
  const providerRepo = AppDataSource.getRepository(AIProvider);
  const modelRepo = AppDataSource.getRepository(AIModel);

  // 检查是否已存在
  let provider = await providerRepo.findOne({
    where: { userId: 1, sdkType: "github-copilot" },
  });

  if (!provider) {
    // 获取最大排序值
    const maxOrderResult = await providerRepo
      .createQueryBuilder("provider")
      .select("MAX(provider.order)", "maxOrder")
      .where("provider.userId = :userId", { userId: 1 })
      .getRawOne();

    // 创建 Provider
    provider = providerRepo.create({
      userId: 1,
      name: enterpriseUrl ? "GitHub Copilot (Enterprise)" : "GitHub Copilot",
      baseUrl: enterpriseUrl
        ? `https://copilot-api.${enterpriseUrl.replace(/^https?:\/\//, "")}`
        : "https://api.githubcopilot.com",
      apiKey: "", // Copilot 使用 OAuth，不需要 API Key
      sdkType: "github-copilot",
      enabled: true,
      order: (maxOrderResult?.maxOrder ?? -1) + 1,
    });

    await providerRepo.save(provider);

    // 创建所有支持的模型
    for (let i = 0; i < COPILOT_MODELS.length; i++) {
      const m = COPILOT_MODELS[i];
      const model = modelRepo.create({
        userId: 1,
        providerId: provider.id,
        modelId: m.id,
        displayName: m.name,
        isDefault: m.id === "claude-sonnet-4", // Claude Sonnet 4 设为默认
        enabled: true,
        order: i,
        contextLength: m.contextLength,
        capabilities: {
          reasoning: m.reasoning || false,
          streaming: true,
          functionCalling: m.functionCalling,
          vision: m.vision,
        },
        aiLoopConfig: {
          maxLoops: 20,
          unlimited: false,
        },
      });
      await modelRepo.save(model);
    }
  }

  return provider;
}
