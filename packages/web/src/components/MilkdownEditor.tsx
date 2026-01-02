import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { imageBlockConfig } from "@milkdown/kit/component/image-block";
import { inlineImageConfig } from "@milkdown/kit/component/image-inline";
import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { getServerBaseUrlSync } from "../utils/serverConfig";
import { createSpellCheckPlugin } from "./SpellCheckPlugin";
import { isSpellCheckEnabled, SPELL_CHECK_CHANGED_EVENT } from "../utils/spellCheck";
import { directivePlugins, buildLayoutToolbar, imageLayoutToolbarPlugin } from "./milkdown-plugins";

// 所有通用样式（包含所有功能的 CSS）
import "@milkdown/crepe/theme/common/style.css";

// 主题样式
import "@milkdown/crepe/theme/frame.css";

// 上传图片到服务器，返回相对路径（不包含服务器地址）
async function uploadImageToServer(file: File, articleId: number): Promise<string> {
  const apiBaseUrl = getServerBaseUrlSync();
  if (!apiBaseUrl) {
    throw new Error("服务器未配置");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl}/api/upload/${articleId}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "图片上传失败");
  }

  const data = await response.json();
  // 返回相对路径（如 /uploads/27/xxx.png），不包含服务器地址
  // 这样即使服务器地址变化，图片链接仍然有效
  return data.url;
}

// 将相对路径转换为完整 URL（用于编辑器显示）
function toAbsoluteImageUrl(relativeUrl: string): string {
  // 如果已经是完整 URL 或 base64，直接返回
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://") || relativeUrl.startsWith("data:")) {
    return relativeUrl;
  }
  // 如果是相对路径，拼接服务器地址
  const apiBaseUrl = getServerBaseUrlSync();
  if (!apiBaseUrl) {
    return relativeUrl;
  }
  return `${apiBaseUrl}${relativeUrl}`;
}

// 将完整 URL 转换为相对路径（用于保存）
function toRelativeImageUrl(absoluteUrl: string): string {
  // 如果是 base64，直接返回
  if (absoluteUrl.startsWith("data:")) {
    return absoluteUrl;
  }
  // 如果已经是相对路径，直接返回
  if (absoluteUrl.startsWith("/uploads/")) {
    return absoluteUrl;
  }
  // 提取相对路径部分
  const uploadsIndex = absoluteUrl.indexOf("/uploads/");
  if (uploadsIndex !== -1) {
    return absoluteUrl.slice(uploadsIndex);
  }
  // 其他情况直接返回
  return absoluteUrl;
}

// 将 markdown 内容中的相对图片路径转换为完整 URL（用于编辑器显示）
export function convertToAbsoluteUrls(markdown: string): string {
  // 匹配 markdown 图片: ![alt](/uploads/...)
  return markdown.replace(
    /!\[([^\]]*)\]\((\/uploads\/[^)]+)\)/g,
    (_match, alt, url) => `![${alt}](${toAbsoluteImageUrl(url)})`
  );
}

// 将 markdown 内容中的完整图片 URL 转换为相对路径（用于保存）
export function convertToRelativeUrls(markdown: string): string {
  // 匹配 markdown 图片中包含 /uploads/ 的完整 URL
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]*\/uploads\/[^)]+)\)/g,
    (_match, alt, url) => `![${alt}](${toRelativeImageUrl(url)})`
  );
}

// 将 base64 转换为 File 对象
function base64ToFile(base64: string, filename: string): File {
  // 提取 MIME 类型和数据
  const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("无效的 base64 数据");
  }
  
  const mimeType = matches[1];
  const data = matches[2];
  
  // 解码 base64
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // 创建 File 对象
  const ext = mimeType.split("/")[1] || "png";
  return new File([bytes], `${filename}.${ext}`, { type: mimeType });
}

// 创建图片上传函数（用于 ImageBlock 配置）
function createUploadHandler(articleId: number) {
  return async function uploadImage(file: File): Promise<string> {
    // 上传后获取相对路径
    const relativeUrl = await uploadImageToServer(file, articleId);
    // 返回完整 URL 用于编辑器立即显示
    return toAbsoluteImageUrl(relativeUrl);
  };
}

// 缓存已上传的 base64 图片，避免重复上传（使用 base64 内容的 hash 作为 key）
const uploadedBase64Cache = new Map<string, string>();

