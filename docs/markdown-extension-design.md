# Markdown 扩展语法系统设计文档

## 一、背景与需求

### 1.1 问题描述

PenBridge 支持将文章发布到多个平台（腾讯云开发者社区、掘金等），但各平台对 Markdown 扩展语法的支持程度不一致：

| 语法 | 腾讯云 | 掘金 | 标准 Markdown |
|------|--------|------|---------------|
| GFM 表格 | ✅ | ✅ | ❌ |
| 代码高亮 | ✅ | ✅ | ❌ |
| :::container | ❌ | ❌ | ❌ |
| ::leafDirective | ❌ | ❌ | ❌ |
| :textDirective | ❌ | ❌ | ❌ |

如果在编辑器中使用了扩展语法，发布到不支持的平台时会显示原始语法文本，影响阅读体验。

### 1.2 设计目标

1. **编辑器扩展性**：支持 `remark-directive` 语法，方便后续添加自定义块
2. **平台独立性**：扩展语法定义与平台处理逻辑完全解耦
3. **发布兼容性**：发布前根据目标平台自动转换或移除不支持的语法
4. **可配置性**：用户可选择各平台的转换策略（转换为 HTML / 保留原文 / 移除）

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           编辑器层                                   │
├─────────────────────────────────────────────────────────────────────┤
│  MilkdownEditor                                                     │
│  ├── remark-directive (解析 :::, ::, : 语法)                        │
│  └── DirectivePlugin (自定义节点渲染)                                │
│       ├── CenterNode (:::center)                                    │
│       ├── NoteNode (:::note, :::warning, :::tip)                   │
│       └── ... 其他扩展节点                                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ 存储 Markdown（含扩展语法）
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           存储层                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Article.content: string                                            │
│  - 保存原始 Markdown（包含所有扩展语法）                              │
│  - 图片使用相对路径 /uploads/{articleId}/{filename}                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ 发布时处理
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         发布处理层                                   │
├─────────────────────────────────────────────────────────────────────┤
│  MarkdownTransformer                                                │
│  ├── 读取平台配置 (PlatformSyntaxConfig)                            │
│  ├── 解析 Markdown AST                                              │
│  ├── 遍历扩展语法节点                                                │
│  │   ├── 支持 → 保留原样                                            │
│  │   ├── 可转换 → 转换为 HTML                                       │
│  │   └── 不支持 → 移除或保留纯文本                                   │
│  └── 序列化为目标 Markdown                                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         平台 API 层                                  │
├─────────────────────────────────────────────────────────────────────┤
│  TencentApiClient / JuejinApiClient / ...                           │
│  - 接收处理后的 Markdown                                             │
│  - 处理图片上传                                                      │
│  - 调用平台 API 发布                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块划分

```
packages/
├── shared/
│   └── markdown/
│       ├── types.ts              # 扩展语法类型定义
│       ├── directives.ts         # 扩展语法注册表
│       └── platformConfig.ts     # 平台语法支持配置
│
├── server/
│   └── src/
│       └── services/
│           └── markdownTransformer.ts  # Markdown 转换服务
│
└── web/
    └── src/
        └── components/
            └── milkdown-plugins/
                ├── index.ts              # 插件导出
                ├── remarkDirective.ts    # remark-directive 集成
                └── nodes/
                    ├── centerNode.ts     # :::center 节点
                    ├── noteNode.ts       # :::note 节点
                    └── ...
```

---

## 三、扩展语法定义

### 3.1 类型定义

```typescript
// packages/shared/markdown/types.ts

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
```

### 3.2 扩展语法注册表

