// 编辑器切换器 - 同时保留两个编辑器实例，通过 CSS 切换可见性
// 避免切换时销毁/重建编辑器导致的严重卡顿（之前需要 2.4 秒）
import {
  forwardRef,
  lazy,
  Suspense,
  useState,
  useCallback,
  useImperativeHandle,
  useRef,
  useEffect,
} from "react";
import { Code, FileText, ChevronDown, Check } from "lucide-react";
import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Button } from "@/components/ui/button";
import type { BaseEditorProps, EditorRef, EditorType } from "./types";
import {
  EDITOR_LABELS,
  EDITOR_DESCRIPTIONS,
  getEditorPreference,
  setEditorPreference,
} from "./types";

// 懒加载编辑器组件
const MilkdownEditorWrapper = lazy(() => import("./MilkdownEditorWrapper"));
const CodeMirrorEditor = lazy(() => import("./CodeMirrorEditor"));

// 编辑器加载中占位组件
function EditorLoading() {
  return (
    <div className="flex items-center justify-center min-h-[300px] text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">加载编辑器中...</span>
      </div>
    </div>
  );
}

// 轻量加载占位（用于非活动编辑器的延迟加载）
function EditorLoadingLight() {
  return <div className="min-h-[300px]" />;
}

// 编辑器图标
const EDITOR_ICONS: Record<EditorType, React.ReactNode> = {
  milkdown: <FileText className="h-4 w-4" />,
  codemirror: <Code className="h-4 w-4" />,
};

export interface EditorSwitcherProps extends BaseEditorProps {
  // 初始编辑器类型（如果不提供则从 localStorage 读取）
  initialEditorType?: EditorType;
  // 编辑器切换回调
  onEditorTypeChange?: (type: EditorType) => void;
  // 是否显示切换按钮
  showSwitcher?: boolean;
  // 编辑器实例 key（用于强制重新渲染）
  editorKey?: number;
}

export interface EditorSwitcherRef extends EditorRef {
  // 获取当前编辑器类型
  getEditorType: () => EditorType;
  // 切换编辑器类型
  switchEditorType: (type: EditorType) => void;
}

