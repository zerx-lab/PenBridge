import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface LightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
}

/**
 * 轻量级 Dialog 组件
 * 不使用 Radix，直接用原生实现，性能极佳
 */
export function LightDialog({ open, onOpenChange, children, className }: LightDialogProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // 处理打开/关闭动画
  useEffect(() => {
    if (open) {
      setIsVisible(true)
      // 下一帧开始动画
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    } else {
      setIsAnimating(false)
      // 等待动画结束后隐藏
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  // 阻止背景滚动
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [open])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false)
    }
  }, [onOpenChange])

  if (!isVisible) return null

  // 使用 Portal 渲染到 body，避免被父元素的 transform/filter 等 CSS 影响 fixed 定位
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "transition-opacity duration-150",
        isAnimating ? "opacity-100" : "opacity-0"
      )}
      onClick={handleBackdropClick}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" />
      
      {/* 对话框内容 */}
      <div
        className={cn(
          "relative z-10 w-full max-w-[calc(100%-2rem)] sm:max-w-lg",
          "bg-background rounded-lg border shadow-lg p-6",
          "transition-all duration-150",
          isAnimating 
            ? "opacity-100 scale-100 translate-y-0" 
            : "opacity-0 scale-95 translate-y-2",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

interface LightDialogHeaderProps {
  children: React.ReactNode
  className?: string
}

export function LightDialogHeader({ children, className }: LightDialogHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 text-center sm:text-left", className)}>
      {children}
    </div>
  )
}

interface LightDialogTitleProps {
  children: React.ReactNode
  className?: string
}

export function LightDialogTitle({ children, className }: LightDialogTitleProps) {
  return (
    <h2 className={cn("text-lg leading-none font-semibold", className)}>
      {children}
    </h2>
  )
}

interface LightDialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

export function LightDialogDescription({ children, className }: LightDialogDescriptionProps) {
  return (
    <p className={cn("text-muted-foreground text-sm", className)}>
      {children}
    </p>
  )
}

interface LightDialogContentProps {
  children: React.ReactNode
  className?: string
  showCloseButton?: boolean
  onClose?: () => void
}

export function LightDialogContent({ 
  children, 
  className,
  showCloseButton = true,
  onClose,
}: LightDialogContentProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {showCloseButton && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-0 right-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
    </div>
  )
}

interface LightDialogFooterProps {
  children: React.ReactNode
  className?: string
}

export function LightDialogFooter({ children, className }: LightDialogFooterProps) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}>
      {children}
    </div>
  )
}

export default LightDialog
