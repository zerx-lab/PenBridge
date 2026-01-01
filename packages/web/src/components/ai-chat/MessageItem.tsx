import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import type { ChatMessage, PendingChange } from "./types";

interface MessageItemProps {
  message: ChatMessage;
  pendingChanges?: PendingChange[];
  currentPendingChange?: PendingChange | null;
  onAcceptChange?: (change: PendingChange) => void;
  onRejectChange?: (change: PendingChange) => void;
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
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isFailed = message.status === "failed";

  // 用户消息 - 简洁的气泡样式
  if (isUser) {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[85%] bg-blue-500 text-white px-3 py-2 rounded-lg text-sm">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
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