```typescript
// packages/shared/markdown/directives.ts

import type { DirectiveDefinition } from "./types";

/**
 * 所有扩展语法定义
 */
export const directiveDefinitions: DirectiveDefinition[] = [
  // :::center - 居中容器
  {
    name: "center",
    type: "containerDirective",
    description: "居中显示内容",
    toHtml: (content) => 
      `<div style="text-align: center">${content}</div>`,
    toText: (content) => content,
  },
  
  // :::note - 提示块
  {
    name: "note",
    type: "containerDirective",
    description: "提示信息块",
    toHtml: (content, attrs) => {
      const type = attrs?.type || "info";
      const colors: Record<string, string> = {
        info: "#1890ff",
        warning: "#faad14",
        danger: "#ff4d4f",
        success: "#52c41a",
      };
      const bgColors: Record<string, string> = {
        info: "#e6f7ff",
        warning: "#fffbe6",
        danger: "#fff2f0",
        success: "#f6ffed",
      };
      return `<div style="padding: 12px 16px; border-left: 4px solid ${colors[type] || colors.info}; background: ${bgColors[type] || bgColors.info}; margin: 16px 0;">${content}</div>`;
    },
    toText: (content) => `[提示] ${content}`,
  },
  
  // :::warning - 警告块（note 的快捷方式）
  {
    name: "warning",
    type: "containerDirective",
    description: "警告信息块",
    toHtml: (content) => 
      `<div style="padding: 12px 16px; border-left: 4px solid #faad14; background: #fffbe6; margin: 16px 0;">${content}</div>`,
    toText: (content) => `[警告] ${content}`,
  },
  
  // :::tip - 提示块
  {
    name: "tip",
    type: "containerDirective",
    description: "小贴士块",
    toHtml: (content) => 
      `<div style="padding: 12px 16px; border-left: 4px solid #52c41a; background: #f6ffed; margin: 16px 0;">${content}</div>`,
    toText: (content) => `[提示] ${content}`,
  },
  
  // :::danger - 危险块
  {
    name: "danger",
    type: "containerDirective",
    description: "危险警告块",
    toHtml: (content) => 
      `<div style="padding: 12px 16px; border-left: 4px solid #ff4d4f; background: #fff2f0; margin: 16px 0;">${content}</div>`,
    toText: (content) => `[危险] ${content}`,
  },
  
  // :::details - 折叠块
  {
    name: "details",
    type: "containerDirective",
    description: "可折叠内容块",
    toHtml: (content, attrs) => {
      const summary = attrs?.title || "点击展开";
      return `<details><summary>${summary}</summary>${content}</details>`;
    },
    toText: (content, attrs) => {
      const summary = attrs?.title || "详情";
      return `[${summary}]\n${content}`;
    },
  },
  
  // ::hr - 自定义分割线
  {
    name: "hr",
    type: "leafDirective",
    description: "自定义分割线",
    toHtml: (_content, attrs) => {
      const style = attrs?.style || "solid";
      const color = attrs?.color || "#e8e8e8";
      return `<hr style="border: none; border-top: 1px ${style} ${color}; margin: 24px 0;" />`;
    },
    toText: () => "\n---\n",
  },
  
  // :emoji - 自定义 emoji（示例）
  {
    name: "emoji",
    type: "textDirective",
    description: "自定义表情",
    toHtml: (_content, attrs) => {
      const name = attrs?.name || "smile";
      // 这里可以映射到实际的 emoji 或图片
      const emojiMap: Record<string, string> = {
        smile: "😊",
        heart: "❤️",
        fire: "🔥",
        star: "⭐",
      };
      return emojiMap[name] || `[${name}]`;
    },
    toText: (_content, attrs) => {
      const name = attrs?.name || "smile";
      return `[${name}]`;
    },
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
```

### 3.3 平台配置

