import { ReactNode, useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  Settings2,
  Maximize2,
  Type,
  List,
  Hash,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import MilkdownEditor from "@/components/MilkdownEditor";
import { countWords, formatWordCountDetail } from "@/utils/wordCount";

// 编辑器骨架屏组件 - Notion 风格
function EditorSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      {/* 模拟段落块 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[95%]" />
        <Skeleton className="h-4 w-[88%]" />
      </div>

      {/* 空行 */}
      <div className="h-2" />

      {/* 模拟第二段 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[75%]" />
      </div>

      {/* 空行 */}
      <div className="h-2" />

      {/* 模拟代码块或引用 */}
      <div className="pl-4 border-l-2 border-muted space-y-2">
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[70%]" />
      </div>

      {/* 空行 */}
      <div className="h-2" />

      {/* 模拟第三段 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[82%]" />
        <Skeleton className="h-4 w-[60%]" />
      </div>

      {/* 加载提示 */}
      <div className="flex items-center gap-2 pt-4 text-sm text-muted-foreground">
        <div className="h-1 w-1 rounded-full bg-muted-foreground/50 animate-pulse" />
        <div className="h-1 w-1 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:150ms]" />
        <div className="h-1 w-1 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:300ms]" />
        <span className="ml-1">正在加载内容...</span>
      </div>
    </div>
  );
}

// Notion 风格设置项组件
interface SettingItemProps {
  icon: ReactNode;
  label: string;
  description?: string;
  action?: ReactNode;
  onClick?: () => void;
}

