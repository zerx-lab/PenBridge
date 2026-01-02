/**
 * 扩展语法注册表
 * 定义所有支持的 Markdown 扩展语法
 */

import type { DirectiveDefinition, DirectiveType } from "./types";

/**
 * 所有扩展语法定义
 */
export const directiveDefinitions: DirectiveDefinition[] = [
  // :::left - 左对齐容器
  {
    name: "left",
    type: "containerDirective",
    description: "左对齐显示内容",
    toHtml: (content) => 
      `<div style="text-align: left">${content}</div>`,
    toText: (content) => content,
  },
  
  // :::right - 右对齐容器
  {
    name: "right",
    type: "containerDirective",
    description: "右对齐显示内容",
    toHtml: (content) => 
      `<div style="text-align: right">${content}</div>`,
    toText: (content) => content,
  },
  
  // :::center - 居中容器
  {
    name: "center",
    type: "containerDirective",
    description: "居中显示内容",
    toHtml: (content) => 
      `<div style="text-align: center">${content}</div>`,
    toText: (content) => content,
  },
  
  // :::justify - 两端对齐容器
  {
    name: "justify",
    type: "containerDirective",
    description: "两端对齐显示内容",
    toHtml: (content) => 
      `<div style="text-align: justify">${content}</div>`,
    toText: (content) => content,
  },
];

/**
 * 按名称查找指令定义
 */
export function getDirectiveByName(name: string): DirectiveDefinition | undefined {
  return directiveDefinitions.find((d) => d.name === name);
}

/**
 * 按类型获取所有指令
 */
export function getDirectivesByType(type: DirectiveType): DirectiveDefinition[] {
  return directiveDefinitions.filter((d) => d.type === type);
}

/**
 * 获取所有对齐相关的指令名称
 */
export function getAlignmentDirectiveNames(): string[] {
  return ["left", "right", "center", "justify"];
}
