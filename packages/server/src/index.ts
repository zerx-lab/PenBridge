import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { trpcServer } from "@hono/trpc-server";
import { serveStatic } from "hono/bun";
import { appRouter } from "./trpc/router";
import { initDatabase, AppDataSource } from "./db";
import { schedulerService } from "./services/scheduler";
import { initializeSuperAdmin, cleanupExpiredSessions, validateSession } from "./services/adminAuth";
import { AIProvider, AIModel } from "./entities/AIProvider";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// 前端静态文件目录（Docker 部署时使用）
const PUBLIC_DIR = "public";

const app = new Hono();

// 上传目录路径
const UPLOAD_DIR = "data/uploads";

// CORS - 允许 Electron 应用、开发服务器和生产部署
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // 允许的来源列表
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:3000",
      ];
      
      // file:// 协议的 origin 为 null，Electron 打包后需要允许
      if (!origin || origin === "null") {
        return origin || "*";
      }
      
      // 允许配置的来源
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      
      // 允许同一 IP 的不同端口访问（生产环境部署）
      try {
        const url = new URL(origin);
        // 允许任何 http/https 来源（生产环境可能有不同端口）
        if (url.protocol === "http:" || url.protocol === "https:") {
          return origin;
        }
      } catch {
        // URL 解析失败，拒绝
      }
      
      return null;
    },
    credentials: true,
  })
);

// Health check - 仅在没有前端静态文件时显示 JSON
// 如果有前端，健康检查通过返回 200 的 HTML 页面也可以
app.get("/health", (c) => c.json({ status: "ok", message: "PenBridge Server" }));

// API 根路径
app.get("/api", (c) => c.json({ status: "ok", message: "PenBridge API" }));

// 静态文件服务 - 提供上传的图片访问
app.use("/uploads/*", serveStatic({ root: "./data" }));

// 图片上传 API - 按文章 ID 创建独立目录
app.post("/api/upload/:articleId", async (c) => {
  try {
    const articleId = c.req.param("articleId");

    // 验证文章 ID
    if (!articleId || !/^\d+$/.test(articleId)) {
      return c.json({ error: "无效的文章 ID" }, 400);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "没有上传文件" }, 400);
    }

    // 验证文件类型
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "不支持的文件类型，仅支持 JPG、PNG、GIF、WEBP" }, 400);
    }

    // 限制文件大小（10MB）
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ error: "文件大小超过限制（最大 10MB）" }, 400);
    }

    // 按文章 ID 创建目录
    const articleDir = join(UPLOAD_DIR, articleId);
    if (!existsSync(articleDir)) {
      mkdirSync(articleDir, { recursive: true });
    }

    // 生成文件名
    const ext = file.name.split(".").pop() || "png";
    const fileName = `${randomUUID()}.${ext}`;
    const filePath = join(articleDir, fileName);

    // 读取文件内容并保存
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(filePath, buffer);

    // 返回图片 URL
    const imageUrl = `/uploads/${articleId}/${fileName}`;
    return c.json({ url: imageUrl });
  } catch (error) {
    console.error("图片上传失败:", error);
    return c.json({ error: "图片上传失败" }, 500);
  }
});