```typescript
// packages/shared/markdown/platformConfig.ts

import type { PlatformSyntaxConfig, TransformStrategy } from "./types";

/**
 * 各平台的语法支持配置
 */
export const platformConfigs: Record<string, PlatformSyntaxConfig> = {
  // 腾讯云开发者社区
  tencent: {
    platform: "tencent",
    name: "腾讯云开发者社区",
    supportsHtml: true,  // 腾讯云支持 HTML
    strategies: {
      center: "toHtml",
      note: "toHtml",
      warning: "toHtml",
      tip: "toHtml",
      danger: "toHtml",
      details: "toHtml",
      hr: "toHtml",
      emoji: "toHtml",
    },
    defaultStrategy: "toHtml",
  },
  
  // 掘金
  juejin: {
    platform: "juejin",
    name: "掘金",
    supportsHtml: false,  // 掘金不支持自定义 HTML
    strategies: {
      center: "toText",   // 转为纯文本
      note: "toText",
      warning: "toText",
      tip: "toText",
      danger: "toText",
      details: "toText",
      hr: "toText",       // 转为标准分割线
      emoji: "toText",
    },
    defaultStrategy: "toText",
  }
};

/**
 * 获取平台配置
 */
export function getPlatformConfig(platform: string): PlatformSyntaxConfig {
  return platformConfigs[platform] || {
    platform,
    name: platform,
    supportsHtml: false,
    strategies: {},
    defaultStrategy: "toText",
  };
}

/**
 * 获取指定平台对特定语法的处理策略
 */
export function getTransformStrategy(
  platform: string,
  directiveName: string
): TransformStrategy {
  const config = getPlatformConfig(platform);
  return config.strategies[directiveName] || config.defaultStrategy;
}
```

---

## 四、编辑器集成

### 4.1 Milkdown 插件实现

```typescript
// packages/web/src/components/milkdown-plugins/index.ts

import { MilkdownPlugin } from "@milkdown/kit/ctx";
import { remarkDirectivePlugin } from "./remarkDirective";
import { centerNode } from "./nodes/centerNode";
import { noteNode, warningNode, tipNode, dangerNode } from "./nodes/noteNode";
import { detailsNode } from "./nodes/detailsNode";

/**
 * 所有 directive 插件的集合
 */
export const directivePlugins: MilkdownPlugin[] = [
  remarkDirectivePlugin,  // 必须首先注册 remark-directive
  centerNode,
  noteNode,
  warningNode,
  tipNode,
  dangerNode,
  detailsNode,
].flat();
```

```typescript
// packages/web/src/components/milkdown-plugins/remarkDirective.ts

import { $remark } from "@milkdown/kit/utils";
import directive from "remark-directive";

/**
 * 注册 remark-directive 插件
 */
export const remarkDirectivePlugin = $remark("remarkDirective", () => directive);
```

```typescript
// packages/web/src/components/milkdown-plugins/nodes/centerNode.ts

import { $node } from "@milkdown/kit/utils";
import type { Node } from "@milkdown/kit/prose/model";

/**
 * :::center 容器节点
 * 
 * 用法:
 * :::center
 * 居中的内容
 * :::
 */
export const centerNode = $node("center", () => ({
  group: "block",
  content: "block+",
  defining: true,
  attrs: {},
  
  parseDOM: [
    {
      tag: "div.directive-center",
      getAttrs: () => ({}),
    },
  ],
  
  toDOM: (): [string, Record<string, string>, number] => [
    "div",
    { 
      class: "directive-center",
      style: "text-align: center",
    },
    0,  // 内容插槽
  ],
  
  parseMarkdown: {
    match: (node) => 
      node.type === "containerDirective" && node.name === "center",
    runner: (state, node, type) => {
      state.openNode(type, {});
      state.next(node.children);
      state.closeNode();
    },
  },
  
  toMarkdown: {
    match: (node) => node.type.name === "center",
    runner: (state, node) => {
      state.openNode("containerDirective", undefined, { name: "center" });
      state.next(node.content);
      state.closeNode();
    },
  },
}));
```

