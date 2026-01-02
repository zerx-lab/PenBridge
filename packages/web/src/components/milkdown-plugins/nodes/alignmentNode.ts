/**
 * 对齐容器节点
 * 支持 :::left, :::right, :::center, :::justify
 */

import { $node, $inputRule } from "@milkdown/kit/utils";
import { wrappingInputRule } from "@milkdown/kit/prose/inputrules";
import { schemaCtx } from "@milkdown/kit/core";
import type { Node } from "@milkdown/kit/prose/model";

// 对齐类型配置
const alignmentTypes = {
  left: {
    style: "text-align: left",
    class: "directive-left",
  },
  right: {
    style: "text-align: right",
    class: "directive-right",
  },
  center: {
    style: "text-align: center",
    class: "directive-center",
  },
  justify: {
    style: "text-align: justify",
    class: "directive-justify",
  },
} as const;

type AlignmentType = keyof typeof alignmentTypes;

/**
 * 创建对齐节点
 */
function createAlignmentNode(name: AlignmentType) {
  const config = alignmentTypes[name];
  
  return $node(name, () => ({
    group: "block",
    content: "block+",
    defining: true,
    attrs: {},
    
    parseDOM: [
      {
        tag: `div.${config.class}`,
        getAttrs: () => ({}),
      },
    ],
    
    toDOM: (_node: Node): [string, Record<string, string>, number] => [
      "div",
      { 
        class: config.class,
        style: config.style,
      },
      0,  // 内容插槽
    ],
    
    parseMarkdown: {
      match: (node: any) => {
        return node.type === "containerDirective" && node.name === name;
      },
      runner: (state: any, node: any, type: any) => {
        state.openNode(type, {});
        // 处理子节点
        if (node.children && node.children.length > 0) {
          state.next(node.children);
        }
        state.closeNode();
      },
    },
    
    toMarkdown: {
      match: (node: any) => node.type.name === name,
      runner: (state: any, node: any) => {
        state.openNode("containerDirective", undefined, { name });
        // 处理子内容
        state.next(node.content);
        state.closeNode();
      },
    },
  }));
}

// 创建各对齐节点
export const leftNode = createAlignmentNode("left");
export const rightNode = createAlignmentNode("right");
export const centerNode = createAlignmentNode("center");
export const justifyNode = createAlignmentNode("justify");

/**
 * 创建对齐节点的输入规则
 * 当用户在行首输入 :::name 并按空格时，自动创建对应的对齐容器
 */
function createAlignmentInputRule(name: AlignmentType) {
  // 匹配行首的 :::name 后跟空格
  const pattern = new RegExp(`^:::${name}\\s$`);
  
  return $inputRule((ctx) => {
    const schema = ctx.get(schemaCtx);
    const nodeType = schema.nodes[name];
    if (!nodeType) {
      // 如果节点类型不存在，返回一个空规则
      return wrappingInputRule(/(?!)/, schema.nodes.paragraph);
    }
    return wrappingInputRule(pattern, nodeType);
  });
}

// 导出各对齐节点的输入规则
export const leftInputRule = createAlignmentInputRule("left");
export const rightInputRule = createAlignmentInputRule("right");
export const centerInputRule = createAlignmentInputRule("center");
export const justifyInputRule = createAlignmentInputRule("justify");