// AI 对话测试 API（SSE 流式输出）
app.post("/api/ai/chat", async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  const logPrefix = `[AI Chat ${requestId}]`;
  const timings: { step: string; elapsed: number }[] = [];
  const startTime = Date.now();
  
  const logStep = (step: string) => {
    const elapsed = Date.now() - startTime;
    timings.push({ step, elapsed });
    console.log(`${logPrefix} ${step} (+${elapsed}ms)`);
  };
  
  logStep("请求开始");
  
  try {
    // 验证登录状态
    const authHeader = c.req.header("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    
    if (!token) {
      logStep("错误: 未提供 token");
      return c.json({ error: "未登录" }, 401);
    }
    
    logStep("开始验证 session");
    const session = await validateSession(token);
    logStep("session 验证完成");
    
    if (!session) {
      logStep("错误: session 无效");
      return c.json({ error: "登录已过期" }, 401);
    }

    // 解析请求体
    logStep("开始解析请求体");
    const body = await c.req.json();
    const { providerId, modelId, message } = body;
    logStep(`请求体解析完成: providerId=${providerId}, modelId=${modelId}, messageLength=${message?.length || 0}`);

    if (!providerId || !modelId || !message) {
      logStep("错误: 缺少必要参数");
      return c.json({ error: "缺少必要参数" }, 400);
    }

    // 获取供应商配置
    logStep("开始查询供应商配置");
    const providerRepo = AppDataSource.getRepository(AIProvider);
    const provider = await providerRepo.findOne({
      where: { id: providerId, userId: 1 },
    });
    logStep("供应商配置查询完成");

    if (!provider) {
      logStep("错误: 供应商不存在");
      return c.json({ error: "供应商不存在" }, 404);
    }
    
    // 查询模型配置（获取能力设置）
    logStep("开始查询模型配置");
    const modelRepo = AppDataSource.getRepository(AIModel);
    const modelConfig = await modelRepo.findOne({
      where: { providerId, modelId, userId: 1 },
    });
    logStep("模型配置查询完成");
    
    console.log(`${logPrefix} 供应商: ${provider.name}, API地址: ${provider.baseUrl}`);
    console.log(`${logPrefix} 模型能力配置: ${modelConfig?.capabilities ? JSON.stringify(modelConfig.capabilities) : "无"}`);

    const apiUrl = `${provider.baseUrl}/chat/completions`;
    
    // 获取模型能力配置
    const capabilities = modelConfig?.capabilities;
    const thinkingConfig = capabilities?.thinking;
    const streamingConfig = capabilities?.streaming;
    
    // 构建基础请求体
    const requestBody: Record<string, any> = {
      model: modelId,
      messages: [{ role: "user", content: message }],
      max_tokens: 1024,
      temperature: 0.7,
      // 根据流式输出配置决定是否启用
      stream: streamingConfig?.supported !== false && streamingConfig?.enabled !== false,
    };
    
    // 根据模型的深度思考配置添加相应参数
    if (thinkingConfig?.supported) {
      const apiFormat = thinkingConfig.apiFormat || "standard";
      const thinkingEnabled = thinkingConfig.enabled;
      
      console.log(`${logPrefix} 深度思考配置: apiFormat=${apiFormat}, supported=${thinkingConfig.supported}, enabled=${thinkingEnabled}`);
      
      if (apiFormat === "openai") {
        // OpenAI 专用格式: 使用 reasoning.effort 参数
        // 适用于 OpenAI o1/o3/gpt-5 等推理模型
        if (thinkingEnabled) {
          const reasoningParams: Record<string, any> = {
            effort: thinkingConfig.reasoningEffort || "medium",
          };
          
          // 添加 summary 参数（如果配置了且不是 disabled）
          // OpenAI 不返回原始思维链，但可以返回推理摘要
          const summaryType = thinkingConfig.reasoningSummary;
          if (summaryType && summaryType !== "disabled") {
            reasoningParams.summary = summaryType;
          }
          
          requestBody.reasoning = reasoningParams;
          console.log(`${logPrefix} OpenAI 推理模式: effort=${reasoningParams.effort}, summary=${summaryType || "未设置"}`);
        }
        // OpenAI 不支持显式禁用推理，不设置 reasoning 参数即可
      } else {
        // 标准格式: 使用 thinking.type 参数
        // 适用于智谱 GLM、DeepSeek 等兼容 API
        requestBody.thinking = {
          type: thinkingEnabled ? "enabled" : "disabled",
        };
        console.log(`${logPrefix} 标准深度思考: ${requestBody.thinking.type}`);
      }
    } else {
      console.log(`${logPrefix} 深度思考: 未配置或不支持`);
    }

    // 解析 URL 获取主机名
    const urlObj = new URL(apiUrl);
    const hostname = urlObj.hostname;

    // 先尝试 SSE 流式请求
    try {
      logStep("开始发起流式 API 请求");
      console.log(`${logPrefix} 请求URL: ${apiUrl}`);
      console.log(`${logPrefix} 请求模型: ${modelId}`);
      console.log(`${logPrefix} 目标主机: ${hostname}`);
      
      // 记录 fetch 开始时间
      const fetchStartTime = Date.now();
      
      const streamResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
      
      const fetchDuration = Date.now() - fetchStartTime;
      logStep(`流式 API 响应返回: status=${streamResponse.status}, fetch耗时=${fetchDuration}ms`);

      // 检查响应是否为 SSE 流
      const contentType = streamResponse.headers.get("content-type") || "";
      console.log(`${logPrefix} 响应 Content-Type: ${contentType}`);
      
      const isStream = contentType.includes("text/event-stream") || 
                       contentType.includes("application/octet-stream") ||
                       (streamResponse.ok && streamResponse.body);
      console.log(`${logPrefix} 是否为流式响应: ${isStream}`);

      if (!streamResponse.ok) {
        logStep("流式请求失败，解析错误信息");
        const errorData = await streamResponse.json().catch(() => ({}));
        const errorMessage = (errorData as any).error?.message || 
                            `HTTP ${streamResponse.status}: ${streamResponse.statusText}`;
        logStep(`错误信息: ${errorMessage}`);
        return c.json({ error: errorMessage }, 400);
      }

      if (isStream && streamResponse.body) {
        logStep("开始处理 SSE 流式响应");
        
        // SSE 流式响应
        return streamSSE(c, async (stream) => {
          const reader = streamResponse.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullContent = "";
          let fullReasoning = "";
          let promptTokens = 0;
          let completionTokens = 0;
          let chunkCount = 0;
          let firstChunkTime = 0;
          let isReasoning = false; // 标记当前是否在思考阶段

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                logStep(`流式读取完成: 共 ${chunkCount} 个数据块, 内容长度=${fullContent.length}, 思维链长度=${fullReasoning.length}`);
                break;
              }
              
              chunkCount++;
              if (chunkCount === 1) {
                firstChunkTime = Date.now() - startTime;
                logStep(`收到首个数据块 (首字节延迟: ${firstChunkTime}ms)`);
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine === "data: [DONE]") continue;
                if (!trimmedLine.startsWith("data: ")) continue;

                try {
                  const jsonStr = trimmedLine.slice(6);
                  const data = JSON.parse(jsonStr);
                  const delta = data.choices?.[0]?.delta || {};
                  const content = delta.content || "";
                  // 智谱/DeepSeek 深度思考返回的思维链内容
                  const reasoningContent = delta.reasoning_content || "";
                  
                  // 处理 OpenAI Responses API 格式（output 数组）
                  // OpenAI 的推理模型返回格式: { output: [{ type: "reasoning", summary: [...] }, { type: "message", content: [...] }] }
                  if (data.output && Array.isArray(data.output)) {
                    for (const outputItem of data.output) {
                      // 处理推理摘要
                      if (outputItem.type === "reasoning" && outputItem.summary) {
                        if (!isReasoning) {
                          isReasoning = true;
                          await stream.writeSSE({
                            event: "reasoning_start",
                            data: JSON.stringify({ message: "AI 推理摘要..." }),
                          });
                        }
                        
                        // summary 是一个数组，包含 { type: "summary_text", text: "..." }
                        for (const summaryItem of outputItem.summary) {
                          if (summaryItem.type === "summary_text" && summaryItem.text) {
                            fullReasoning += summaryItem.text;
                            await stream.writeSSE({
                              event: "reasoning",
                              data: JSON.stringify({ content: summaryItem.text, isSummary: true }),
                            });
                          }
                        }
                      }
                      
                      // 处理消息内容
                      if (outputItem.type === "message" && outputItem.content) {
                        if (isReasoning) {
                          isReasoning = false;
                          await stream.writeSSE({
                            event: "reasoning_end",
                            data: JSON.stringify({ message: "推理完成，以下是回答..." }),
                          });
                        }
                        
                        for (const contentItem of outputItem.content) {
                          if (contentItem.type === "output_text" && contentItem.text) {
                            fullContent += contentItem.text;
                            await stream.writeSSE({
                              event: "content",
                              data: JSON.stringify({ content: contentItem.text }),
                            });
                          }
                        }
                      }
                    }
                  }
                  
                  // 处理思维链内容（深度思考模式 - 智谱/DeepSeek 格式）
                  if (reasoningContent) {
                    // 首次收到思维链内容时，发送开始事件
                    if (!isReasoning) {
                      isReasoning = true;
                      await stream.writeSSE({
                        event: "reasoning_start",
                        data: JSON.stringify({ message: "开始深度思考..." }),
                      });
                    }
                    
                    fullReasoning += reasoningContent;
                    await stream.writeSSE({
                      event: "reasoning",
                      data: JSON.stringify({ content: reasoningContent }),
                    });
                  }
                  
                  // 处理正常内容（标准 OpenAI 兼容格式）
                  if (content) {
                    // 如果之前在思考阶段，现在开始输出正文，发送结束事件
                    if (isReasoning) {
                      isReasoning = false;
                      await stream.writeSSE({
                        event: "reasoning_end",
                        data: JSON.stringify({ message: "思考完成，开始回答..." }),
                      });
                    }
                    
                    fullContent += content;
                    await stream.writeSSE({
                      event: "content",
                      data: JSON.stringify({ content }),
                    });
                  }

                  // 获取 usage 信息（某些 API 在流结束时返回）
                  if (data.usage) {
                    promptTokens = data.usage.prompt_tokens || 0;
                    completionTokens = data.usage.completion_tokens || 0;
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }

            // 发送完成事件
            const duration = Date.now() - startTime;
            logStep(`发送完成事件: 总耗时=${duration}ms, 首字节=${firstChunkTime}ms`);
            
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({
                success: true,
                streamSupported: true,
                duration,
                firstChunkTime,
                hasReasoning: fullReasoning.length > 0,
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
              }),
            });
            
            console.log(`${logPrefix} 请求完成 - 总耗时: ${duration}ms, 首字节: ${firstChunkTime}ms, tokens: ${promptTokens}+${completionTokens}, 思维链: ${fullReasoning.length > 0 ? '有' : '无'}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "流处理错误";
            logStep(`流处理错误: ${errorMsg}`);
            console.error(`${logPrefix} 流处理异常:`, error);
            
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: errorMsg }),
            });
          }
        });
      }
    } catch (streamError) {
      // SSE 请求失败，回退到普通请求
      const errorMsg = streamError instanceof Error ? streamError.message : "未知错误";
      logStep(`流式请求异常: ${errorMsg}, 回退到普通请求`);
      console.error(`${logPrefix} 流式请求异常:`, streamError);
    }

    // 回退到普通请求（非流式）
    logStep("开始发起普通（非流式）API 请求");
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        ...requestBody,
        stream: false,
      }),
    });
    
    logStep(`普通 API 响应返回: status=${response.status}`);

    const duration = Date.now() - startTime;

    if (!response.ok) {
      logStep("普通请求失败，解析错误信息");
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as any).error?.message || 
                          `HTTP ${response.status}: ${response.statusText}`;
      logStep(`错误信息: ${errorMessage}`);
      return c.json({ error: errorMessage }, 400);
    }

    logStep("开始解析响应 JSON");
    const data = await response.json();
    logStep("响应 JSON 解析完成");
    
    const content = data.choices?.[0]?.message?.content || "无响应内容";
    const usage = data.usage || {};
    
    console.log(`${logPrefix} 普通请求完成 - 总耗时: ${duration}ms, tokens: ${usage.prompt_tokens || 0}+${usage.completion_tokens || 0}`);

    return c.json({
      success: true,
      streamSupported: false,
      message: "当前模型/供应商不支持流式输出，已使用普通请求",
      response: content,
      duration,
      usage: {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "请求失败";
    logStep(`请求异常: ${errorMsg}`);
    console.error(`${logPrefix} 请求异常:`, error);
    console.log(`${logPrefix} 耗时统计:`, timings);
    
    return c.json({ error: errorMsg }, 500);
  }
});

// AI 连接预热 API（测试连接延迟）
app.post("/api/ai/warmup", async (c) => {
  try {
    const body = await c.req.json();
    const { baseUrl } = body;
    
    if (!baseUrl) {
      return c.json({ error: "缺少 baseUrl 参数" }, 400);
    }
    
    const results: { step: string; duration: number }[] = [];
    const startTime = Date.now();
    
    // 解析 URL
    const urlObj = new URL(baseUrl);
    const hostname = urlObj.hostname;
    results.push({ step: "URL解析", duration: Date.now() - startTime });
    
    // DNS 查询（通过简单的 fetch 触发）
    const dnsStart = Date.now();
    try {
      // 发送一个简单的 HEAD 请求来预热连接
      const testUrl = `${baseUrl}/models`;
      console.log(`[AI Warmup] 测试连接: ${testUrl}`);
      
      const response = await fetch(testUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      results.push({ 
        step: `连接测试 (status=${response.status})`, 
        duration: Date.now() - dnsStart 
      });
    } catch (error) {
      results.push({ 
        step: `连接测试失败: ${error instanceof Error ? error.message : "未知错误"}`, 
        duration: Date.now() - dnsStart 
      });
    }
    
    const totalDuration = Date.now() - startTime;
    
    console.log(`[AI Warmup] ${hostname} 预热完成:`, results);
    
    return c.json({
      success: true,
      hostname,
      totalDuration,
      results,
    });
  } catch (error) {
    console.error("[AI Warmup] 预热失败:", error);
    return c.json({ 
      error: error instanceof Error ? error.message : "预热失败" 
    }, 500);
  }
});

// tRPC - 带上下文（从请求头获取 token）
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: ({ req }) => {
      // 从 Authorization header 获取 token
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;
      return { token };
    },
  })
);

// 前端静态文件服务（生产环境 Docker 部署时使用）
// 检查 public 目录是否存在，如果存在则提供前端静态文件服务
if (existsSync(PUBLIC_DIR)) {
  // 静态资源文件（js, css, 图片等）
  app.use("/*", serveStatic({ root: PUBLIC_DIR }));

  // SPA 回退：所有未匹配的路由返回 index.html
  app.get("*", async (c) => {
    const indexPath = join(PUBLIC_DIR, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
    return c.json({ error: "Not found" }, 404);
  });
}

// 初始化
async function main() {
  // 确保 data 目录存在
  if (!existsSync("data")) {
    mkdirSync("data", { recursive: true });
  }

  // 确保上传目录存在
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  // 初始化数据库
  await initDatabase();

  // 初始化超级管理员账户
  await initializeSuperAdmin();

  // 清理过期的 session
  const cleanedCount = await cleanupExpiredSessions();
  if (cleanedCount > 0) {
    console.log(`已清理 ${cleanedCount} 个过期的登录会话`);
  }

  // 启动定时任务调度器
  schedulerService.start();

  console.log("Server running at http://localhost:3000");
}

main();

export default {
  port: 3000,
  fetch: app.fetch,
  // 增加空闲超时时间，支持长时间的 AI 对话请求（默认 10s -> 120s）
  idleTimeout: 120,
};
