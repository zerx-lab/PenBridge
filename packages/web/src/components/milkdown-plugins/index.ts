/**
 * Milkdown 插件集合
 * 包含 remark-directive 和自定义节点
 */

import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { remarkDirectivePlugin } from "./remarkDirective";
import { 
  leftNode, 
  rightNode, 
  centerNode, 
  justifyNode,
  leftInputRule,
  rightInputRule,
  centerInputRule,
  justifyInputRule,
} from "./nodes/alignmentNode";
import {
  fallbackContainerDirective,
  fallbackLeafDirective,
  fallbackTextDirective,
} from "./nodes/fallbackDirective";

/**
 * 所有 directive 插件的集合
 * 包括对齐语法支持和 fallback 处理
 */
export const directivePlugins: MilkdownPlugin[] = [
  remarkDirectivePlugin,  // 必须首先注册 remark-directive
  // 对齐节点（优先匹配）
  leftNode,
  rightNode,
  centerNode,
  justifyNode,
  // Fallback 节点（处理未知的 directive，必须在特定节点之后注册）
  fallbackContainerDirective,
  fallbackLeafDirective,
  fallbackTextDirective,
  // 输入规则：当用户输入 :::name 后按空格时自动创建对齐容器
  leftInputRule,
  rightInputRule,
  centerInputRule,
  justifyInputRule,
].flat();

// 导出单个插件供按需使用
export { remarkDirectivePlugin } from "./remarkDirective";
export { 
  leftNode, 
  rightNode, 
  centerNode, 
  justifyNode,
  leftInputRule,
  rightInputRule,
  centerInputRule,
  justifyInputRule,
} from "./nodes/alignmentNode";
export {
  fallbackContainerDirective,
  fallbackLeafDirective,
  fallbackTextDirective,
} from "./nodes/fallbackDirective";

// 导出布局工具栏相关
export { buildLayoutToolbar, alignmentConfigs, ALIGNMENT_NAMES } from "./layoutToolbar";
export type { AlignmentType, ToolbarBuilder, ToolbarGroupBuilder, ToolbarItem } from "./layoutToolbar";

// 导出图片布局工具栏
export { imageLayoutToolbarPlugin, registerImageLayoutToolbar } from "./imageLayoutToolbar";
