import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Image } from "antd";
import { Bot, Loader2, Pencil, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import type { ChatMessage, PendingChange } from "./types";

interface MessageItemProps {
  message: ChatMessage;
  pendingChanges?: PendingChange[];
  currentPendingChange?: PendingChange | null;
  onAcceptChange?: (change: PendingChange) => void;
  onRejectChange?: (change: PendingChange) => void;
  // 编辑功能
  onEditMessage?: (messageId: string | number, newContent: string, newImages?: string[]) => Promise<void>;
  isLoading?: boolean;
  isStreaming?: boolean;
}

/**
 * 单条消息组件 - Cline 风格
 * 使用 memo 避免不必要的重新渲染（特别是 ReactMarkdown 渲染会触发图片请求）
 */
export function MessageItem({
  message,
  pendingChanges,
  currentPendingChange,
  onAcceptChange,
  onRejectChange,
  onEditMessage,
  isLoading = false,
  isStreaming: parentIsStreaming = false,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isFailed = message.status === "failed";

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑模式
  const handleStartEdit = useCallback(() => {
    setEditContent(message.content);
    setEditImages(message.images || []);
    setIsEditing(true);
  }, [message.content, message.images]);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent("");
    setEditImages([]);
  }, []);

  // 提交编辑
  const handleSubmitEdit = useCallback(async () => {
    if (!onEditMessage || (!editContent.trim() && editImages.length === 0)) return;
    
    setIsSubmitting(true);
    try {
      await onEditMessage(message.id, editContent.trim(), editImages.length > 0 ? editImages : undefined);
      setIsEditing(false);
      setEditContent("");
      setEditImages([]);
    } finally {
      setIsSubmitting(false);
    }
  }, [onEditMessage, message.id, editContent, editImages]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  }, [handleSubmitEdit, handleCancelEdit]);

  // 移除编辑中的图片
  const handleRemoveEditImage = useCallback((index: number) => {
    setEditImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 自动聚焦编辑框
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // 将光标移到末尾
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // 用户消息 - 简洁的气泡样式
  if (isUser) {
    const hasImages = message.images && message.images.length > 0;
    const hasText = message.content && message.content.trim().length > 0;
    // 是否可以编辑（不在加载或流式输出状态）
    const canEdit = onEditMessage && !isLoading && !parentIsStreaming && !isSubmitting;
    
    // 编辑模式
    if (isEditing) {
      return (
        <div className="flex justify-end py-2">
          <div className="max-w-[85%] w-full">
            {/* 编辑中的图片预览 */}
            {editImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 justify-end">
                {editImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={image}
                      alt={`图片 ${index + 1}`}
                      className="h-16 w-16 object-cover rounded border"
                    />
                    <button
                      onClick={() => handleRemoveEditImage(index)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* 编辑输入框 */}
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-2 border border-blue-200 dark:border-blue-700">
              <Textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="编辑消息..."
                className="resize-none min-h-[60px] max-h-[150px] border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm"
                rows={2}
                disabled={isSubmitting}
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                >
                  <X className="h-3 w-3 mr-1" />
                  取消
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-xs bg-blue-500 hover:bg-blue-600"
                  onClick={handleSubmitEdit}
                  disabled={isSubmitting || (!editContent.trim() && editImages.length === 0)}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  发送
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 普通显示模式
    return (
      <div className="flex justify-end py-2 group">
        {/* 编辑按钮 - hover 时显示 */}
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mr-2 self-center"
            onClick={handleStartEdit}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
        <div className="max-w-[85%] bg-blue-500 text-white px-3 py-2 rounded-lg text-sm">
          {/* 文本内容 */}
          {hasText && (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
          {/* 图片列表 - 使用 antd Image 组件支持预览 */}
          {hasImages && (
            <div className={cn("flex flex-wrap gap-2", hasText && "mt-2")}>
              <Image.PreviewGroup>
                {message.images!.map((image, index) => (
                  <Image
                    key={index}
                    src={image}
                    alt={`图片 ${index + 1}`}
                    width={200}
                    height={150}
                    className="rounded border border-white/20 object-cover"
                    style={{ maxWidth: 200, maxHeight: 150, objectFit: "cover" }}
                  />
                ))}
              </Image.PreviewGroup>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息 - Cline 风格，分块展示
  // 显示顺序：思考过程 → 回答内容 → 工具调用
  // 这符合 AI 的实际输出流程：先思考，然后说明要做什么，最后执行工具

  const hasContent = message.content && message.content.trim().length > 0;
  const hasReasoning = message.reasoning || message.isReasoning;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  // 检查是否是"空的 streaming 消息"（AI Loop 第二轮刚开始时的状态）
  const isEmptyStreaming =
    isStreaming && !hasContent && !hasReasoning && !hasToolCalls;

  return (
    <div className="py-2 space-y-2">
      {/* 空的 streaming 消息 - 显示等待 AI 响应的状态 */}
      {isEmptyStreaming && (
        <div className="flex items-start gap-2">
          <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
              </div>
              <span className="text-xs text-muted-foreground">
                AI 正在回复...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 思考过程块 - 最先显示 */}
      {hasReasoning && (
        <ThinkingBlock
          content={message.reasoning || ""}
          isStreaming={message.isReasoning === true}
        />
      )}

      {/* 回答内容块 - 在思考之后显示 */}
      {(hasContent || (isStreaming && !hasReasoning && !hasToolCalls)) && (
        <div
          className={cn(
            "rounded-md border-l-2 border-purple-400 dark:border-purple-500 bg-muted/50",
            isFailed && "border-red-400 dark:border-red-500"
          )}
        >
          {/* 回答头部 */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50">
            <Bot className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
            <span className="text-xs font-medium text-muted-foreground">
              回答
            </span>
            {isStreaming && !hasReasoning && !hasToolCalls && (
              <Loader2 className="h-3 w-3 text-purple-500 animate-spin ml-1" />
            )}
            {message.status === "completed" && message.usage && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {message.usage.totalTokens} tokens
                {message.duration && ` · ${(message.duration / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>

          {/* 回答内容 - 使用 Markdown 渲染 */}
          <div className="px-3 py-2">
            <div className="text-sm leading-relaxed ai-chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {isStreaming && !hasReasoning && !hasToolCalls && (
                <span className="inline-block w-1.5 h-4 bg-purple-500 animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 工具调用块 - 在回答之后显示，包含 Diff 预览 */}
      {hasToolCalls && (
        <ToolCallBlock
          toolCalls={message.toolCalls!}
          pendingChanges={pendingChanges}
          currentPendingChange={currentPendingChange}
          onAcceptChange={onAcceptChange}
          onRejectChange={onRejectChange}
        />
      )}

      {/* 错误信息 */}
      {isFailed && message.error && (
        <div className="rounded-md border-l-2 border-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2">
          <div className="text-xs text-red-600 dark:text-red-400">
            {message.error}
          </div>
        </div>
      )}
    </div>
  );
}