```typescript
// packages/web/src/components/milkdown-plugins/nodes/noteNode.ts

import { $node } from "@milkdown/kit/utils";

// 颜色配置
const noteStyles = {
  note: { border: "#1890ff", bg: "#e6f7ff" },
  warning: { border: "#faad14", bg: "#fffbe6" },
  tip: { border: "#52c41a", bg: "#f6ffed" },
  danger: { border: "#ff4d4f", bg: "#fff2f0" },
};

function createNoteNode(name: keyof typeof noteStyles) {
  const style = noteStyles[name];
  
  return $node(name, () => ({
    group: "block",
    content: "block+",
    defining: true,
    attrs: {
      type: { default: name },
    },
    
    parseDOM: [
      {
        tag: `div.directive-${name}`,
        getAttrs: () => ({ type: name }),
      },
    ],
    
    toDOM: () => [
      "div",
      {
        class: `directive-${name}`,
        style: `padding: 12px 16px; border-left: 4px solid ${style.border}; background: ${style.bg}; margin: 16px 0; border-radius: 4px;`,
      },
      0,
    ],
    
    parseMarkdown: {
      match: (node) =>
        node.type === "containerDirective" && node.name === name,
      runner: (state, node, type) => {
        state.openNode(type, { type: name });
        state.next(node.children);
        state.closeNode();
      },
    },
    
    toMarkdown: {
      match: (node) => node.type.name === name,
      runner: (state, node) => {
        state.openNode("containerDirective", undefined, { name });
        state.next(node.content);
        state.closeNode();
      },
    },
  }));
}

export const noteNode = createNoteNode("note");
export const warningNode = createNoteNode("warning");
export const tipNode = createNoteNode("tip");
export const dangerNode = createNoteNode("danger");
```

### 4.2 编辑器集成

```typescript
// packages/web/src/components/MilkdownEditor.tsx

import { directivePlugins } from "./milkdown-plugins";

// 在 crepe.create() 之前注册插件
crepe.editor.use(directivePlugins);

await crepe.create();
```

### 4.3 CSS 样式

```css
/* packages/web/src/index.css */

/* Directive 容器基础样式 */
.directive-center {
  text-align: center;
}

.directive-note,
.directive-warning,
.directive-tip,
.directive-danger {
  padding: 12px 16px;
  margin: 16px 0;
  border-radius: 4px;
}

.directive-note {
  border-left: 4px solid #1890ff;
  background: #e6f7ff;
}

.directive-warning {
  border-left: 4px solid #faad14;
  background: #fffbe6;
}

.directive-tip {
  border-left: 4px solid #52c41a;
  background: #f6ffed;
}

.directive-danger {
  border-left: 4px solid #ff4d4f;
  background: #fff2f0;
}

/* 折叠块样式 */
.directive-details {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  margin: 16px 0;
}

.directive-details summary {
  padding: 8px 12px;
  cursor: pointer;
  background: #fafafa;
  border-bottom: 1px solid #d9d9d9;
}

.directive-details[open] summary {
  border-bottom: 1px solid #d9d9d9;
}

.directive-details > *:not(summary) {
  padding: 12px;
}
```

---

## 五、发布转换服务

### 5.1 Markdown 转换器

