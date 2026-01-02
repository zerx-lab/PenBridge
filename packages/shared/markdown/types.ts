/**
 * Markdown 扩展语法类型定义
 */

/**
 * 扩展语法类型
 */
export type DirectiveType = 
  | "containerDirective"  // :::name
  | "leafDirective"       // ::name
  | "textDirective";      // :name

/**
 * 转换策略
 */
export type TransformStrategy = 
  | "keep"      // 保留原样（平台原生支持）
  | "toHtml"    // 转换为 HTML
  | "toText"    // 提取纯文本
  | "remove";   // 完全移除

/**
 * 扩展语法定义
 */
export interface DirectiveDefinition {
  /** 语法名称，如 "center", "note" */
  name: string;
  
  /** 语法类型 */
  type: DirectiveType;
  
  /** 描述 */
  description: string;
  
  /** 
   * 转换为 HTML 的函数
   * @param content 指令内的内容（已转为 HTML）
   * @param attrs 指令属性
   * @returns HTML 字符串
   */
  toHtml: (content: string, attrs?: Record<string, string>) => string;
  
  /**
   * 转换为纯文本的函数
   * @param content 指令内的内容（纯文本）
   * @param attrs 指令属性
   * @returns 纯文本字符串
   */
  toText: (content: string, attrs?: Record<string, string>) => string;
}

/**
 * 平台语法支持配置
 */
export interface PlatformSyntaxConfig {
  /** 平台标识 */
  platform: string;
  
  /** 平台名称 */
  name: string;
  
  /** 是否支持 HTML */
  supportsHtml: boolean;
  
  /** 各扩展语法的处理策略 */
  strategies: Record<string, TransformStrategy>;
  
  /** 默认策略（未明确配置的语法使用此策略） */
  defaultStrategy: TransformStrategy;
}
