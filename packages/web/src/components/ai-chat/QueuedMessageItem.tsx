/**
 * 待发送消息组件
 * 展示在队列中等待发送的消息
 */

import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QueuedMessage } from "./types";

interface QueuedMessageItemProps {
  message: QueuedMessage;
  index: number;
  onRemove: (id: string) => void;
}

export function QueuedMessageItem({ message, index, onRemove }: QueuedMessageItemProps) {
  const hasImages = message.images && message.images.length > 0;
  const hasText = message.content && message.content.trim().length > 0;

  return (
    <div className="flex justify-end py-2 group">
      {/* 移除按钮 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mr-2 self-center"
        onClick={() => onRemove(message.id)}
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </Button>
      
      <div className="max-w-[85%] bg-blue-400/70 text-white px-3 py-2 rounded-lg text-sm border border-dashed border-blue-300">
        {/* 待发送标记 */}
        <div className="flex items-center gap-1.5 text-[10px] text-blue-100 mb-1.5">
          <Clock className="h-3 w-3" />
          <span>待发送 #{index + 1}</span>
        </div>
        
        {/* 文本内容 */}
        {hasText && (
          <div className="whitespace-pre-wrap break-words opacity-90">{message.content}</div>
        )}
        
        {/* 图片预览 */}
        {hasImages && (
          <div className={cn("flex flex-wrap gap-2", hasText && "mt-2")}>
            {message.images!.map((image, imgIndex) => (
              <img
                key={imgIndex}
                src={image}
                alt={`图片 ${imgIndex + 1}`}
                className="rounded border border-white/20 object-cover opacity-80"
                style={{ maxWidth: 100, maxHeight: 75, objectFit: "cover" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
