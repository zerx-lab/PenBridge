import { useState, useEffect } from "react";

/**
 * 延迟渲染 Hook
 * 用于解决 Dialog 等弹窗打开时的卡顿问题
 * 
 * 原理：先让容器（如 Dialog）渲染出来，然后在下一帧再渲染重型内容
 * 这样用户会立即看到弹窗框架，而不是等待所有内容都准备好
 * 
 * @param isOpen - 是否打开状态
 * @param delay - 延迟时间（毫秒），默认 0 表示使用 requestAnimationFrame
 * @returns shouldRender - 是否应该渲染内容
 */
export function useDeferredRender(isOpen: boolean, delay: number = 0): boolean {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (delay === 0) {
        // 使用 requestAnimationFrame 确保在下一帧渲染
        // 这允许 Dialog 框架先绘制到屏幕上
        const rafId = requestAnimationFrame(() => {
          setShouldRender(true);
        });
        return () => cancelAnimationFrame(rafId);
      } else {
        // 使用 setTimeout 进行延迟
        const timerId = setTimeout(() => {
          setShouldRender(true);
        }, delay);
        return () => clearTimeout(timerId);
      }
    } else {
      // 关闭时立即重置，下次打开时重新延迟
      setShouldRender(false);
    }
  }, [isOpen, delay]);

  return shouldRender;
}

export default useDeferredRender;
