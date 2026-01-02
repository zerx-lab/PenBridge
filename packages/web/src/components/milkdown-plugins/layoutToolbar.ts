/**
 * 布局工具栏扩展
 * 在选中文字时的工具栏中添加布局按钮（左对齐、居中、右对齐、两端对齐）
 */

import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, schemaCtx } from "@milkdown/kit/core";
import { liftTarget } from "@milkdown/kit/prose/transform";

// 布局类型配置
const alignmentConfigs = {
  left: {
    label: "左对齐",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/></svg>`,
  },
  center: {
    label: "居中",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/></svg>`,
  },
  right: {
    label: "右对齐",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/></svg>`,
  },
  justify: {
    label: "两端对齐",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="12" y2="12"/><line x1="21" x2="3" y1="18" y2="18"/></svg>`,
  },
} as const;

type AlignmentType = keyof typeof alignmentConfigs;

// 对齐类型名称列表
const ALIGNMENT_NAMES = ["left", "right", "center", "justify"];

/**
 * 检查当前选中内容是否在指定对齐容器内
 */
function isInAlignmentNode(ctx: Ctx, alignmentType: AlignmentType): boolean {
  try {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { selection } = state;
    const { $from } = selection;
    
    // 遍历祖先节点，检查是否在对齐容器内
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === alignmentType) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 将选中内容包装到对齐容器中
 * 如果已经在同类型容器中，则移除容器
 * 如果在其他类型容器中，则更换容器类型
 */
function wrapInAlignment(ctx: Ctx, alignmentType: AlignmentType): void {
  try {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const { state, dispatch } = view;
    const { selection } = state;
    const { $from, $to } = selection;
    
    // 获取对齐节点类型
    const alignmentNodeType = schema.nodes[alignmentType];
    if (!alignmentNodeType) {
      console.warn(`[layoutToolbar] 未找到节点类型: ${alignmentType}`);
      return;
    }
    
    // 检查是否已经在某个对齐容器内
    let currentAlignmentType: string | null = null;
    
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (ALIGNMENT_NAMES.includes(node.type.name)) {
        currentAlignmentType = node.type.name;
        break;
      }
    }
    
    if (currentAlignmentType) {
      // 已经在对齐容器内
      if (currentAlignmentType === alignmentType) {
        // 相同类型：解除对齐（使用 lift）
        const range = $from.blockRange($to);
        if (!range) return;
        
        const target = liftTarget(range);
        if (target == null) return;
        
        const tr = state.tr.lift(range, target);
        dispatch(tr);
      } else {
        // 不同类型：更换对齐类型
        // 先解除，再包装
        const range = $from.blockRange($to);
        if (!range) return;
        
        const target = liftTarget(range);
        if (target == null) return;
        
        let tr = state.tr.lift(range, target);
        
        // 更新选区后重新获取 range
        const mappedFrom = tr.mapping.map($from.pos);
        const mappedTo = tr.mapping.map($to.pos);
        const $newFrom = tr.doc.resolve(mappedFrom);
        const $newTo = tr.doc.resolve(mappedTo);
        const newRange = $newFrom.blockRange($newTo);
        
        if (newRange) {
          tr = tr.wrap(newRange, [{ type: alignmentNodeType }]);
        }
        
        dispatch(tr);
      }
    } else {
      // 不在任何对齐容器内：使用 wrap 包装选中内容
      const range = $from.blockRange($to);
      if (!range) {
        console.warn("[layoutToolbar] 无法获取 blockRange");
        return;
      }
      
      const tr = state.tr.wrap(range, [{ type: alignmentNodeType }]);
      dispatch(tr);
    }
  } catch (error) {
    console.error("[layoutToolbar] 设置对齐失败:", error);
  }
}

/**
 * 工具栏布局按钮配置类型
 */
export interface ToolbarItem {
  active: (ctx: Ctx) => boolean;
  icon: string;
  onRun: (ctx: Ctx) => void;
}

/**
 * 工具栏组构建器类型（简化版，用于兼容 Crepe 的 buildToolbar）
 */
export interface ToolbarGroupBuilder {
  addItem: (key: string, item: Omit<ToolbarItem, "key">) => ToolbarGroupBuilder;
}

export interface ToolbarBuilder {
  addGroup: (key: string, label: string) => ToolbarGroupBuilder;
}

/**
 * 扩展 Crepe 工具栏，添加布局按钮组
 */
export function buildLayoutToolbar(builder: ToolbarBuilder): void {
  const layoutGroup = builder.addGroup("layout", "布局");
  
  // 添加各个对齐按钮
  Object.entries(alignmentConfigs).forEach(([key, config]) => {
    const alignmentType = key as AlignmentType;
    layoutGroup.addItem(alignmentType, {
      icon: config.icon,
      active: (ctx: Ctx) => isInAlignmentNode(ctx, alignmentType),
      onRun: (ctx: Ctx) => wrapInAlignment(ctx, alignmentType),
    });
  });
}

/**
 * 导出对齐配置供其他模块使用
 */
export { alignmentConfigs, ALIGNMENT_NAMES };
export type { AlignmentType };
