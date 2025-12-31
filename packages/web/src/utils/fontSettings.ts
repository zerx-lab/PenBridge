/**
 * 字体设置服务
 * 用于管理全局字体选择和应用
 */

// localStorage 存储 key
const FONT_FAMILY_KEY = "app-font-family";

// 字体设置变更事件名
export const FONT_CHANGED_EVENT = "font-changed";

// 默认字体（系统默认）
export const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif";

// CSS 变量名
const FONT_CSS_VAR = "--app-font-family";

// 动态样式标签 ID
const FONT_STYLE_TAG_ID = "app-font-override-styles";

/**
 * 常用系统字体列表（预设）
 * 这些字体在大多数系统上都可用
 */
export const PRESET_FONTS = [
  { name: "系统默认", value: DEFAULT_FONT_FAMILY },
  { name: "微软雅黑", value: "\"Microsoft YaHei\", \"微软雅黑\", sans-serif" },
  { name: "苹方", value: "\"PingFang SC\", sans-serif" },
  { name: "思源黑体", value: "\"Source Han Sans SC\", \"Noto Sans SC\", sans-serif" },
  { name: "思源宋体", value: "\"Source Han Serif SC\", \"Noto Serif SC\", serif" },
  { name: "黑体", value: "SimHei, \"黑体\", sans-serif" },
  { name: "宋体", value: "SimSun, \"宋体\", serif" },
  { name: "楷体", value: "KaiTi, \"楷体\", serif" },
  { name: "仿宋", value: "FangSong, \"仿宋\", serif" },
  { name: "Arial", value: "Arial, sans-serif" },
  { name: "Times New Roman", value: "\"Times New Roman\", Times, serif" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Verdana", value: "Verdana, sans-serif" },
  { name: "Tahoma", value: "Tahoma, sans-serif" },
  { name: "Trebuchet MS", value: "\"Trebuchet MS\", sans-serif" },
  { name: "Comic Sans MS", value: "\"Comic Sans MS\", cursive" },
  { name: "Consolas（等宽）", value: "Consolas, \"Courier New\", monospace" },
];

/**
 * 获取当前保存的字体设置
 */
export function getSavedFontFamily(): string {
  try {
    const saved = localStorage.getItem(FONT_FAMILY_KEY);
    return saved || DEFAULT_FONT_FAMILY;
  } catch {
    return DEFAULT_FONT_FAMILY;
  }
}

/**
 * 保存字体设置
 */
export function saveFontFamily(fontFamily: string): void {
  try {
    localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
    // 触发自定义事件通知其他组件
    window.dispatchEvent(
      new CustomEvent(FONT_CHANGED_EVENT, { detail: { fontFamily } })
    );
  } catch (e) {
    console.error("保存字体设置失败:", e);
  }
}

/**
 * 生成强制字体覆盖的 CSS
 * 使用高优先级选择器确保覆盖所有组件库的字体设置
 */
function generateFontOverrideCSS(fontFamily: string): string {
  return `
    /* 全局字体强制覆盖 - 由 fontSettings.ts 动态生成 */
    :root {
      ${FONT_CSS_VAR}: ${fontFamily};
    }
    
    /* 基础元素 */
    html, body, #root {
      font-family: ${fontFamily} !important;
    }
    
    /* 通用元素覆盖 */
    *, *::before, *::after {
      font-family: inherit !important;
    }
    
    /* shadcn/ui 和 Tailwind UI 组件 */
    button, input, select, textarea, 
    [class*="btn"], [class*="button"],
    [class*="input"], [class*="select"],
    [class*="card"], [class*="dialog"],
    [class*="popover"], [class*="dropdown"],
    [class*="menu"], [class*="tooltip"],
    [class*="sheet"], [class*="sidebar"] {
      font-family: inherit !important;
    }
    
    /* Milkdown 编辑器 */
    .milkdown-editor,
    .milkdown-editor *,
    .milkdown-editor h1,
    .milkdown-editor h2,
    .milkdown-editor h3,
    .milkdown-editor h4,
    .milkdown-editor h5,
    .milkdown-editor h6,
    .milkdown-editor p,
    .milkdown-editor span,
    .milkdown-editor div,
    .milkdown-editor li,
    .milkdown-editor ul,
    .milkdown-editor ol,
    .milkdown-editor blockquote,
    .milkdown-editor pre,
    .milkdown-editor code,
    .milkdown-editor table,
    .milkdown-editor th,
    .milkdown-editor td,
    .milkdown,
    .milkdown *,
    .ProseMirror,
    .ProseMirror * {
      font-family: ${fontFamily} !important;
    }
    
    /* AI Chat 面板 */
    [class*="ai-chat"],
    [class*="chat-"],
    [class*="message"] {
      font-family: inherit !important;
    }
    
    /* 文件树 */
    [class*="file-tree"],
    [class*="tree-"],
    [class*="folder"],
    [class*="FileTree"] {
      font-family: inherit !important;
    }
    
    /* Radix UI 组件（shadcn/ui 底层） */
    [data-radix-popper-content-wrapper],
    [data-radix-popper-content-wrapper] *,
    [role="dialog"],
    [role="dialog"] *,
    [role="menu"],
    [role="menu"] *,
    [role="listbox"],
    [role="listbox"] * {
      font-family: inherit !important;
    }
    
    /* Crepe 编辑器组件 */
    .crepe-slash-menu,
    .crepe-slash-menu *,
    .crepe-toolbar,
    .crepe-toolbar *,
    .crepe-link-tooltip,
    .crepe-link-tooltip * {
      font-family: ${fontFamily} !important;
    }
  `;
}

/**
 * 应用字体到全局
 * 通过动态创建/更新 <style> 标签实现，使用高优先级选择器确保覆盖所有元素
 */
export function applyFontFamily(fontFamily: string): void {
  const root = document.documentElement;
  
  // 设置 CSS 变量（作为备用）
  root.style.setProperty(FONT_CSS_VAR, fontFamily);
  
  // 查找或创建样式标签
  let styleTag = document.getElementById(FONT_STYLE_TAG_ID) as HTMLStyleElement | null;
  
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = FONT_STYLE_TAG_ID;
    // 插入到 head 的最后，确保最高优先级
    document.head.appendChild(styleTag);
  }
  
  // 更新样式内容
  styleTag.textContent = generateFontOverrideCSS(fontFamily);
}

