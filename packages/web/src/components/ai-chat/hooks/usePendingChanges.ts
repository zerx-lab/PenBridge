/**
 * 待确认变更管理 Hook
 * 负责管理工具调用的待确认变更（接受/拒绝）
 */

import { useState, useCallback, useRef } from "react";
import type { 
  PendingChange,
  ToolCallRecord,
  FrontendToolContext,
} from "../types";
import { applyPendingChange } from "../tools/frontendTools";
import type { MessageContent } from "../tools/toolResultFormatter";

interface UsePendingChangesOptions {
  toolContext: FrontendToolContext;
  updateMessageMutation: {
    mutateAsync: (params: { id: number; toolCalls: any[] }) => Promise<any>;
  };
}

export interface PendingChangesState {
  pendingChanges: PendingChange[];
  setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
  currentPendingChange: PendingChange | null;
  setCurrentPendingChange: React.Dispatch<React.SetStateAction<PendingChange | null>>;
  pendingChangesRef: React.MutableRefObject<PendingChange[]>;
  processedToolResultsRef: React.MutableRefObject<Map<string, string>>;
  pausedStateRef: React.MutableRefObject<{
    messageHistory: Array<{ role: string; content: MessageContent; tool_calls?: any[] }>;
    loopCount: number;
    assistantContent: string;
    toolCalls: ToolCallRecord[];
    dbMessageId?: number;
  } | null>;
  acceptPendingChange: (change: PendingChange) => Promise<void>;
  rejectPendingChange: (change: PendingChange) => Promise<void>;
  resetPendingState: () => void;
}

