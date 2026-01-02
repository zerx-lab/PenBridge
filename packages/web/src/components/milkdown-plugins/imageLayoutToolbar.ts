/**
 * 图片布局工具栏插件
 * 点击图片时显示布局选择按钮
 */

import type { Ctx } from "@milkdown/kit/ctx";
import type { EditorState, PluginView } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Plugin, PluginKey, NodeSelection } from "@milkdown/kit/prose/state";
import { editorViewCtx, schemaCtx } from "@milkdown/kit/core";
import { $prose } from "@milkdown/kit/utils";
import { alignmentConfigs, ALIGNMENT_NAMES, type AlignmentType } from "./layoutToolbar";

// 插件 key
const imageLayoutPluginKey = new PluginKey("IMAGE_LAYOUT_TOOLBAR");

// 图片节点类型名称（Milkdown 使用 image-block）
const IMAGE_NODE_NAMES = ["image-block", "image_block", "image"];

/**
 * 检查节点是否是图片节点
 */
function isImageNode(nodeName: string): boolean {
  return IMAGE_NODE_NAMES.includes(nodeName);
}

/**
 * 检查图片是否在指定对齐容器内
 */
function getImageAlignmentType(view: EditorView, imagePos: number): AlignmentType | null {
  const { state } = view;
  const $pos = state.doc.resolve(imagePos);
  
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (ALIGNMENT_NAMES.includes(node.type.name)) {
      return node.type.name as AlignmentType;
    }
  }
  return null;
}

/**
 * 设置图片的对齐方式
 * @returns 新的图片位置，如果操作失败返回 null
 */
function setImageAlignment(ctx: Ctx, imagePos: number, alignmentType: AlignmentType | null): number | null {
  try {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const { state, dispatch } = view;
    const { doc } = state;
    let { tr } = state;
    
    // 找到图片节点
    const nodeAtPos = doc.nodeAt(imagePos);
    if (!nodeAtPos) {
      console.warn("[imageLayoutToolbar] 未找到图片节点 at pos:", imagePos);
      return null;
    }
    
    const $pos = doc.resolve(imagePos);
    
    // 检查是否已经在对齐容器内
    let currentAlignmentDepth = -1;
    let currentAlignmentType: string | null = null;
    
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (ALIGNMENT_NAMES.includes(node.type.name)) {
        currentAlignmentDepth = depth;
        currentAlignmentType = node.type.name;
        break;
      }
    }
    
    let newImagePos: number;
    
    if (alignmentType === null) {
      // 移除对齐
      if (currentAlignmentType && currentAlignmentDepth > 0) {
        const containerStart = $pos.start(currentAlignmentDepth) - 1;
        const containerEnd = $pos.end(currentAlignmentDepth) + 1;
        const container = $pos.node(currentAlignmentDepth);
        tr.replaceWith(containerStart, containerEnd, container.content);
        dispatch(tr);
        // 移除容器后，图片位置就是容器的起始位置
        newImagePos = containerStart;
      } else {
        newImagePos = imagePos;
      }
      return newImagePos;
    }
    
    const alignmentNodeType = schema.nodes[alignmentType];
    if (!alignmentNodeType) {
      console.warn("[imageLayoutToolbar] 未找到对齐节点类型:", alignmentType);
      return null;
    }
    
    if (currentAlignmentType) {
      if (currentAlignmentType === alignmentType) {
        // 已是同类型，移除对齐
        const containerStart = $pos.start(currentAlignmentDepth) - 1;
        const containerEnd = $pos.end(currentAlignmentDepth) + 1;
        const container = $pos.node(currentAlignmentDepth);
        tr.replaceWith(containerStart, containerEnd, container.content);
        dispatch(tr);
        // 移除容器后，图片位置就是容器的起始位置
        newImagePos = containerStart;
      } else {
        // 更换对齐类型
        const containerStart = $pos.start(currentAlignmentDepth) - 1;
        const containerEnd = $pos.end(currentAlignmentDepth) + 1;
        const container = $pos.node(currentAlignmentDepth);
        const newNode = alignmentNodeType.create({}, container.content);
        tr.replaceWith(containerStart, containerEnd, newNode);
        dispatch(tr);
        // 更换容器类型后，图片位置在容器内部（containerStart + 1）
        newImagePos = containerStart + 1;
      }
    } else {
      // 包装图片到对齐容器
      const imageStart = imagePos;
      const imageEnd = imagePos + nodeAtPos.nodeSize;
      
      // 创建对齐容器，包含图片节点
      const alignmentNode = alignmentNodeType.create({}, nodeAtPos);
      tr.replaceWith(imageStart, imageEnd, alignmentNode);
      dispatch(tr);
      // 包装后，图片位置在容器内部（imageStart + 1）
      newImagePos = imageStart + 1;
    }
    
    return newImagePos;
  } catch (error) {
    console.error("[imageLayoutToolbar] 设置图片对齐失败:", error);
    return null;
  }
}