/**
 * 初始化字体设置
 * 在应用启动时调用，应用保存的字体设置
 */
export function initFontSettings(): void {
  const savedFont = getSavedFontFamily();
  applyFontFamily(savedFont);
}

/**
 * 设置并应用字体
 * 一次性完成保存和应用
 */
export function setFontFamily(fontFamily: string): void {
  saveFontFamily(fontFamily);
  applyFontFamily(fontFamily);
}

/**
 * 重置为默认字体
 */
export function resetFontFamily(): void {
  setFontFamily(DEFAULT_FONT_FAMILY);
}

/**
 * 使用 Local Fonts Access API 获取系统字体列表
 * 注意：此 API 需要用户授权，且仅在 HTTPS 或 localhost 下可用
 * 仅 Chrome/Edge 等基于 Chromium 的浏览器支持
 */
export async function getSystemFonts(): Promise<string[]> {
  // 检查浏览器是否支持 Local Fonts Access API
  if ("queryLocalFonts" in window) {
    try {
      // @ts-expect-error - Local Fonts Access API 类型定义
      const fonts = await window.queryLocalFonts();
      // 提取唯一的字体家族名
      const fontFamilies = new Set<string>();
      for (const font of fonts) {
        fontFamilies.add(font.family);
      }
      return Array.from(fontFamilies).sort((a, b) => a.localeCompare(b, "zh-CN"));
    } catch (err) {
      console.error("获取系统字体失败:", err);
      return [];
    }
  }
  
  // 如果浏览器不支持，返回空数组
  return [];
}

/**
 * 检查浏览器是否支持 Local Fonts Access API
 */
export function isLocalFontsApiSupported(): boolean {
  return "queryLocalFonts" in window;
}

/**
 * 检测字体是否在系统中可用
 */
export function isFontAvailable(fontFamily: string): boolean {
  // 创建一个测试元素
  const testElement = document.createElement("span");
  testElement.style.position = "absolute";
  testElement.style.left = "-9999px";
  testElement.style.fontSize = "72px";
  testElement.textContent = "abcdefghijklmnopqrstuvwxyz0123456789";
  
  // 测试基准字体的宽度
  testElement.style.fontFamily = "monospace";
  document.body.appendChild(testElement);
  const baseWidth = testElement.offsetWidth;
  
  // 测试目标字体的宽度
  testElement.style.fontFamily = `${fontFamily}, monospace`;
  const testWidth = testElement.offsetWidth;
  
  document.body.removeChild(testElement);
  
  // 如果宽度不同，说明字体存在
  return baseWidth !== testWidth;
}