export function usePendingChanges(
  options: UsePendingChangesOptions,
  setMessages: React.Dispatch<React.SetStateAction<any[]>>,
  resumeAILoop: (toolResults: Array<{ id: string; result: string }>) => Promise<void>
): PendingChangesState {
  const { toolContext, updateMessageMutation } = options;
  
  // 待确认变更状态
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [currentPendingChange, setCurrentPendingChange] = useState<PendingChange | null>(null);
  
  // 使用 ref 跟踪 pendingChanges 的最新值
  const pendingChangesRef = useRef<PendingChange[]>([]);
  pendingChangesRef.current = pendingChanges;
  
  // 暂存的消息历史和循环计数
  const pausedStateRef = useRef<{
    messageHistory: Array<{ role: string; content: MessageContent; tool_calls?: any[] }>;
    loopCount: number;
    assistantContent: string;
    toolCalls: ToolCallRecord[];
    dbMessageId?: number;
  } | null>(null);
  
  // 存储已处理的工具调用结果
  const processedToolResultsRef = useRef<Map<string, string>>(new Map());
  
  // 处理所有变更完成后的 AI Loop 恢复逻辑
  const handleAllChangesProcessed = useCallback(async () => {
    if (!pausedStateRef.current) return;
    
    const toolResults = pausedStateRef.current.toolCalls.map(tc => {
      const savedResult = processedToolResultsRef.current.get(tc.id);
      if (savedResult) {
        return { id: tc.id, result: savedResult };
      }
      return { id: tc.id, result: tc.result || "工具执行完成" };
    });
    
    // 更新数据库中的消息
    if (pausedStateRef.current.dbMessageId) {
      try {
        const updatedToolCalls = pausedStateRef.current.toolCalls.map(tc => {
          const savedResult = processedToolResultsRef.current.get(tc.id);
          return {
            id: tc.id,
            type: tc.type || ("function" as const),
            name: tc.name,
            arguments: tc.arguments,
            result: savedResult || tc.result,
            status: "completed" as const,
            executionLocation: tc.executionLocation || ("frontend" as const),
            error: tc.error,
            completedAt: new Date().toISOString(),
          };
        });
        
        await updateMessageMutation.mutateAsync({
          id: pausedStateRef.current.dbMessageId,
          toolCalls: updatedToolCalls,
        });
      } catch (err) {
        console.error("更新消息状态失败:", err);
      }
    }
    
    // 清空已处理结果的缓存
    processedToolResultsRef.current.clear();
    
    await resumeAILoop(toolResults);
  }, [resumeAILoop, updateMessageMutation]);
  
  // 接受待确认的变更
  const acceptPendingChange = useCallback(async (change: PendingChange) => {
    console.log('[acceptPendingChange] 开始处理变更:', change.id, 'isReadOnly:', change.isReadOnly);
    
    let toolResult: string;
    let applySuccess = true;
    let applyError: string | undefined;
    
    // 只读审批：不应用变更，直接返回工具执行的实际结果
    if (change.isReadOnly) {
      toolResult = change.newValue;
    } else {
      // 写入操作：应用变更
      const result = applyPendingChange(change, toolContext);
      applySuccess = result.success;
      applyError = result.error;
      
      toolResult = result.success
        ? JSON.stringify({ 
            message: change.type === "title" ? "标题已更新" : "内容已更新",
            accepted: true,
          })
        : JSON.stringify({ 
            message: "应用变更失败",
            error: result.error,
          });
    }
    
    // 保存此工具调用的结果
    processedToolResultsRef.current.set(change.toolCallId, toolResult);
    
    if (applySuccess) {
      setMessages(prev => prev.map(m => ({
        ...m,
        toolCalls: m.toolCalls?.map((tc: ToolCallRecord) => 
          tc.id === change.toolCallId
            ? { 
                ...tc, 
                status: "completed" as const,
                result: toolResult,
                completedAt: new Date().toISOString(),
              }
            : tc
        ),
      })));
    } else {
      setMessages(prev => prev.map(m => ({
        ...m,
        toolCalls: m.toolCalls?.map((tc: ToolCallRecord) => 
          tc.id === change.toolCallId
            ? { 
                ...tc, 
                status: "failed" as const,
                error: applyError,
                completedAt: new Date().toISOString(),
              }
            : tc
        ),
      })));
    }
    
    // 从待确认列表中移除
    const remaining = pendingChanges.filter(c => c.id !== change.id);
    
    setPendingChanges(remaining);
    setCurrentPendingChange(remaining[0] || null);
    
    // 如果所有待确认变更都处理完了，恢复 AI Loop
    if (remaining.length === 0 && pausedStateRef.current) {
      await handleAllChangesProcessed();
    }
  }, [toolContext, pendingChanges, setMessages, handleAllChangesProcessed]);
  
  // 拒绝待确认的变更
  const rejectPendingChange = useCallback(async (change: PendingChange) => {
    const toolResult = JSON.stringify({ 
      message: "用户拒绝了此修改，请不要再次尝试相同的修改",
      rejected: true,
    });
    
    // 保存此工具调用的结果
    processedToolResultsRef.current.set(change.toolCallId, toolResult);
    
    // 更新对应工具调用的状态
    setMessages(prev => prev.map(m => ({
      ...m,
      toolCalls: m.toolCalls?.map((tc: ToolCallRecord) => 
        tc.id === change.toolCallId
          ? { 
              ...tc, 
              status: "completed" as const,
              result: toolResult,
              completedAt: new Date().toISOString(),
            }
          : tc
      ),
    })));
    
    // 从待确认列表中移除
    const remaining = pendingChanges.filter(c => c.id !== change.id);
    setPendingChanges(remaining);
    setCurrentPendingChange(remaining[0] || null);
    
    // 如果所有待确认变更都处理完了，恢复 AI Loop
    if (remaining.length === 0 && pausedStateRef.current) {
      await handleAllChangesProcessed();
    }
  }, [pendingChanges, setMessages, handleAllChangesProcessed]);
  
  // 重置所有待确认状态
  const resetPendingState = useCallback(() => {
    setPendingChanges([]);
    setCurrentPendingChange(null);
    pausedStateRef.current = null;
    processedToolResultsRef.current.clear();
  }, []);
  
  return {
    pendingChanges,
    setPendingChanges,
    currentPendingChange,
    setCurrentPendingChange,
    pendingChangesRef,
    processedToolResultsRef,
    pausedStateRef,
    acceptPendingChange,
    rejectPendingChange,
    resetPendingState,
  };
}