/**
 * 创建图片布局工具栏 DOM
 */
function createToolbarElement(
  ctx: Ctx, 
  imagePos: number, 
  currentAlignment: AlignmentType | null,
  onAlignmentChange?: (newImagePos: number | null, newAlignment: AlignmentType | null) => void
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "image-layout-toolbar";
  
  // 保存当前图片位置和对齐状态，用于按钮点击时更新
  let currentImagePos = imagePos;
  let activeAlignment = currentAlignment;
  
  // 添加按钮
  Object.entries(alignmentConfigs).forEach(([key, config]) => {
    const alignmentType = key as AlignmentType;
    const button = document.createElement("button");
    button.className = `image-layout-btn${currentAlignment === alignmentType ? " active" : ""}`;
    button.innerHTML = config.icon;
    button.title = config.label;
    button.type = "button";
    button.dataset.alignment = alignmentType;
    
    button.addEventListener("mousedown", (e) => {
      // 使用 mousedown 而不是 click，防止失去焦点
      e.preventDefault();
      e.stopPropagation();
    });
    
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 如果当前已是该对齐，则移除对齐；否则设置对齐
      const newAlignment = activeAlignment === alignmentType ? null : alignmentType;
      
      // 使用当前最新的图片位置进行对齐切换
      const newImagePos = setImageAlignment(ctx, currentImagePos, newAlignment);
      
      if (newImagePos !== null) {
        // 更新保存的图片位置和对齐状态
        currentImagePos = newImagePos;
        activeAlignment = newAlignment;
        
        // 更新按钮状态
        toolbar.querySelectorAll(".image-layout-btn").forEach((btn) => {
          const btnElement = btn as HTMLButtonElement;
          const btnAlignment = btnElement.dataset.alignment;
          if (newAlignment === null) {
            btnElement.classList.remove("active");
          } else if (btnAlignment === newAlignment) {
            btnElement.classList.add("active");
          } else {
            btnElement.classList.remove("active");
          }
        });
        
        // 通知外部对齐已更改，传递新的图片位置
        onAlignmentChange?.(newImagePos, newAlignment);
      }
    });
    
    toolbar.appendChild(button);
  });
  
  return toolbar;
}

/**
 * 图片布局工具栏视图
 */
class ImageLayoutToolbarView implements PluginView {
  private toolbar: HTMLElement | null = null;
  private ctx: Ctx;
  private view: EditorView;
  private clickHandler: (e: MouseEvent) => void;
  private currentImageElement: HTMLElement | null = null;
  
  constructor(ctx: Ctx, view: EditorView) {
    this.ctx = ctx;
    this.view = view;
    
    // 监听点击事件来检测图片点击
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 如果点击的是工具栏按钮，不处理
      if (target.closest(".image-layout-toolbar")) {
        return;
      }
      
      // 检查点击的是否是图片或图片容器
      const imageElement = target.closest(".image-block, .milkdown-image-block, [data-type='image-block'], milkdown-image-block") as HTMLElement;
      const imgElement = target.tagName === "IMG" ? target as HTMLElement : (imageElement?.querySelector("img") as HTMLElement);
      
      if (imageElement || imgElement) {
        // 找到对应的 ProseMirror 位置
        const pos = this.findImagePos(imageElement || imgElement?.parentElement || target);
        if (pos !== null) {
          // 保存被点击的图片元素
          this.currentImageElement = imgElement || imageElement?.querySelector("img") || null;
          // 延迟显示，等待 selection 更新
          setTimeout(() => {
            this.showToolbar(this.view, pos);
          }, 50);
          return;
        }
      }
      
      // 点击其他地方，隐藏工具栏
      this.currentImageElement = null;
      this.hideToolbar();
    };
    