// 生成 base64 内容的简单 hash（用于缓存键）
function hashBase64(base64: string): string {
  // 使用 base64 数据部分的前200个字符 + 长度作为 hash
  const dataStart = base64.indexOf(",") + 1;
  const dataPart = base64.slice(dataStart, dataStart + 200);
  return `${dataPart.length}_${base64.length}_${dataPart.slice(0, 50)}`;
}

// 导出：将 markdown 内容中的 base64 图片替换为服务器 URL（用于保存前处理）
export async function replaceBase64ImagesInMarkdown(
  markdown: string,
  articleId: number
): Promise<string> {
  // 匹配 markdown 中的 base64 图片: ![alt](data:image/...)
  const base64ImageRegex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
  
  const matches: { fullMatch: string; alt: string; base64: string }[] = [];
  let match;
  while ((match = base64ImageRegex.exec(markdown)) !== null) {
    matches.push({
      fullMatch: match[0],
      alt: match[1],
      base64: match[2],
    });
  }

  if (matches.length === 0) {
    return markdown;
  }

  console.log(`[MilkdownEditor] 发现 ${matches.length} 个 base64 图片需要替换`);

  let result = markdown;
  for (const { fullMatch, alt, base64 } of matches) {
    // 检查缓存
    const cacheKey = hashBase64(base64);
    let uploadedUrl = uploadedBase64Cache.get(cacheKey);

    if (!uploadedUrl) {
      try {
        const file = base64ToFile(base64, `inline-${Date.now()}`);
        uploadedUrl = await uploadImageToServer(file, articleId);
        uploadedBase64Cache.set(cacheKey, uploadedUrl);
      } catch (error) {
        console.error("替换 base64 图片失败:", error);
        continue; // 跳过这个图片
      }
    }

    // 替换为服务器 URL
    const newImageMarkdown = `![${alt}](${uploadedUrl})`;
    result = result.replace(fullMatch, newImageMarkdown);
  }

  return result;
}

interface MilkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readonly?: boolean;
  className?: string;
  articleId?: number; // 文章 ID，用于图片上传目录
  enableSpellCheck?: boolean; // 是否启用拼写检查
}

// 暴露给父组件的方法
export interface MilkdownEditorRef {
  // 直接设置编辑器内容（不重建编辑器，保持滚动位置）
  setContent: (markdown: string) => boolean;
}