```typescript
// packages/server/src/services/markdownTransformer.ts

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkDirective from "remark-directive";
import { visit } from "unist-util-visit";
import { toHast } from "mdast-util-to-hast";
import { toHtml } from "hast-util-to-html";
import type { Root, Content } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";

import { 
  getDirectiveByName, 
  directiveDefinitions 
} from "@penbridge/shared/markdown/directives";
import { 
  getPlatformConfig, 
  getTransformStrategy 
} from "@penbridge/shared/markdown/platformConfig";
import type { TransformStrategy } from "@penbridge/shared/markdown/types";

type DirectiveNode = ContainerDirective | LeafDirective | TextDirective;

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
 */
export async function transformMarkdownForPlatform(
  markdown: string,
  options: TransformOptions
): Promise<TransformResult> {
  const { platform, overrideStrategies = {} } = options;
  const platformConfig = getPlatformConfig(platform);
  
  // 统计信息
  const stats: Record<string, { strategy: TransformStrategy; count: number }> = {};
  
  // 创建 remark 处理器
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(() => (tree: Root) => {
      visit(tree, (node, index, parent) => {
        // 检查是否为 directive 节点
        if (
          node.type !== "containerDirective" &&
          node.type !== "leafDirective" &&
          node.type !== "textDirective"
        ) {
          return;
        }
        
        const directiveNode = node as DirectiveNode;
        const directiveName = directiveNode.name;
        const definition = getDirectiveByName(directiveName);
        
        if (!definition) {
          // 未定义的指令，使用默认策略
          return;
        }
        
        // 确定策略
        const strategy = 
          overrideStrategies[directiveName] ||
          getTransformStrategy(platform, directiveName);
        
        // 更新统计
        if (!stats[directiveName]) {
          stats[directiveName] = { strategy, count: 0 };
        }
        stats[directiveName].count++;
        
        // 根据策略处理
        if (strategy === "keep") {
          // 保留原样，不做处理
          return;
        }
        
        if (strategy === "remove") {
          // 完全移除
          if (parent && typeof index === "number") {
            // 对于容器指令，保留子内容
            if (directiveNode.type === "containerDirective") {
              const children = directiveNode.children as Content[];
              parent.children.splice(index, 1, ...children);
              return index; // 重新处理插入的节点
            }
            // 对于叶子和文本指令，直接移除
            parent.children.splice(index, 1);
            return index;
          }
          return;
        }
        
        if (strategy === "toHtml" && platformConfig.supportsHtml) {
          // 转换为 HTML
          const htmlContent = convertDirectiveToHtml(directiveNode, definition);
          
          // 替换为 HTML 节点
          if (parent && typeof index === "number") {
            const htmlNode = {
              type: "html" as const,
              value: htmlContent,
            };
            parent.children.splice(index, 1, htmlNode);
          }
          return;
        }
        
        if (strategy === "toText" || 
            (strategy === "toHtml" && !platformConfig.supportsHtml)) {
          // 转换为纯文本
          const textContent = convertDirectiveToText(directiveNode, definition);
          
          // 替换为段落节点
          if (parent && typeof index === "number") {
            const paragraphNode = {
              type: "paragraph" as const,
              children: [{ type: "text" as const, value: textContent }],
            };
            
            if (directiveNode.type === "textDirective") {
              // 行内指令，替换为文本
              parent.children.splice(index, 1, { 
                type: "text" as const, 
                value: textContent 
              });
            } else {
              // 块级指令，替换为段落
              parent.children.splice(index, 1, paragraphNode);
            }
          }
          return;
        }
      });
    })
    .use(remarkStringify);
  
  // 执行转换
  const result = await processor.process(markdown);
  
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
    content: String(result),
    report,
  };
}

/**
 * 将 directive 节点转换为 HTML
 */
function convertDirectiveToHtml(
  node: DirectiveNode,
  definition: ReturnType<typeof getDirectiveByName>
): string {
  if (!definition) return "";
  
  // 获取内容的 HTML
  let contentHtml = "";
  if ("children" in node && node.children) {
    // 将子节点转换为 HTML
    const hast = toHast({
      type: "root",
      children: node.children as Content[],
    });
    contentHtml = toHtml(hast);
  }
  
  // 获取属性
  const attrs = node.attributes as Record<string, string> || {};
  
  return definition.toHtml(contentHtml, attrs);
}

/**
 * 将 directive 节点转换为纯文本
 */
function convertDirectiveToText(
  node: DirectiveNode,
  definition: ReturnType<typeof getDirectiveByName>
): string {
  if (!definition) return "";
  
  // 提取纯文本内容
  let textContent = "";
  if ("children" in node && node.children) {
    textContent = extractText(node.children as Content[]);
  }
  
  // 获取属性
  const attrs = node.attributes as Record<string, string> || {};
  
  return definition.toText(textContent, attrs);
}

/**
 * 从 AST 节点中提取纯文本
 */
function extractText(nodes: Content[]): string {
  let text = "";
  
  for (const node of nodes) {
    if (node.type === "text") {
      text += node.value;
    } else if ("children" in node && node.children) {
      text += extractText(node.children as Content[]);
    }
    
    // 块级元素之间添加换行
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "list"
    ) {
      text += "\n";
    }
  }
  
  return text.trim();
}

/**
 * 检测 Markdown 中是否包含扩展语法
 */
export async function detectDirectives(markdown: string): Promise<string[]> {
  const found: Set<string> = new Set();
  
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(() => (tree: Root) => {
      visit(tree, (node) => {
        if (
          node.type === "containerDirective" ||
          node.type === "leafDirective" ||
          node.type === "textDirective"
        ) {
          found.add((node as DirectiveNode).name);
        }
      });
    });
  
  await processor.run(processor.parse(markdown));
  
  return Array.from(found);
}

/**
 * 获取内容中使用的扩展语法及其对应的平台兼容性
 */
export async function analyzeCompatibility(
  markdown: string,
  platforms: string[]
): Promise<{
  directives: string[];
  compatibility: Record<string, Record<string, TransformStrategy>>;
}> {
  const directives = await detectDirectives(markdown);
  
  const compatibility: Record<string, Record<string, TransformStrategy>> = {};
  
  for (const platform of platforms) {
    compatibility[platform] = {};
    for (const directive of directives) {
      compatibility[platform][directive] = getTransformStrategy(platform, directive);
    }
  }
  
  return { directives, compatibility };
}
```

