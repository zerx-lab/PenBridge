/**
 * Fallback directive 节点
 * 用于处理所有未被其他节点匹配的 directive 语法
 * 防止 parserMatchError
 */

import { $node } from "@milkdown/kit/utils";
import type { Node } from "@milkdown/kit/prose/model";

// 已知的对齐类型，这些由专门的节点处理
const knownContainerDirectives = new Set(["left", "right", "center", "justify"]);

/**
 * 通用容器 directive 节点 (:::name)
 * 处理所有未知的 containerDirective，将其渲染为普通 div
 */
export const fallbackContainerDirective = $node("fallbackContainerDirective", () => ({
  group: "block",
  content: "block+",
  defining: true,
  attrs: {
    name: { default: "" },
  },
  
  parseDOM: [
    {
      tag: "div.directive-fallback",
      getAttrs: (dom: HTMLElement) => ({
        name: dom.getAttribute("data-directive-name") || "",
      }),
    },
  ],
  
  toDOM: (node: Node): [string, Record<string, string>, number] => [
    "div",
    { 
      class: "directive-fallback",
      "data-directive-name": node.attrs.name as string,
    },
    0,
  ],
  
  parseMarkdown: {
    match: (node: any) => {
      // 匹配所有未知的 containerDirective
      return node.type === "containerDirective" && !knownContainerDirectives.has(node.name);
    },
    runner: (state: any, node: any, type: any) => {
      state.openNode(type, { name: node.name });
      if (node.children && node.children.length > 0) {
        state.next(node.children);
      }
      state.closeNode();
    },
  },
  
  toMarkdown: {
    match: (node: any) => node.type.name === "fallbackContainerDirective",
    runner: (state: any, node: any) => {
      const name = node.attrs.name || "unknown";
      state.openNode("containerDirective", undefined, { name });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

/**
 * 通用叶子 directive 节点 (::name)
 * 处理所有未知的 leafDirective，将其渲染为 span
 */
export const fallbackLeafDirective = $node("fallbackLeafDirective", () => ({
  group: "block",
  atom: true,
  attrs: {
    name: { default: "" },
  },
  
  parseDOM: [
    {
      tag: "span.directive-leaf-fallback",
      getAttrs: (dom: HTMLElement) => ({
        name: dom.getAttribute("data-directive-name") || "",
      }),
    },
  ],
  
  toDOM: (node: Node): [string, Record<string, string>] => [
    "span",
    { 
      class: "directive-leaf-fallback",
      "data-directive-name": node.attrs.name as string,
    },
  ],
  
  parseMarkdown: {
    match: (node: any) => node.type === "leafDirective",
    runner: (state: any, node: any, type: any) => {
      state.addNode(type, { name: node.name });
    },
  },
  
  toMarkdown: {
    match: (node: any) => node.type.name === "fallbackLeafDirective",
    runner: (state: any, node: any) => {
      const name = node.attrs.name || "unknown";
      state.addNode("leafDirective", undefined, undefined, { name });
    },
  },
}));

/**
 * 通用文本 directive 节点 (:name)
 * 处理所有未知的 textDirective，将其渲染为 span
 */
export const fallbackTextDirective = $node("fallbackTextDirective", () => ({
  group: "inline",
  inline: true,
  atom: true,
  attrs: {
    name: { default: "" },
    text: { default: "" },
  },
  
  parseDOM: [
    {
      tag: "span.directive-text-fallback",
      getAttrs: (dom: HTMLElement) => ({
        name: dom.getAttribute("data-directive-name") || "",
        text: dom.textContent || "",
      }),
    },
  ],
  
  toDOM: (node: Node): [string, Record<string, string>, string] => [
    "span",
    { 
      class: "directive-text-fallback",
      "data-directive-name": node.attrs.name as string,
    },
    node.attrs.text as string,
  ],
  
  parseMarkdown: {
    match: (node: any) => node.type === "textDirective",
    runner: (state: any, node: any, type: any) => {
      // 提取文本内容
      let text = "";
      if (node.children && node.children.length > 0) {
        text = node.children
          .filter((child: any) => child.type === "text")
          .map((child: any) => child.value)
          .join("");
      }
      state.addNode(type, { name: node.name, text });
    },
  },
  
  toMarkdown: {
    match: (node: any) => node.type.name === "fallbackTextDirective",
    runner: (state: any, node: any) => {
      const name = node.attrs.name || "unknown";
      const text = node.attrs.text || "";
      // 输出为文本形式 :name[text]
      state.addNode("textDirective", undefined, undefined, { name, children: [{ type: "text", value: text }] });
    },
  },
}));
