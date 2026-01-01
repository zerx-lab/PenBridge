import { Bot } from "lucide-react";

interface AILoadingIndicatorProps {
  message?: string;
}

/**
 * AI 正在思考/工作的 Loading 状态组件
 */
export function AILoadingIndicator({ message }: AILoadingIndicatorProps) {
  return (
    <div className="py-2">
      <div className="flex items-start gap-2">
        {/* AI 头像 */}
        <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
          <Bot className="h-4 w-4 text-white" />
        </div>
        {/* 加载内容 */}
        <div className="flex-1 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
            </div>
            <span className="text-xs text-muted-foreground">
              {message || "AI 正在思考..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