function MilkdownEditorInner({
  value,
  onChange,
  placeholder = "开始写作...",
  readonly = false,
  className = "",
  articleId,
  enableSpellCheck,
}: MilkdownEditorProps, ref: React.ForwardedRef<MilkdownEditorRef>) {
  // 如果没有显式传入 enableSpellCheck，则从设置中读取，并监听变更
  const [spellCheckState, setSpellCheckState] = useState(() => isSpellCheckEnabled());
  const shouldEnableSpellCheck = enableSpellCheck ?? spellCheckState;
  
  // 监听拼写检查设置变更事件
  useEffect(() => {
    const handleSpellCheckChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      setSpellCheckState(customEvent.detail.enabled);
    };
    
    window.addEventListener(SPELL_CHECK_CHANGED_EVENT, handleSpellCheckChanged);
    return () => {
      window.removeEventListener(SPELL_CHECK_CHANGED_EVENT, handleSpellCheckChanged);
    };
  }, []);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const lastValueRef = useRef(value);
  // 用于跟踪组件是否已卸载，避免在销毁后访问编辑器上下文
  const isMountedRef = useRef(true);
  // 用于跟踪编辑器是否已成功创建
  const isCreatedRef = useRef(false);

  // 暴露 setContent 方法给父组件
  useImperativeHandle(ref, () => ({
    setContent: (markdown: string): boolean => {
      const crepe = crepeRef.current;
      if (!crepe || !isCreatedRef.current) {
        console.warn("[MilkdownEditor] setContent: 编辑器未就绪");
        return false;
      }
      
      try {
        // 通过 Milkdown API 直接更新内容
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const parser = ctx.get(parserCtx);
          
          // 将 markdown 解析为 ProseMirror 文档
          const newDoc = parser(markdown);
          if (!newDoc) {
            console.warn("[MilkdownEditor] setContent: 解析 markdown 失败");
            return;
          }
          
          // 创建替换整个文档的 transaction
          const { state } = view;
          const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
          
          // 应用 transaction
          view.dispatch(tr);
          
          // 更新 lastValueRef，避免触发 onChange
          lastValueRef.current = markdown;
        });
        
        return true;
      } catch (error) {
        console.error("[MilkdownEditor] setContent 失败:", error);
        return false;
      }
    },
  }), []);

  // 初始化编辑器
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    // 标记组件已挂载，编辑器未创建
    isMountedRef.current = true;
    isCreatedRef.current = false;

    // 清空容器，防止重复渲染
    container.innerHTML = "";

    let crepe: Crepe | null = null;
    let createPromise: Promise<void> | null = null;

    // 使用 requestAnimationFrame 延迟初始化，确保 DOM 完全准备好
    const rafId = requestAnimationFrame(() => {
      console.log("[MilkdownEditor] RAF 回调执行, isMounted:", isMountedRef.current, "value length:", value?.length);
      if (!isMountedRef.current) return;

      // 构建 featureConfigs
      const featureConfigs: Record<string, unknown> = {
        [Crepe.Feature.Placeholder]: {
          text: placeholder,
          mode: "block",
        },
        // 配置工具栏，添加布局按钮
        [Crepe.Feature.Toolbar]: {
          buildToolbar: buildLayoutToolbar,
        },
      };

      // 如果有文章 ID，配置图片上传
      // 注意：proxyDomURL 在 Crepe 的 featureConfigs 中只接受字符串，
      // 函数形式需要在 crepe.create() 后通过底层 API 配置
      if (articleId) {
        const uploadHandler = createUploadHandler(articleId);
        featureConfigs[Crepe.Feature.ImageBlock] = {
          onUpload: uploadHandler,
          inlineOnUpload: uploadHandler,
          blockOnUpload: uploadHandler,
        };
      }

      crepe = new Crepe({
        root: container,
        defaultValue: value,
        features: {
          [Crepe.Feature.Cursor]: true,
          [Crepe.Feature.ListItem]: true,
          [Crepe.Feature.LinkTooltip]: true,
          [Crepe.Feature.ImageBlock]: true,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.Placeholder]: true,
          [Crepe.Feature.Toolbar]: true,
          [Crepe.Feature.CodeMirror]: true,
          [Crepe.Feature.Table]: true,
        },
        featureConfigs,
      });

      // 注册 directive 插件（对齐语法: :::left, :::right, :::center, :::justify）
      crepe.editor.use(directivePlugins);
      
      // 注册图片布局工具栏插件（点击图片时显示对齐按钮）
      crepe.editor.use(imageLayoutToolbarPlugin);

      // 在 create() 之前配置 upload 插件（处理粘贴/拖拽图片）
      // 注意：.use() 和 .config() 必须在 .create() 之前调用才能生效
      if (articleId) {
        crepe.editor
          .config((ctx) => {
            ctx.update(uploadConfig.key, (prev) => ({
              ...prev,
              enableHtmlFileUploader: true, // 允许从 HTML 粘贴图片
              uploader: async (files, schema) => {
                const nodes: ProseMirrorNode[] = [];
                
                for (let i = 0; i < files.length; i++) {
                  const file = files.item(i);
                  if (!file || !file.type.includes("image")) {
                    continue;
                  }
                  
                  try {
                    console.log("[MilkdownEditor] 上传粘贴的图片:", file.name);
                    const relativeUrl = await uploadImageToServer(file, articleId);
                    const absoluteUrl = toAbsoluteImageUrl(relativeUrl);
                    console.log("[MilkdownEditor] 粘贴图片上传成功:", absoluteUrl);
                    
                    // 创建 image 节点
                    const node = schema.nodes.image.createAndFill({
                      src: absoluteUrl,
                      alt: file.name,
                    });
                    if (node) {
                      nodes.push(node as ProseMirrorNode);
                    }
                  } catch (error) {
                    console.error("[MilkdownEditor] 上传粘贴图片失败:", error);
                  }
                }
                
                return nodes;
              },
            }));
          })
          .use(upload);
      }

      // 使用 on 方法在创建前注册监听器
      crepe.on((listenerManager) => {
        listenerManager.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          try {
            // 检查组件是否仍然挂载且编辑器已创建，避免在销毁后访问上下文
            if (!isMountedRef.current || !isCreatedRef.current) return;
            if (markdown !== prevMarkdown && markdown !== lastValueRef.current) {
              lastValueRef.current = markdown;
              onChange?.(markdown);
            }
          } catch {
            // 忽略编辑器初始化/销毁过程中的错误
          }
        });
      });

