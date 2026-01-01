/**
 * 系统提示词模板服务
 * 
 * 对标 OpenCode 的设计模式：
 * - 纯文本模板文件（.md）
 * - 动态拼接不同部分
 * - 使用 XML 标签组织结构化内容
 * - 支持环境信息注入
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

/**
 * 文章上下文接口
 */
export interface ArticleContext {
  title: string;
  contentLength: number;
  articleId: number;
}

/**
 * 工具定义接口
 */
export interface ToolInfo {
  name: string;
  description: string;
}

/**
 * 获取可执行文件或脚本所在目录
 * 
 * 在不同环境下的行为：
 * - 开发环境（bun run）：返回当前脚本所在目录
 * - Bun 编译环境：返回可执行文件所在目录
 * - Docker 环境：返回工作目录
 */
function getExecutableDir(): string {
  // 检测是否是 Bun 编译的可执行文件
  // Bun 编译后，process.execPath 指向可执行文件本身（不包含 "bun"）
  // 在开发环境，process.execPath 指向 bun 运行时（路径中包含 "bun"）
  const execPathLower = process.execPath.toLowerCase();
  const isBunCompiled = !execPathLower.includes("bun") && 
                        !execPathLower.includes(".bun");
  
  if (isBunCompiled) {
    // Bun 编译的可执行文件：使用可执行文件的目录
    return dirname(process.execPath);
  }
  
  // 开发环境：使用 import.meta.url
  try {
    const __filename = fileURLToPath(import.meta.url);
    return dirname(__filename);
  } catch {
    // 回退到工作目录
    return process.cwd();
  }
}

/**
 * 获取 prompts 目录路径
 * 支持多种运行环境：开发、Docker、Electron
 * 
 * 目录结构说明：
 * - 开发环境：packages/server/src/services/ -> ../prompts -> packages/server/src/prompts/
 * - Docker：/app/dist/index.js -> prompts -> /app/prompts/
 * - Electron：electron/server/pen-bridge-server -> prompts -> electron/server/prompts/
 */
function getPromptsDir(): string {
  const execDir = getExecutableDir();
  
  // 可能的路径列表（按优先级）
  const possiblePaths = [
    // 1. 开发环境：相对于当前源文件（services/ -> prompts/）
    resolve(execDir, "../prompts"),
    // 2. 生产环境（Docker/Electron）：可执行文件同级目录
    resolve(execDir, "prompts"),
    // 3. Docker/生产环境：相对于工作目录
    resolve(process.cwd(), "prompts"),
    // 4. Electron 打包环境：server 目录下
    resolve(process.cwd(), "server/prompts"),
    // 5. Electron asar 解包环境
    resolve(process.cwd(), "resources/app.asar.unpacked/server/prompts"),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      console.log(`[SystemPrompt] 找到 prompts 目录: ${p}`);
      return p;
    }
  }

  // 调试信息：列出所有尝试的路径
  console.error(`[SystemPrompt] 无法找到 prompts 目录，尝试了以下路径:`);
  possiblePaths.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
  console.error(`[SystemPrompt] execDir: ${execDir}`);
  console.error(`[SystemPrompt] process.cwd(): ${process.cwd()}`);
  console.error(`[SystemPrompt] process.execPath: ${process.execPath}`);

  // 默认返回生产环境路径（可执行文件同级）
  return possiblePaths[1];
}

/**
 * 系统提示词命名空间
 * 参考 OpenCode 的 SystemPrompt 设计模式
 */
export namespace SystemPrompt {
  // 模板缓存
  const templateCache = new Map<string, string>();

  /**
   * 加载模板文件
   */
  function loadTemplate(templateName: string): string {
    // 检查缓存
    if (templateCache.has(templateName)) {
      return templateCache.get(templateName)!;
    }

    // 构建模板路径
    const promptsDir = getPromptsDir();
    const templatePath = join(promptsDir, `${templateName}.md`);
    
    try {
      const content = readFileSync(templatePath, "utf-8");
      templateCache.set(templateName, content);
      console.log(`[SystemPrompt] 已加载模板: ${templatePath}`);
      return content;
    } catch (error) {
      console.error(`[SystemPrompt] 无法加载模板 ${templateName}:`, error);
      console.error(`[SystemPrompt] 尝试的路径: ${templatePath}`);
      console.error(`[SystemPrompt] prompts 目录: ${promptsDir}`);
      throw new Error(`模板文件不存在: ${templateName}`);
    }
  }

  /**
   * 清除缓存（用于开发时热更新）
   */
  export function clearCache(): void {
    templateCache.clear();
  }

  /**
   * 获取基础系统提示词
   */
  export function base(): string {
    return loadTemplate("system");
  }

  /**
   * 生成文章上下文提示词
   */
  export function articleContext(context: ArticleContext): string {
    return [
      "",
      "# 当前文章上下文",
      "",
      "你正在协助用户编辑一篇文章：",
      "<article-context>",
      `  标题: ${context.title || "无标题"}`,
      `  字数: ${context.contentLength || 0} 字`,
      `  文章ID: ${context.articleId}`,
      "</article-context>",
      "",
    ].join("\n");
  }

  /**
   * 生成工具提示词
   */
  export function tools(toolList: ToolInfo[]): string {
    if (!toolList || toolList.length === 0) {
      return "";
    }

    const toolDescriptions = toolList
      .map(t => `- **${t.name}**: ${t.description}`)
      .join("\n");

    return [
      "",
      "# 可用工具",
      "",
      "你可以使用以下工具来读取和修改文章：",
      "",
      toolDescriptions,
      "",
    ].join("\n");
  }

  /**
   * 生成环境信息提示词
   */
  export function environment(): string {
    return [
      "",
      "<env>",
      `  平台: PenBridge 写作助手`,
      `  当前时间: ${new Date().toLocaleString("zh-CN")}`,
      "</env>",
      "",
    ].join("\n");
  }

  /**
   * 生成用户自定义指令提示词
   */
  export function customInstructions(instructions: string): string {
    if (!instructions || !instructions.trim()) {
      return "";
    }

    return [
      "",
      "# 用户自定义指令",
      "",
      instructions.trim(),
      "",
    ].join("\n");
  }

  /**
   * 组装完整的系统提示词
   * 
   * @param options 配置选项
   * @returns 完整的系统提示词
   */
  export function build(options: {
    articleContext?: ArticleContext;
    tools?: ToolInfo[];
    customInstructions?: string;
    includeEnvironment?: boolean;
  }): string {
    const parts: string[] = [];

    // 1. 基础提示词
    parts.push(base());

    // 2. 环境信息（可选）
    if (options.includeEnvironment) {
      parts.push(environment());
    }

    // 3. 文章上下文
    if (options.articleContext) {
      parts.push(articleContext(options.articleContext));
    }

    // 4. 工具列表
    if (options.tools && options.tools.length > 0) {
      parts.push(tools(options.tools));
    }

    // 5. 用户自定义指令
    if (options.customInstructions) {
      parts.push(customInstructions(options.customInstructions));
    }

    // 组装并清理多余空行
    return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
}

/**
 * 便捷函数：构建系统提示词
 */
export function buildSystemPrompt(options: {
  articleContext?: ArticleContext;
  tools?: ToolInfo[];
  customInstructions?: string;
  includeEnvironment?: boolean;
}): string {
  return SystemPrompt.build(options);
}

/**
 * 便捷函数：清除模板缓存
 */
export function clearPromptCache(): void {
  SystemPrompt.clearCache();
}