function SettingItem({ icon, label, description, action, onClick }: SettingItemProps) {
  const content = (
    <div className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-accent/50 transition-colors group -mx-2">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          {icon}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      {action && <div className="flex items-center">{action}</div>}
      {description && !action && (
        <span className="text-sm text-muted-foreground">{description}</span>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button className="w-full text-left" onClick={onClick}>
        {content}
      </button>
    );
  }

  return content;
}

// 编辑器宽度设置
const WIDTH_STORAGE_KEY = "editor-fullwidth-preference";
const SMALL_FONT_KEY = "editor-small-font-preference";
const SHOW_TOC_KEY = "editor-show-toc-preference";
const AUTO_HEADING_NUMBER_KEY = "editor-auto-heading-number-preference";
const STANDARD_WIDTH = "768px";
const FULL_WIDTH = "85%";

export interface ArticleEditorLayoutProps {
  // 文章数据
  title: string;
  content: string;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;

  // 面包屑配置
  breadcrumbLabel: string;

  // 状态相关
  isPublished?: boolean;
  statusIndicator?: ReactNode;

  // 内容加载状态（用于显示骨架屏）
  isContentLoading?: boolean;

  // 操作按钮区域（保存、发布等）
  actionButtons: ReactNode;

  // 设置弹窗额外内容
  settingsContent?: ReactNode;

  // 可选：标题输入框 ref（用于新建后聚焦）
  titleInputRef?: React.RefObject<HTMLInputElement | null>;

  // 可选：编辑器 key（用于强制重新渲染）
  editorKey?: number;

  // 可选：文章 ID（用于图片上传）
  articleId?: number;
}

export function ArticleEditorLayout({
  title,
  content,
  onTitleChange,
  onContentChange,
  breadcrumbLabel,
  isPublished = false,
  statusIndicator,
  isContentLoading = false,
  actionButtons,
  settingsContent,
  titleInputRef: externalTitleInputRef,
  editorKey,
  articleId,
}: ArticleEditorLayoutProps) {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullWidth, setIsFullWidth] = useState(() => {
    const saved = localStorage.getItem(WIDTH_STORAGE_KEY);
    return saved === "true";
  });
  const [isSmallFont, setIsSmallFont] = useState(() => {
    const saved = localStorage.getItem(SMALL_FONT_KEY);
    return saved === "true";
  });
  const [showToc, setShowToc] = useState(() => {
    const saved = localStorage.getItem(SHOW_TOC_KEY);
    return saved === "true";
  });
  const [autoHeadingNumber, setAutoHeadingNumber] = useState(() => {
    const saved = localStorage.getItem(AUTO_HEADING_NUMBER_KEY);
    return saved === "true";
  });

  // 内部 ref，如果外部没有提供
  const internalTitleInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = externalTitleInputRef || internalTitleInputRef;

  // 保存偏好到 localStorage
  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(isFullWidth));
  }, [isFullWidth]);

  useEffect(() => {
    localStorage.setItem(SMALL_FONT_KEY, String(isSmallFont));
  }, [isSmallFont]);

  useEffect(() => {
    localStorage.setItem(SHOW_TOC_KEY, String(showToc));
  }, [showToc]);

  useEffect(() => {
    localStorage.setItem(AUTO_HEADING_NUMBER_KEY, String(autoHeadingNumber));
  }, [autoHeadingNumber]);

  // 计算字数统计
  const wordCount = useMemo(() => {
    // 统计标题和内容
    const fullText = title + "\n\n" + content;
    return countWords(fullText);
  }, [title, content]);

  // 总字数（中文字符 + 英文单词）
  const totalWords = wordCount.chineseCharacters + wordCount.englishWords;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部工具栏 - 简洁风格 */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate({ to: "/articles" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center text-sm text-muted-foreground">
            <span>文章</span>
            <ChevronRight className="h-3 w-3 mx-1" />
            <span className="text-foreground truncate max-w-[200px]">
              {breadcrumbLabel}
            </span>
          </div>
          {isPublished && (
            <Badge variant="default" className="ml-2">
              已发布
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 状态指示器（如保存状态） */}
          {statusIndicator}

          {/* 操作按钮区域 */}
          {actionButtons}

          {/* 设置按钮 - 放在最右侧 */}
          <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[300px] p-0 border-l top-8 h-[calc(100%-32px)]">
              <div className="flex flex-col h-full">
                {/* 标题头部 */}
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle className="text-sm font-medium">页面设置</SheetTitle>
                </SheetHeader>

                {/* 设置内容 - Notion 风格 */}
                <ScrollArea className="flex-1">
                  <div className="px-4 py-3 space-y-1">
                    {/* 自适应宽度 */}
                    <SettingItem
                      icon={<Maximize2 className="h-4 w-4" />}
                      label="自适应宽度"
                      action={
                        <Switch
                          checked={isFullWidth}
                          onCheckedChange={setIsFullWidth}
                          className="scale-90"
                        />
                      }
                    />

                    {/* 小字体 */}
                    <SettingItem
                      icon={<Type className="h-4 w-4" />}
                      label="小字体"
                      action={
                        <Switch
                          checked={isSmallFont}
                          onCheckedChange={setIsSmallFont}
                          className="scale-90"
                        />
                      }
                    />

                    {/* 标题目录 */}
                    <SettingItem
                      icon={<List className="h-4 w-4" />}
                      label="标题目录"
                      action={
                        <Switch
                          checked={showToc}
                          onCheckedChange={setShowToc}
                          className="scale-90"
                        />
                      }
                    />

                    {/* 标题自动编号 */}
                    <SettingItem
                      icon={<Hash className="h-4 w-4" />}
                      label="标题自动编号"
                      action={
                        <Switch
                          checked={autoHeadingNumber}
                          onCheckedChange={setAutoHeadingNumber}
                          className="scale-90"
                        />
                      }
                    />

                    {/* 分隔线 */}
                    <div className="my-2 border-t" />

                    {/* 额外设置内容（如导入 Word） */}
                    {settingsContent}

                    {/* 分隔线 */}
                    <div className="my-2 border-t" />

                    {/* 统计信息区域 */}
                    <div className="py-2">
                      <div className="flex items-center gap-3 mb-2 px-2 -mx-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">统计信息</span>
                      </div>
                      <div className="ml-7 space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>总字数:</span>
                          <span className="text-foreground">{totalWords}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>段落数:</span>
                          <span className="text-foreground">{wordCount.paragraphs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>行数:</span>
                          <span className="text-foreground">{wordCount.lines}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* 主编辑区域 - 全屏沉浸式 */}
      <div className="flex-1 overflow-auto">
        <div
          className={`mx-auto px-6 py-8 transition-all duration-300 ${isSmallFont ? 'text-sm' : ''}`}
          style={{ maxWidth: isFullWidth ? FULL_WIDTH : STANDARD_WIDTH }}
        >
          {/* 标题输入 - Notion 风格 */}
          <input
            ref={titleInputRef}
            placeholder="无标题"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className={`w-full bg-transparent font-normal py-0 px-0 border-0 outline-none placeholder:text-muted-foreground/40 ${isSmallFont ? 'text-2xl' : ''}`}
            style={{ 
              fontSize: isSmallFont ? undefined : '30px', 
              lineHeight: '1.2', 
              fontWeight: '550' 
            }}
          />
          <div className="h-px bg-border/40 mt-3 mb-4" />

          {/* Markdown 编辑器 / 骨架屏 */}
          {isContentLoading ? (
            <EditorSkeleton />
          ) : (
            <MilkdownEditor
              key={editorKey}
              value={content}
              onChange={onContentChange}
              placeholder="开始写作..."
              className="min-h-[calc(100vh-200px)]"
              articleId={articleId}
            />
          )}
        </div>

        {/* 字数统计 - 右下角固定 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-muted/80 backdrop-blur-sm rounded-full text-xs text-muted-foreground cursor-default select-none shadow-sm border">
                {totalWords} 字
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="space-y-1">
                <div>{formatWordCountDetail(wordCount)}</div>
                <div className="text-muted-foreground">
                  {wordCount.paragraphs} 段 | {wordCount.lines} 行
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export default ArticleEditorLayout;