### 5.2 发布流程集成

```typescript
// packages/server/src/services/articleSync.ts 修改

import { transformMarkdownForPlatform } from "./markdownTransformer";

export class ArticleSyncService {
  // ... 现有代码 ...
  
  async publishArticle(articleId: number): Promise<SyncResult> {
    const article = await this.articleRepo.findOneBy({ id: articleId });
    if (!article) {
      throw new Error("文章不存在");
    }
    
    // 1. 转换扩展语法
    const { content: transformedContent, report } = await transformMarkdownForPlatform(
      article.content,
      { platform: "tencent" }
    );
    
    if (report.processed > 0) {
      logger.info(`[ArticleSync] 转换了 ${report.processed} 个扩展语法节点`, report.details);
    }
    
    // 2. 处理图片
    let contentToPublish = transformedContent;
    if (hasImagesToUpload(transformedContent, "tencent")) {
      const { content: processedContent } = await processArticleImages(
        transformedContent,
        this.apiClient,
        this.uploadDir,
        "tencent"
      );
      contentToPublish = processedContent;
    }
    
    // 3. 发布到平台
    // ... 现有发布逻辑 ...
  }
}
```

```typescript
// packages/server/src/services/juejinSync.ts 修改

import { transformMarkdownForPlatform } from "./markdownTransformer";

export async function publishToJuejin(article: Article): Promise<void> {
  // 1. 转换扩展语法
  const { content: transformedContent } = await transformMarkdownForPlatform(
    article.content,
    { platform: "juejin" }
  );
  
  // 2. 处理图片
  let contentToPublish = transformedContent;
  if (hasImagesToUpload(transformedContent, "juejin")) {
    const { content: processedContent } = await processArticleImages(
      transformedContent,
      juejinClient,
      uploadDir,
      "juejin"
    );
    contentToPublish = processedContent;
  }
  
  // 3. 发布
  await juejinClient.publishArticle({
    // ...
    markContent: contentToPublish,
  });
}
```

---

## 六、用户配置界面（可选）

### 6.1 平台语法配置组件