createPromise = crepe.create().then(() => {
        console.log("[MilkdownEditor] crepe.create() 完成, isMounted:", isMountedRef.current, "内容长度:", value?.length);
        // 再次检查组件是否仍然挂载
        if (!isMountedRef.current) {
          return;
        }
        isCreatedRef.current = true;
        crepeRef.current = crepe;

        // 设置只读状态
        if (readonly) {
          crepe?.setReadonly(true);
        }

        // 配置 imageBlock 和 inlineImage 的 onUpload（处理 UI 按钮上传的图片）
        // 注意：粘贴/拖拽图片由 upload 插件处理，已在 create() 前配置
        // 注意：这些配置已在 featureConfigs 中通过 Crepe.Feature.ImageBlock 设置，
        // 这里的配置是备用方案，仅在上下文可用时才尝试更新
        if (articleId && crepe) {
          const imageUploadHandler = async (file: File): Promise<string> => {
            console.log("[MilkdownEditor] UI上传图片:", file.name);
            const relativeUrl = await uploadImageToServer(file, articleId);
            const absoluteUrl = toAbsoluteImageUrl(relativeUrl);
            console.log("[MilkdownEditor] UI图片上传成功:", absoluteUrl);
            return absoluteUrl;
          };

          crepe.editor.action((ctx) => {
            // 配置 imageBlock 的 onUpload（处理 UI 上传的块级图片）
            // 使用 try-catch 包裹每个配置，因为上下文可能不存在
            try {
              ctx.update(imageBlockConfig.key, (config) => ({
                ...config,
                onUpload: imageUploadHandler,
              }));
            } catch {
              // imageBlockConfig 上下文不存在，已通过 featureConfigs 配置
            }
            
            // 配置 inlineImage 的 onUpload（处理 UI 上传的行内图片）
            try {
              ctx.update(inlineImageConfig.key, (config) => ({
                ...config,
                onUpload: imageUploadHandler,
              }));
            } catch {
              // inlineImageConfig 上下文不存在，Crepe 默认不启用 inlineImage
            }
          });
        }

        // 添加代码块复制按钮点击反馈
        container.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          const copyButton = target.closest(".copy-button");
          if (copyButton) {
            // 添加复制成功的视觉反馈
            copyButton.classList.add("copied");
            const textNode = Array.from(copyButton.childNodes).find(
              (node) => node.nodeType === Node.TEXT_NODE
            );
            
            // 更改文字为 "Copied!"
            if (textNode) {
              textNode.textContent = "Copied!";
            }
            
            // 1.5秒后恢复原样
            setTimeout(() => {
              copyButton.classList.remove("copied");
              if (textNode) {
                textNode.textContent = "Copy";
              }
            }, 1500);
          }
        });

        // 添加拼写检查插件
        if (shouldEnableSpellCheck && crepe) {
          try {
            crepe.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const spellCheckPlugin = createSpellCheckPlugin();
              
              // 获取当前状态并添加新插件
              const { state } = view;
              const newState = state.reconfigure({
                plugins: [...state.plugins, spellCheckPlugin],
              });
              view.updateState(newState);
            });
          } catch (err) {
            console.warn("拼写检查插件加载失败:", err);
          }
        }

        // 添加斜杠菜单位置自动调整
        let lastAdjustedTop: number | null = null;
        let lastAdjustedLeft: number | null = null;

        const adjustSlashMenuPosition = () => {
          const slashMenu = container.querySelector('.milkdown-slash-menu') as HTMLElement;
          if (!slashMenu || slashMenu.dataset.show === 'false') return;

          const rect = slashMenu.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          const margin = 16; // 距离边缘的最小距离

          let needsAdjustment = false;
          let newTop = parseFloat(slashMenu.style.top) || 0;
          let newLeft = parseFloat(slashMenu.style.left) || 0;

          // 检查是否超出底部
          if (rect.bottom > viewportHeight - margin) {
            const overflowY = rect.bottom - viewportHeight + margin;
            newTop = newTop - overflowY;
            needsAdjustment = true;
          }

          // 检查是否超出顶部（如果向上调整后）
          if (rect.top < margin) {
            newTop = margin;
            needsAdjustment = true;
          }

          // 检查是否超出右侧
          if (rect.right > viewportWidth - margin) {
            const overflowX = rect.right - viewportWidth + margin;
            newLeft = newLeft - overflowX;
            needsAdjustment = true;
          }

          // 检查是否超出左侧
          if (rect.left < margin) {
            newLeft = margin;
            needsAdjustment = true;
          }

          // 只有在需要调整且位置确实变化时才更新
          if (needsAdjustment && (newTop !== lastAdjustedTop || newLeft !== lastAdjustedLeft)) {
            slashMenu.style.top = `${newTop}px`;
            slashMenu.style.left = `${newLeft}px`;
            lastAdjustedTop = newTop;
            lastAdjustedLeft = newLeft;
          }
        };

        // 重置调整记录
        const resetAdjustment = () => {
          lastAdjustedTop = null;
          lastAdjustedLeft = null;
        };

        // 使用 MutationObserver 监控斜杠菜单的显示和位置变化
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
              const target = mutation.target as HTMLElement;
              
              // 监控 data-show 属性变化
              if (mutation.attributeName === 'data-show' && target.classList.contains('milkdown-slash-menu')) {
                if (target.dataset.show === 'true') {
                  resetAdjustment();
                  // 使用多次 RAF 确保位置已经被 FloatingUI 计算完成
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      adjustSlashMenuPosition();
                    });
                  });
                } else {
                  resetAdjustment();
                }
              }
              
              // 监控 style 属性变化（位置更新时）
              if (mutation.attributeName === 'style' && target.classList.contains('milkdown-slash-menu') && target.dataset.show === 'true') {
                requestAnimationFrame(() => {
                  adjustSlashMenuPosition();
                });
              }
            }
          }
        });

        // 监控容器内的变化
        observer.observe(container, {
          subtree: true,
          attributes: true,
          attributeFilter: ['data-show', 'style'],
        });

        // 保存 observer 引用以便清理
        (container as HTMLElement & { _slashMenuObserver?: MutationObserver })._slashMenuObserver = observer;
      }).catch((error) => {
        // 记录创建过程中的错误，包含更多详细信息
        console.error("[MilkdownEditor] crepe.create() 失败:", {
          name: error?.name,
          code: error?.code,
          message: error?.message,
          stack: error?.stack,
        });
        // 输出导致问题的内容前100个字符，帮助调试
        if (value) {
          console.error("[MilkdownEditor] 内容预览 (前500字符):", value.substring(0, 500));
          // 检查是否有可能导致问题的语法
          if (value.includes(":::")) {
            console.error("[MilkdownEditor] 检测到 ::: 语法，可能是 directive");
          }
          if (value.includes("\\[") || value.includes("\\]")) {
            console.error("[MilkdownEditor] 检测到转义方括号 \\[ 或 \\]");
          }
        }
      });
    });

    return () => {
      // 取消 RAF
      cancelAnimationFrame(rafId);

      // 先标记组件已卸载，阻止后续的回调访问上下文
      isMountedRef.current = false;
      isCreatedRef.current = false;
      crepeRef.current = null;

      // 断开斜杠菜单位置观察器
      const slashMenuObserver = (container as HTMLElement & { _slashMenuObserver?: MutationObserver })._slashMenuObserver;
      if (slashMenuObserver) {
        slashMenuObserver.disconnect();
      }

      // 如果编辑器已创建，等待创建完成后再销毁
      if (crepe) {
        if (createPromise) {
          createPromise.finally(() => {
            try {
              crepe?.destroy();
            } catch {
              // 忽略销毁时的错误
            }
          });
        } else {
          try {
            crepe.destroy();
          } catch {
            // 忽略销毁时的错误
          }
        }
      }
    };
  }, [articleId, shouldEnableSpellCheck]); // eslint-disable-line react-hooks/exhaustive-deps

  // 处理只读状态变化
  useEffect(() => {
    if (crepeRef.current) {
      crepeRef.current.setReadonly(readonly);
    }
  }, [readonly]);

  return (
    <div
      ref={editorRef}
      className={`milkdown-editor ${className}`}
    />
  );
}

// 使用 forwardRef 暴露 setContent 方法
export const MilkdownEditor = forwardRef(MilkdownEditorInner);

// 使用 memo 包装，避免父组件重新渲染时不必要的编辑器重新渲染
// 由于编辑器内部管理自己的状态，只有 key 或 articleId 变化时才需要重新创建编辑器实例
export default memo(MilkdownEditor);
