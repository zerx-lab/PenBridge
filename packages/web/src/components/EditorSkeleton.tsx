import { Skeleton } from "@/components/ui/skeleton";

/**
 * 编辑器骨架屏组件 - Notion 风格
 * 用于编辑器内容加载时显示
 */
export function EditorSkeleton() {
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