```typescript
// packages/web/src/components/settings/PlatformSyntaxSettings.tsx

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { directiveDefinitions } from "@penbridge/shared/markdown/directives";
import { platformConfigs } from "@penbridge/shared/markdown/platformConfig";
import type { TransformStrategy } from "@penbridge/shared/markdown/types";

const strategyLabels: Record<TransformStrategy, string> = {
  keep: "保留原样",
  toHtml: "转换为 HTML",
  toText: "转换为纯文本",
  remove: "移除",
};

export function PlatformSyntaxSettings({ platform }: { platform: string }) {
  const config = platformConfigs[platform];
  const [strategies, setStrategies] = useState(config?.strategies || {});
  
  const handleChange = (directive: string, strategy: TransformStrategy) => {
    setStrategies((prev) => ({ ...prev, [directive]: strategy }));
    // TODO: 保存到用户配置
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{config?.name || platform} - 扩展语法处理</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {directiveDefinitions.map((directive) => (
            <div key={directive.name} className="flex items-center justify-between">
              <div>
                <code className="text-sm bg-muted px-1 rounded">
                  {directive.type === "containerDirective" && ":::"}
                  {directive.type === "leafDirective" && "::"}
                  {directive.type === "textDirective" && ":"}
                  {directive.name}
                </code>
                <span className="text-sm text-muted-foreground ml-2">
                  {directive.description}
                </span>
              </div>
              <Select
                value={strategies[directive.name] || config?.defaultStrategy || "toText"}
                onValueChange={(value) => handleChange(directive.name, value as TransformStrategy)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(strategyLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 七、实施计划

### 7.1 阶段一：基础设施（1-2 天）

- [ ] 创建 `packages/shared/markdown/` 目录结构
- [ ] 实现类型定义 `types.ts`
- [ ] 实现扩展语法注册表 `directives.ts`
- [ ] 实现平台配置 `platformConfig.ts`
- [ ] 安装依赖：`remark-directive`, `mdast-util-directive`, `unist-util-visit`

### 7.2 阶段二：编辑器集成（2-3 天）

- [ ] 创建 `milkdown-plugins/` 目录
- [ ] 实现 `remarkDirective.ts` - remark-directive 集成
- [ ] 实现 `centerNode.ts` - :::center 节点
- [ ] 实现 `noteNode.ts` - :::note/warning/tip/danger 节点
- [ ] 实现 `detailsNode.ts` - :::details 折叠节点
- [ ] 在 `MilkdownEditor.tsx` 中注册插件
- [ ] 添加 CSS 样式

### 7.3 阶段三：发布转换（2-3 天）

- [ ] 实现 `markdownTransformer.ts` 转换服务
- [ ] 集成到 `articleSync.ts`（腾讯云发布）
- [ ] 集成到掘金发布流程
- [ ] 添加转换日志和错误处理

### 7.4 阶段四：测试与优化（1-2 天）

- [ ] 编写单元测试
- [ ] 测试各平台发布效果
- [ ] 性能优化
- [ ] 文档完善

### 7.5 阶段五：用户配置（可选，1-2 天）

- [ ] 实现用户自定义策略存储
- [ ] 实现配置界面组件
- [ ] 集成到设置页面

---

## 八、扩展指南

### 8.1 添加新的扩展语法

1. 在 `directives.ts` 中添加定义：

```typescript
{
  name: "newDirective",
  type: "containerDirective",
  description: "新指令描述",
  toHtml: (content, attrs) => `<div class="new">${content}</div>`,
  toText: (content) => content,
}
```

2. 在 `milkdown-plugins/nodes/` 中创建节点文件

3. 在 `milkdown-plugins/index.ts` 中导出

4. 更新各平台的 `strategies` 配置

### 8.2 添加新平台支持

1. 在 `platformConfig.ts` 中添加配置：

```typescript
newPlatform: {
  platform: "newPlatform",
  name: "新平台",
  supportsHtml: true,
  strategies: {
    center: "toHtml",
    // ...
  },
  defaultStrategy: "toHtml",
}
```

2. 在发布服务中调用 `transformMarkdownForPlatform`

---

## 九、注意事项

1. **向后兼容**：现有文章不包含扩展语法，转换服务对标准 Markdown 无副作用

2. **性能考虑**：AST 解析和转换在发布时执行，不影响编辑体验

3. **错误处理**：转换失败时应保留原始内容，避免数据丢失

4. **测试覆盖**：确保各种边界情况（嵌套、空内容、特殊字符）的正确处理

5. **用户反馈**：发布时显示转换报告，让用户了解内容变化
