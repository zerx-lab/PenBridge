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

/**
 * 所有 directive 插件的集合
 * 包括对齐语法支持
 */
export const directivePlugins: MilkdownPlugin[] = [
  remarkDirectivePlugin,  // 必须首先注册 remark-directive
  leftNode,
  rightNode,
  centerNode,
  justifyNode,
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