    // 在编辑器容器上监听点击
    view.dom.addEventListener("click", this.clickHandler);
  }
  
  /**
   * 根据 DOM 元素找到对应的 ProseMirror 位置
   */
  private findImagePos(element: HTMLElement | null): number | null {
    if (!element) return null;
    
    try {
      const pos = this.view.posAtDOM(element, 0);
      if (pos >= 0) {
        // 验证这个位置确实是图片节点
        const node = this.view.state.doc.nodeAt(pos);
        if (node && isImageNode(node.type.name)) {
          return pos;
        }
        // 尝试找父节点
        const $pos = this.view.state.doc.resolve(pos);
        for (let depth = $pos.depth; depth > 0; depth--) {
          const parentNode = $pos.node(depth);
          if (isImageNode(parentNode.type.name)) {
            return $pos.start(depth) - 1;
          }
        }
      }
    } catch {
      // posAtDOM 可能抛出错误
    }
    return null;
  }
  
  update(view: EditorView, _prevState?: EditorState): void {
    this.view = view;
    const { state } = view;
    const { selection } = state;
    
    // 检查是否选中了图片节点
    let imagePos: number | null = null;
    let imageNode = null;
    
    // 检查 NodeSelection（点击图片时会产生 NodeSelection）
    if (selection instanceof NodeSelection) {
      const nodeName = selection.node.type.name;
      if (isImageNode(nodeName)) {
        imagePos = selection.from;
        imageNode = selection.node;
      }
    }
    
    // 也检查光标位置附近的图片
    if (!imagePos) {
      const nodeAtSelection = state.doc.nodeAt(selection.from);
      if (nodeAtSelection) {
        const nodeName = nodeAtSelection.type.name;
        if (isImageNode(nodeName)) {
          imagePos = selection.from;
          imageNode = nodeAtSelection;
        }
      }
    }
    
    if (imagePos !== null && imageNode) {
      // 显示工具栏
      this.showToolbar(view, imagePos);
    }
    // 注意：不在这里隐藏工具栏，由点击事件处理
  }
  
  private showToolbar(view: EditorView, imagePos: number): void {
    // 移除旧工具栏
    this.hideToolbar();
    
    // 获取当前对齐状态
    const currentAlignment = getImageAlignmentType(view, imagePos);
    
    // 创建工具栏
    this.toolbar = createToolbarElement(this.ctx, imagePos, currentAlignment);
    
    // 将工具栏添加到编辑器容器
    const editorContainer = view.dom.closest(".milkdown-editor") || view.dom.parentElement;
    if (editorContainer) {
      editorContainer.appendChild(this.toolbar);
      
      // 定位到图片上方
      const containerRect = editorContainer.getBoundingClientRect();
      const toolbarRect = this.toolbar.getBoundingClientRect();
      
      // 优先使用保存的点击图片元素
      let imageRect: DOMRect | { top: number; left: number; width: number; height: number };
      
      if (this.currentImageElement && document.contains(this.currentImageElement)) {
        // 使用点击时保存的图片元素
        imageRect = this.currentImageElement.getBoundingClientRect();
      } else {
        // 后备方案：使用 coordsAtPos 获取图片位置的屏幕坐标
        const coords = view.coordsAtPos(imagePos);
        imageRect = { top: coords.top, left: coords.left, width: 200, height: 100 };
        
        // 尝试通过 domAtPos 找到图片 DOM 元素
        try {
          const domResult = view.domAtPos(imagePos);
          let element: HTMLElement | null = domResult.node as HTMLElement;
          
          // domAtPos 可能返回文本节点，需要获取其父元素
          if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement;
          }
          
          // 查找实际的 img 元素
          let img: HTMLElement | null = null;
          if (element) {
            if (element.tagName === "IMG") {
              img = element;
            } else {
              // 尝试在元素内部或附近查找 img
              img = element.querySelector("img");
              if (!img) {
                // 尝试从父元素查找
                const parent = element.closest(".milkdown-image-block, .image-wrapper");
                if (parent) {
                  img = parent.querySelector("img");
                }
              }
            }
          }
          
          if (img) {
            imageRect = img.getBoundingClientRect();
          }
        } catch {
          // domAtPos 可能抛出错误，使用 coords 作为后备
        }
      }
      
      // 定位工具栏 - 使用屏幕坐标计算相对于容器的位置
      const left = imageRect.left - containerRect.left + (imageRect.width / 2) - (toolbarRect.width / 2);
      const top = imageRect.top - containerRect.top - toolbarRect.height - 8;
      
      this.toolbar.style.left = `${Math.max(0, left)}px`;
      this.toolbar.style.top = `${Math.max(0, top)}px`;
    }
  }
  
  private hideToolbar(): void {
    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
  }
  
  destroy(): void {
    this.hideToolbar();
    this.view.dom.removeEventListener("click", this.clickHandler);
  }
}

/**
 * 图片布局工具栏插件（Milkdown 插件形式）
 * 使用 $prose 工具函数创建插件
 */
export const imageLayoutToolbarPlugin = $prose((ctx) => {
  return new Plugin({
    key: imageLayoutPluginKey,
    view: (view) => new ImageLayoutToolbarView(ctx, view),
  });
});

/**
 * 注册图片布局工具栏到编辑器（直接创建 ProseMirror 插件）
 * @deprecated 请使用 imageLayoutToolbarPlugin 代替
 */
export function registerImageLayoutToolbar(ctx: Ctx): Plugin {
  return new Plugin({
    key: imageLayoutPluginKey,
    view: (view) => new ImageLayoutToolbarView(ctx, view),
  });
}
