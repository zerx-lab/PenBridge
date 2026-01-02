/**
 * Markdown 转换服务
 * 负责将 Markdown 中的扩展语法根据目标平台进行转换
 */

import { 
  getDirectiveByName,
  getAlignmentDirectiveNames,
} from "@shared/markdown/directives";
import { 
  getPlatformConfig,
  getTransformStrategy,
} from "@shared/markdown/platformConfig";
import type { TransformStrategy } from "@shared/markdown/types";

/**
 * Markdown 转换选项
 */
export interface TransformOptions {
  /** 目标平台 */
  platform: string;
  
  /** 覆盖默认策略 */
  overrideStrategies?: Record<string, TransformStrategy>;
}

/**
 * 转换结果
 */
export interface TransformResult {
  /** 转换后的 Markdown */
  content: string;
  
  /** 转换报告 */
  report: {
    /** 处理的指令数量 */
    processed: number;
    /** 各指令的处理详情 */
    details: Array<{
      name: string;
      strategy: TransformStrategy;
      count: number;
    }>;
  };
}

/**
 * 将 Markdown 内容转换为指定平台兼容的格式
 * 使用正则表达式进行轻量级处理，支持嵌套
 */
export function transformMarkdownForPlatform(
  markdown: string,
  options: TransformOptions
): TransformResult {
  const { platform, overrideStrategies = {} } = options;
  const platformConfig = getPlatformConfig(platform);
  
  // 统计信息
  const stats: Record<string, { strategy: TransformStrategy; count: number }> = {};
  
  let result = markdown;
  const alignmentNames = getAlignmentDirectiveNames();
  
  // 处理每种对齐指令
  for (const directiveName of alignmentNames) {
    const definition = getDirectiveByName(directiveName);
    if (!definition) continue;
    
    // 确定策略
    const strategy = 
      overrideStrategies[directiveName] ||
      getTransformStrategy(platform, directiveName);
    
    // 匹配容器指令: :::name ... :::
    // 使用非贪婪匹配和多行模式
    const containerRegex = new RegExp(
      `^:::${directiveName}\\s*\\n([\\s\\S]*?)^:::[ \\t]*$`,
      "gm"
    );
    
    let matchCount = 0;
    
    result = result.replace(containerRegex, (_match, content: string) => {
      matchCount++;
      
      // 移除内容首尾的空白行，但保留内部格式
      const trimmedContent = content.replace(/^\n+/, "").replace(/\n+$/, "");
      
      switch (strategy) {
        case "keep":
          // 保留原样
          return _match;
          
        case "toHtml":
          // 转换为 HTML（腾讯云场景，但对齐语法是原生支持的，所以实际不会走这里）
          if (platformConfig.supportsHtml) {
            return definition.toHtml(trimmedContent);
          }
          // 如果平台不支持 HTML，回退到纯文本
          return definition.toText(trimmedContent);
          
        case "toText":
          // 转换为纯文本
          return definition.toText(trimmedContent);
          
        case "remove":
        default:
          // 移除指令语法，只保留内容
          return trimmedContent;
      }
    });
    
    if (matchCount > 0) {
      stats[directiveName] = { strategy, count: matchCount };
    }
  }
  
  // 构建报告
  const report = {
    processed: Object.values(stats).reduce((sum, s) => sum + s.count, 0),
    details: Object.entries(stats).map(([name, { strategy, count }]) => ({
      name,
      strategy,
      count,
    })),
  };
  
  return {
    content: result,
    report,
  };
}

/**
 * 检测 Markdown 中是否包含扩展语法
 */
export function detectDirectives(markdown: string): string[] {
  const found: Set<string> = new Set();
  const alignmentNames = getAlignmentDirectiveNames();
  
  for (const name of alignmentNames) {
    // 匹配 :::name
    const regex = new RegExp(`^:::${name}\\s*$`, "m");
    if (regex.test(markdown)) {
      found.add(name);
    }
  }
  
  return Array.from(found);
}

/**
 * 获取内容中使用的扩展语法及其对应的平台兼容性
 */
export function analyzeCompatibility(
  markdown: string,
  platforms: string[]
): {
  directives: string[];
  compatibility: Record<string, Record<string, TransformStrategy>>;
} {
  const directives = detectDirectives(markdown);
  
  const compatibility: Record<string, Record<string, TransformStrategy>> = {};
  
  for (const platform of platforms) {
    compatibility[platform] = {};
    for (const directive of directives) {
      compatibility[platform][directive] = getTransformStrategy(platform, directive);
    }
  }
  
  return { directives, compatibility };
}