function EditorSwitcherInner(
  {
    initialEditorType,
    onEditorTypeChange,
    showSwitcher = true,
    editorKey,
    ...editorProps
  }: EditorSwitcherProps,
  ref: React.ForwardedRef<EditorSwitcherRef>
) {
  // 当前活动的编辑器类型
  const [editorType, setEditorType] = useState<EditorType>(
    () => initialEditorType ?? getEditorPreference()
  );
  
  // 追踪哪些编辑器已经被初始化过（用于延迟加载非活动编辑器）
  const [initializedEditors, setInitializedEditors] = useState<Set<EditorType>>(
    () => new Set([initialEditorType ?? getEditorPreference()])
  );

  // 两个编辑器的 ref
  const milkdownRef = useRef<EditorRef>(null);
  const codemirrorRef = useRef<EditorRef>(null);
  
  // 用于追踪是否正在同步内容（避免循环更新）
  const isSyncingRef = useRef(false);

  // 获取当前活动编辑器的 ref
  const getActiveEditorRef = useCallback(() => {
    return editorType === "milkdown" ? milkdownRef : codemirrorRef;
  }, [editorType]);

  // 处理编辑器切换 - 核心优化：不销毁编辑器，只切换可见性
  const handleEditorTypeChange = useCallback(
    (type: EditorType) => {
      if (type === editorType) return;

      // 获取当前编辑器内容
      const currentRef = getActiveEditorRef();
      const currentContent = currentRef.current?.getContent?.() ?? editorProps.value;

      // 保存偏好设置
      setEditorPreference(type);
      onEditorTypeChange?.(type);

      // 如果目标编辑器还未初始化，先标记为需要初始化
      if (!initializedEditors.has(type)) {
        setInitializedEditors(prev => new Set(prev).add(type));
      }

      // 同步内容到目标编辑器
      // 使用 requestAnimationFrame 确保在 DOM 更新后执行
      requestAnimationFrame(() => {
        const targetRef = type === "milkdown" ? milkdownRef : codemirrorRef;
        if (targetRef.current) {
          isSyncingRef.current = true;
          targetRef.current.setContent(currentContent);
          isSyncingRef.current = false;
        }
      });

      // 如果当前内容与 props.value 不同，触发 onChange 以同步状态
      if (currentContent !== editorProps.value) {
        editorProps.onChange?.(currentContent);
      }

      // 立即切换编辑器类型（只是 CSS display 切换，瞬间完成）
      setEditorType(type);
    },
    [editorType, editorProps, onEditorTypeChange, getActiveEditorRef, initializedEditors]
  );

  // 当 editorKey 变化时（外部强制刷新），同步内容
  useEffect(() => {
    // editorKey 变化时重新同步两个编辑器的内容
    const activeRef = getActiveEditorRef();
    if (activeRef.current) {
      isSyncingRef.current = true;
      activeRef.current.setContent(editorProps.value);
      isSyncingRef.current = false;
    }
  }, [editorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 暴露方法给父组件
  useImperativeHandle(
    ref,
    () => ({
      setContent: (markdown: string): boolean => {
        const activeRef = getActiveEditorRef();
        return activeRef.current?.setContent(markdown) ?? false;
      },
      getContent: (): string => {
        const activeRef = getActiveEditorRef();
        return activeRef.current?.getContent?.() ?? editorProps.value;
      },
      focus: () => {
        const activeRef = getActiveEditorRef();
        activeRef.current?.focus?.();
      },
      getEditorType: () => editorType,
      switchEditorType: handleEditorTypeChange,
    }),
    [editorType, editorProps.value, handleEditorTypeChange, getActiveEditorRef]
  );

  // 处理内容变化 - 只有活动编辑器的变化才触发 onChange
  const handleMilkdownChange = useCallback((content: string) => {
    if (editorType === "milkdown" && !isSyncingRef.current) {
      editorProps.onChange?.(content);
    }
  }, [editorType, editorProps]);

  const handleCodemirrorChange = useCallback((content: string) => {
    if (editorType === "codemirror" && !isSyncingRef.current) {
      editorProps.onChange?.(content);
    }
  }, [editorType, editorProps]);

  // 构建 antd Dropdown 菜单项
  const dropdownItems: MenuProps["items"] = (Object.keys(EDITOR_LABELS) as EditorType[]).map((type) => ({
    key: type,
    label: (
      <div className="flex items-center gap-3 py-1">
        <span className="shrink-0">{EDITOR_ICONS[type]}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{EDITOR_LABELS[type]}</div>
          <div className="text-xs text-muted-foreground truncate">
            {EDITOR_DESCRIPTIONS[type]}
          </div>
        </div>
        {type === editorType && (
          <Check className="h-4 w-4 shrink-0 text-primary" />
        )}
      </div>
    ),
    onClick: () => handleEditorTypeChange(type),
  }));

  // 渲染两个编辑器，通过 CSS display 切换可见性
  return (
    <div className="editor-switcher relative">
      {/* 编辑器切换按钮 */}
      {showSwitcher && (
        <div className="absolute top-0 right-0 z-10">
          <Tooltip title="切换编辑器模式" placement="bottom">
            <Dropdown
              menu={{ items: dropdownItems }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                {EDITOR_ICONS[editorType]}
                <span className="text-xs hidden sm:inline">
                  {EDITOR_LABELS[editorType]}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </Dropdown>
          </Tooltip>
        </div>
      )}

      {/* Milkdown 编辑器 - 始终挂载（首次使用时），通过 display 控制可见性 */}
      <div style={{ display: editorType === "milkdown" ? "block" : "none" }}>
        {initializedEditors.has("milkdown") && (
          <Suspense fallback={<EditorLoading />}>
            <MilkdownEditorWrapper
              key={`milkdown-${editorKey ?? 0}`}
              ref={milkdownRef}
              {...editorProps}
              onChange={handleMilkdownChange}
            />
          </Suspense>
        )}
      </div>

      {/* CodeMirror 编辑器 - 始终挂载（首次使用时），通过 display 控制可见性 */}
      <div style={{ display: editorType === "codemirror" ? "block" : "none" }}>
        {initializedEditors.has("codemirror") && (
          <Suspense fallback={<EditorLoadingLight />}>
            <CodeMirrorEditor
              key={`codemirror-${editorKey ?? 0}`}
              ref={codemirrorRef}
              {...editorProps}
              onChange={handleCodemirrorChange}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

// 使用 forwardRef 暴露方法
export const EditorSwitcher = forwardRef(EditorSwitcherInner);

export default EditorSwitcher;
