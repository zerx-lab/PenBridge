import { z } from "zod";
import * as path from "path";
import { TRPCError } from "@trpc/server";
import { t, protectedProcedure } from "../shared";
import { AppDataSource } from "../../db";
import { Article } from "../../entities/Article";
import { getCsdnCookies } from "../../services/csdnAuth";
import { createCsdnApiClient, createCsdnRiskChecker } from "../../services/csdnApi";
import { transformMarkdownForPlatform } from "../../services/markdownTransformer";
import { processArticleImages, hasImagesToUpload } from "../../services/imageUpload";
import { getDataDir } from "../../services/dataDir";

// 获取上传目录
const UPLOAD_DIR = path.join(getDataDir(), "uploads");

// CSDN 相关路由
export const csdnRouter = t.router({
  // 检查风险状态（微信验证）
  checkRisk: protectedProcedure.query(async () => {
    const cookies = await getCsdnCookies();
    if (!cookies) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "请先登录 CSDN 账号",
      });
    }

    try {
      const riskChecker = createCsdnRiskChecker(cookies);
      const result = await riskChecker.checkRisk();
      return result;
    } catch (error) {
      console.error("[CSDN] 风险检查失败:", error);
      // 出错时返回不需要验证，让发布流程继续
      return {
        needVerify: false,
      };
    }
  }),

  // 获取推荐标签
  getRecommendTags: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .query(async ({ input }) => {
      const cookies = await getCsdnCookies();
      if (!cookies) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先登录 CSDN 账号",
        });
      }

      const client = createCsdnApiClient(cookies);
      const tags = await client.getRecommendTags(input.title, input.content);
      return tags;
    }),

  // 搜索标签（实时搜索）
  searchTags: protectedProcedure
    .input(
      z.object({
        keyword: z.string(),
      })
    )
    .query(async ({ input }) => {
      const cookies = await getCsdnCookies();
      if (!cookies) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先登录 CSDN 账号",
        });
      }

      const client = createCsdnApiClient(cookies);
      const tags = await client.searchTags(input.keyword);
      return tags;
    }),

  // 保存 CSDN 发布配置
  saveConfig: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        tags: z.array(z.string()),
        description: z.string(),
        type: z.enum(["original", "repost", "translated"]),
        readType: z.enum(["public", "private", "fans", "vip"]),
      })
    )
    .mutation(async ({ input }) => {
      const articleRepo = AppDataSource.getRepository(Article);
      const article = await articleRepo.findOne({ where: { id: input.id } });

      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      article.csdnTags = input.tags;
      article.csdnDescription = input.description;
      article.csdnType = input.type;
      article.csdnReadType = input.readType;

      await articleRepo.save(article);

      return { success: true };
    }),

  // 发布文章到 CSDN
  publish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const cookies = await getCsdnCookies();
      if (!cookies) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先登录 CSDN 账号",
        });
      }

      const articleRepo = AppDataSource.getRepository(Article);
      const article = await articleRepo.findOne({ where: { id: input.id } });

      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      // 验证必填字段
      if (!article.title || article.title.length < 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文章标题至少需要5个字符",
        });
      }

      if (article.title.length > 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文章标题不能超过100个字符",
        });
      }

      if (!article.content || article.content.length < 50) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文章内容至少需要50个字符",
        });
      }

      try {
        const client = createCsdnApiClient(cookies);

        console.log("[CSDN] 开始发布文章:", {
          articleId: article.id,
          title: article.title,
          tags: article.csdnTags,
          existingCsdnId: article.csdnArticleId || "无",
        });

        // 先转换 Markdown，移除平台不支持的扩展语法
        const transformResult = transformMarkdownForPlatform(
          article.content,
          { platform: "csdn" }
        );
        let contentToPublish = transformResult.content;

        // 记录转换结果
        if (transformResult.report.processed > 0) {
          console.log(`[CSDN] 转换了 ${transformResult.report.processed} 个扩展语法节点:`, transformResult.report.details);
        } else {
          console.log("[CSDN] 未检测到需要转换的扩展语法");
        }

        // 检测并上传图片到 CSDN
        if (hasImagesToUpload(contentToPublish, "csdn")) {
          console.log("[CSDN] 检测到需要上传的图片，开始处理...");
          const { content: processedContent, results } = await processArticleImages(
            contentToPublish,
            client,
            UPLOAD_DIR,
            "csdn"
          );
          contentToPublish = processedContent;

          const successCount = results.filter((r) => r.success).length;
          console.log(`[CSDN] 图片上传完成: ${successCount}/${results.length} 成功`);

          // 如果有图片上传失败，阻止发布（避免发布包含无效图片的文章）
          const failedImages = results.filter((r) => !r.success);
          if (failedImages.length > 0) {
            console.error("[CSDN] 图片上传失败，阻止发布:", failedImages.map((r) => r.error));
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `图片上传失败 (${failedImages.length}/${results.length})，请检查网络连接或重新登录 CSDN 后重试`,
            });
          }
        }

        // 将 Markdown 转换为 HTML
        const htmlContent = client.markdownToHtml(contentToPublish);

        // 发布文章（带重试机制，处理 CSDN 临时性安全检查）
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;
        let result: { id: number; url: string; title: string; qrcode: string } | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await client.publishArticle({
              articleId: article.csdnArticleId,
              title: article.title,
              markdownContent: contentToPublish,
              htmlContent,
              tags: article.csdnTags || [],
              description: article.csdnDescription || "",
              type: (article.csdnType as "original" | "repost" | "translated") || "original",
              readType: (article.csdnReadType as "public" | "private" | "fans" | "vip") || "public",
            });
            // 发布成功，跳出重试循环
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const isWechatVerifyError = lastError.message.includes("微信扫码") || 
                                        lastError.message.includes("请使用已绑定的微信");
            
            if (isWechatVerifyError && attempt < MAX_RETRIES) {
              // CSDN 临时性安全检查，等待后重试
              console.log(`[CSDN] 遇到临时安全检查，等待后重试 (${attempt}/${MAX_RETRIES})...`);
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
              // 非微信验证错误或已达最大重试次数，直接抛出
              throw lastError;
            }
          }
        }

        if (!result) {
          throw lastError || new Error("发布失败");
        }

        // 更新文章状态
        article.csdnArticleId = String(result.id);
        article.csdnArticleUrl = result.url;
        article.csdnStatus = "published";
        article.csdnLastSyncedAt = new Date();

        await articleRepo.save(article);

        console.log("[CSDN] 发布成功:", {
          articleId: result.id,
          url: result.url,
        });

        return {
          success: true,
          message: "发布成功",
          articleId: String(result.id),
          articleUrl: result.url,
        };
      } catch (error) {
        // 详细记录错误日志
        console.error("[CSDN] 发布失败，详细信息:", {
          articleId: article.id,
          title: article.title,
          tags: article.csdnTags,
          contentLength: article.content?.length,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : error,
        });

        // 更新错误状态
        article.errorMessage = error instanceof Error ? error.message : "发布失败";
        await articleRepo.save(article);

        // 返回用户友好的错误消息
        let userMessage = "发布失败";
        let errorCode: "INTERNAL_SERVER_ERROR" | "PRECONDITION_FAILED" = "INTERNAL_SERVER_ERROR";
        
        if (error instanceof Error) {
          const msg = error.message;
          if (msg.includes("登录") || msg.includes("401")) {
            userMessage = "CSDN 登录已过期，请重新登录";
          } else if (msg.includes("频繁")) {
            userMessage = "操作过于频繁，请稍后再试";
          } else if (msg.includes("微信扫码") || msg.includes("请使用已绑定的微信扫码")) {
            // 需要微信验证，返回特定错误码让前端处理
            userMessage = "WECHAT_VERIFY_REQUIRED";
            errorCode = "PRECONDITION_FAILED";
          } else {
            userMessage = msg;
          }
        }

        throw new TRPCError({
          code: errorCode,
          message: userMessage,
        });
      }
    }),

  // 同步文章到 CSDN 草稿
  syncToDraft: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const cookies = await getCsdnCookies();
      if (!cookies) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先登录 CSDN 账号",
        });
      }

      const articleRepo = AppDataSource.getRepository(Article);
      const article = await articleRepo.findOne({ where: { id: input.id } });

      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      try {
        const client = createCsdnApiClient(cookies);

        // 先转换 Markdown
        const transformResult = transformMarkdownForPlatform(
          article.content,
          { platform: "csdn" }
        );
        let contentToSync = transformResult.content;

        // 记录转换结果
        if (transformResult.report.processed > 0) {
          console.log(`[CSDN] 同步草稿: 转换了 ${transformResult.report.processed} 个扩展语法节点:`, transformResult.report.details);
        }

        // 检测并上传图片到 CSDN
        if (hasImagesToUpload(contentToSync, "csdn")) {
          console.log("[CSDN] 同步草稿: 检测到需要上传的图片，开始处理...");
          const { content: processedContent, results } = await processArticleImages(
            contentToSync,
            client,
            UPLOAD_DIR,
            "csdn"
          );
          contentToSync = processedContent;

          const successCount = results.filter((r) => r.success).length;
          console.log(`[CSDN] 同步草稿: 图片上传完成: ${successCount}/${results.length} 成功`);

          // 如果有图片上传失败，阻止同步（避免同步包含无效图片的文章）
          const failedImages = results.filter((r) => !r.success);
          if (failedImages.length > 0) {
            console.error("[CSDN] 同步草稿: 图片上传失败，阻止同步:", failedImages.map((r) => r.error));
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `图片上传失败 (${failedImages.length}/${results.length})，请检查网络连接或重新登录 CSDN 后重试`,
            });
          }
        }

        // 将 Markdown 转换为 HTML
        const htmlContent = client.markdownToHtml(contentToSync);

        // 保存为草稿
        const result = await client.saveDraft({
          articleId: article.csdnArticleId,
          title: article.title,
          markdownContent: contentToSync,
          htmlContent,
          tags: article.csdnTags || [],
          description: article.csdnDescription || "",
          type: (article.csdnType as "original" | "repost" | "translated") || "original",
          readType: (article.csdnReadType as "public" | "private" | "fans" | "vip") || "public",
        });

        // 更新文章状态
        article.csdnArticleId = String(result.id);
        article.csdnStatus = "draft";
        article.csdnLastSyncedAt = new Date();

        await articleRepo.save(article);

        return {
          success: true,
          message: "草稿同步成功",
          articleId: String(result.id),
        };
      } catch (error) {
        console.error("[CSDN] 同步草稿失败:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "同步失败",
        });
      }
    }),

  // 获取文章的 CSDN 发布状态
  getArticleStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const articleRepo = AppDataSource.getRepository(Article);
      const article = await articleRepo.findOne({ where: { id: input.id } });

      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      return {
        csdnArticleId: article.csdnArticleId,
        csdnArticleUrl: article.csdnArticleUrl,
        csdnTags: article.csdnTags,
        csdnDescription: article.csdnDescription,
        csdnType: article.csdnType,
        csdnReadType: article.csdnReadType,
        csdnStatus: article.csdnStatus,
        csdnLastSyncedAt: article.csdnLastSyncedAt,
      };
    }),

  // 同步本地文章与 CSDN 文章状态
  syncArticleStatus: protectedProcedure.mutation(async () => {
    const cookies = await getCsdnCookies();
    if (!cookies) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "请先登录 CSDN 账号",
      });
    }

    try {
      const client = createCsdnApiClient(cookies);
      const articleRepo = AppDataSource.getRepository(Article);

      // 获取 CSDN 上的所有文章（分页获取）
      const allCsdnArticles: Array<{
        articleId: string;
        title: string;
        status: string;
        postTime: string;
      }> = [];

      let page = 1;
      const pageSize = 50;
      while (true) {
        const articles = await client.fetchUserArticles({
          status: "all_v3",
          page,
          pageSize,
        });
        if (articles.length === 0) break;
        allCsdnArticles.push(...articles);
        if (articles.length < pageSize) break;
        page++;
        // 防止无限循环
        if (page > 20) break;
      }

      // 获取本地所有文章
      const localArticles = await articleRepo.find({
        where: { userId: 1 },
        order: { createdAt: "DESC" },
      });

      let syncedCount = 0;
      let matchedCount = 0;
      const updates: Array<{ id: number; status: string; articleId: string; matchType?: string }> = [];

      // 辅助函数：根据 CSDN 状态获取本地状态
      const getLocalStatus = (csdnStatus: string): string => {
        // CSDN status: "1"-已发布, "2"-草稿
        switch (csdnStatus) {
          case "1":
            return "published";
          case "2":
            return "draft";
          default:
            return "draft";
        }
      };

      for (const local of localArticles) {
        let csdnArticle: typeof allCsdnArticles[0] | undefined;
        let matchType: "id" | "title" | undefined;

        // 优先通过 csdnArticleId 匹配
        if (local.csdnArticleId) {
          csdnArticle = allCsdnArticles.find(
            (a) => a.articleId === local.csdnArticleId
          );
          if (csdnArticle) {
            matchType = "id";
          }
        }

        // 如果没有通过 ID 匹配，尝试通过标题匹配
        if (!csdnArticle) {
          csdnArticle = allCsdnArticles.find(
            (a) => a.title.trim() === local.title.trim()
          );
          if (csdnArticle) {
            matchType = "title";
            console.log(`[CSDN] 通过标题匹配到文章: "${local.title}" -> ${csdnArticle.articleId}`);
          }
        }

        if (csdnArticle) {
          matchedCount++;
          const newStatus = getLocalStatus(csdnArticle.status);
          const oldStatus = local.csdnStatus;

          // 更新 CSDN 文章ID（如果是通过标题匹配的，需要保存ID）
          const needsIdUpdate = !local.csdnArticleId || local.csdnArticleId !== csdnArticle.articleId;
          const needsStatusUpdate = local.csdnStatus !== newStatus;

          if (needsIdUpdate || needsStatusUpdate) {
            local.csdnArticleId = csdnArticle.articleId;
            local.csdnStatus = newStatus;
            local.csdnArticleUrl = `https://blog.csdn.net/${client["cookies"].UserName}/article/details/${csdnArticle.articleId}`;
            local.csdnLastSyncedAt = new Date();

            await articleRepo.save(local);
            syncedCount++;
            updates.push({
              id: local.id,
              status: newStatus,
              articleId: csdnArticle.articleId,
              matchType,
            });

            console.log(`[CSDN] 更新文章状态: ${local.id} (${local.title}), ${oldStatus} -> ${newStatus}, 匹配方式: ${matchType}`);
          }
        } else {
          // 没有在 CSDN 上找到匹配的文章，如果本地有 CSDN 状态，需要重置
          if (local.csdnStatus || local.csdnArticleId) {
            const oldStatus = local.csdnStatus;
            const oldArticleId = local.csdnArticleId;

            // 重置 CSDN 相关状态，使用 null 确保数据库中的值被清除
            local.csdnArticleId = null as any;
            local.csdnArticleUrl = null as any;
            local.csdnStatus = null as any;
            local.csdnLastSyncedAt = new Date();

            await articleRepo.save(local);
            syncedCount++;
            updates.push({
              id: local.id,
              status: "reset",
              articleId: oldArticleId || "",
              matchType: undefined,
            });

            console.log(`[CSDN] 重置文章状态: ${local.id} (${local.title}), ${oldStatus} -> 未发布 (CSDN上未找到匹配文章)`);
          }
        }
      }

      console.log(`[CSDN] 同步完成: 匹配 ${matchedCount} 篇, 更新 ${syncedCount} 篇`);

      return {
        success: true,
        message: `同步完成: ${matchedCount}/${localArticles.length} 篇文章匹配成功，${syncedCount} 篇状态有更新`,
        matchedCount,
        syncedCount,
        totalLocal: localArticles.length,
        totalCsdn: allCsdnArticles.length,
        updates,
      };
    } catch (error) {
      console.error("[CSDN] 同步状态失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "同步失败",
      });
    }
  }),
});
