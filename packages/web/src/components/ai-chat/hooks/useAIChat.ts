/**
 * AI 聊天核心 Hook
 * 管理聊天状态、流式响应、工具调用和 AI Loop
 * 支持待确认变更的管理
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { getApiBaseUrl } from "@/utils/serverConfig";
import { getAuthToken } from "@/utils/auth";
import type { 
  ChatMessage, 
  FrontendToolContext,
  ToolCallRecord,
  UseAIChatReturn,
  QueuedMessage,
} from "../types";
import { executeToolCalls } from "../tools/frontendTools";
import { buildContinueMessageHistory, type MessageContent } from "../tools/toolResultFormatter";
import { useChatSession } from "./useChatSession";
import { usePendingChanges } from "./usePendingChanges";
import { DEFAULT_MAX_LOOP_COUNT, ARGS_UPDATE_THROTTLE } from "./constants";

interface UseAIChatOptions {
  articleId?: number;
  toolContext: FrontendToolContext;
  // 权限检查函数：返回 true 表示需要审核
  requiresApproval?: (toolName: string) => boolean;
}

export function useAIChat(options: UseAIChatOptions): UseAIChatReturn {
  const { articleId, toolContext, requiresApproval } = options;
  
  // 加载状态
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLoopCount, setCurrentLoopCount] = useState(0);
  
  // 待发送消息队列
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  // 用于打破循环依赖的 ref
  const sendMessageToAPIRef = useRef<((messageHistory: Array<{ role: string; content: MessageContent }>, loopCount?: number) => Promise<void>) | null>(null);
  
  // 使用会话管理 Hook
  const sessionState = useChatSession({ articleId });
  const {
    session,
    messages,
    setMessages,
    selectedModel,
    setSelectedModel,
    availableModels,
    thinkingSettings,
    setThinkingSettings,
    createNewSession,
    clearMessages: sessionClearMessages,
    addMessageMutation,
    updateMessageMutation,
  } = sessionState;
  
  // 执行后端工具
  const executeBackendTool = useCallback(async (
    toolCallId: string,
    toolName: string,
    args: string
  ): Promise<{ success: boolean; result?: any; error?: string }> => {
    try {
      const token = getAuthToken();
      if (!token) {
        return { success: false, error: "未登录" };
      }
      
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/ai/tool/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          toolCallId,
          toolName,
          arguments: args,
        }),
      });
      
      const data = await response.json();
      return {
        success: data.success,
        result: data.result,
        error: data.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "后端工具执行失败",
      };
    }
  }, []);
  
  // 用于持有 pendingChangesState 的 ref（解决循环依赖）
  const pendingChangesStateRef = useRef<ReturnType<typeof usePendingChanges> | null>(null);
  
  // 恢复 AI Loop（前向声明，用于 usePendingChanges）
  // 注意：使用 ref 来访问 sendMessageToAPI 和 pendingChangesState，避免闭包失效
  const resumeAILoop = useCallback(async (toolResults: Array<{ id: string; result: string }>) => {
    const pendingChangesState = pendingChangesStateRef.current;
    const sendMessageToAPI = sendMessageToAPIRef.current;
    
    if (!pendingChangesState) {
      console.error('[resumeAILoop] pendingChangesState 未初始化');
      return;
    }
    
    const pausedState = pendingChangesState.pausedStateRef.current;
    if (!pausedState || !selectedModel) {
      console.log('[resumeAILoop] 无暂存状态或模型未选择');
      pendingChangesState.pausedStateRef.current = null;
      return;
    }
    
    if (!sendMessageToAPI) {
      console.error('[resumeAILoop] sendMessageToAPI 未初始化');
      return;
    }
    
    console.log('[resumeAILoop] 开始恢复 AI Loop, loopCount:', pausedState.loopCount);
    
    // 更新暂存的工具调用结果
    const updatedToolCalls = pausedState.toolCalls.map(tc => {
      const result = toolResults.find(r => r.id === tc.id);
      if (result) {
        if (tc.status === "awaiting_confirmation") {
          return { ...tc, result: result.result, status: "completed" as const };
        }
        return { ...tc, result: result.result };
      }
      return tc;
    });
    
    // 使用 toolResultFormatter 构建工具结果消息（避免嵌套 JSON 导致的转义问题）
    const newHistory = buildContinueMessageHistory(
      pausedState.messageHistory,
      pausedState.assistantContent,
      updatedToolCalls
    );
    
    // 清除暂存状态
    pendingChangesState.pausedStateRef.current = null;
    
    // 继续 AI Loop
    setIsLoading(true);
    console.log('[resumeAILoop] 调用 sendMessageToAPI, newHistory 长度:', newHistory.length);
    await sendMessageToAPI(newHistory, pausedState.loopCount + 1);
  }, [selectedModel]);
  
  // 使用待确认变更管理 Hook
  const pendingChangesState = usePendingChanges(
    { toolContext, updateMessageMutation },
    setMessages,
    resumeAILoop
  );
  
  // 更新 ref（在 Hook 调用后立即更新）
  pendingChangesStateRef.current = pendingChangesState;
  
  // 发送消息并处理流式响应
  const sendMessageToAPI = useCallback(async (
    messageHistory: Array<{ role: string; content: MessageContent }>,
    loopCount: number = 0
  ): Promise<void> => {
    console.log(`[AI Loop] sendMessageToAPI 开始, loopCount=${loopCount}, 消息数量=${messageHistory.length}`);
    
    // 调试：打印消息历史（包括图片信息）
    console.log('[AI Loop] 消息历史详情:');
    messageHistory.forEach((msg, i) => {
      const isArray = Array.isArray(msg.content);
      if (isArray) {
        console.log(`  [${i}] role=${msg.role}, content=Array[${(msg.content as any[]).length}]`);
        (msg.content as any[]).forEach((part, j) => {
          if (part.type === 'image_url') {
            const url = part.image_url?.url || '';
            console.log(`    part[${j}] type=image_url, url长度=${url.length}, 是base64=${url.startsWith('data:image/')}`);
          } else {
            console.log(`    part[${j}] type=${part.type}, text=${part.text?.substring(0, 50) || ''}`);
          }
        });
      } else {
        const contentPreview = typeof msg.content === 'string' 
          ? msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : '')
          : JSON.stringify(msg.content).substring(0, 200);
        console.log(`  [${i}] role=${msg.role}, content=${contentPreview}`);
      }
      if ((msg as any).tool_calls) {
        console.log(`       tool_calls:`, (msg as any).tool_calls);
      }
      if ((msg as any).tool_call_id) {
        console.log(`       tool_call_id:`, (msg as any).tool_call_id);
      }
    });
    
    if (!selectedModel) {
      setError("请先选择 AI 模型");
      return;
    }
    
    const maxLoopCount = selectedModel.aiLoopConfig?.maxLoops || DEFAULT_MAX_LOOP_COUNT;
    const unlimitedLoop = selectedModel.aiLoopConfig?.unlimited || false;
    
    if (!unlimitedLoop && loopCount >= maxLoopCount) {
      setError(`已达到最大推理次数 (${maxLoopCount})，任务可能过于复杂`);
      setIsLoading(false);
      setIsStreaming(false);
      return;
    }
    
    setCurrentLoopCount(loopCount);
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      const token = getAuthToken();
      if (!token) {
        setError("未登录，请先登录");
        setIsLoading(false);
        return;
      }
      
      const apiBaseUrl = getApiBaseUrl();
      
      const thinkingSupported = selectedModel.capabilities?.reasoning;
      
      const response = await fetch(`${apiBaseUrl}/api/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerId: selectedModel.providerId,
          modelId: selectedModel.modelId,
          messages: messageHistory,
          enableTools: true,
          articleContext: toolContext.articleId ? {
            articleId: toolContext.articleId,
            title: toolContext.title,
            contentLength: toolContext.content.length,
          } : undefined,
          ...(thinkingSupported && thinkingSettings.enabled ? {
            thinkingEnabled: true,
            reasoningEffort: thinkingSettings.reasoningEffort,
          } : {}),
        }),
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      if (!response.body) {
        throw new Error("响应没有 body");
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let assistantReasoning = "";
      let toolCalls: ToolCallRecord[] = [];
      let messageUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
      let messageDuration: number | undefined;
      
      const tempMessageId = `temp_${Date.now()}_loop${loopCount}`;
      currentMessageIdRef.current = tempMessageId;
      
      setMessages(prev => [...prev, {
        id: tempMessageId,
        role: "assistant" as const,
        content: "",
        status: "streaming" as const,
        createdAt: new Date().toISOString(),
      }]);
      
      setIsStreaming(true);
      
      let currentEventType = "";
      let lastArgsUpdateTime = 0;
      let receivedNetworkError = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          if (trimmedLine.startsWith("event:")) {
            currentEventType = trimmedLine.slice(6).trim();
            continue;
          }
          
          if (!trimmedLine.startsWith("data:")) continue;
          
          try {
            const dataStr = trimmedLine.slice(5).trim();
            if (!dataStr) continue;
            
            const data = JSON.parse(dataStr);
            
            switch (currentEventType) {
              case "reasoning_start":
                setMessages(prev => prev.map(m => 
                  m.id === tempMessageId 
                    ? { ...m, reasoning: "", isReasoning: true }
                    : m
                ));
                break;
                
              case "reasoning":
                if (data.content) {
                  assistantReasoning += data.content;
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, reasoning: assistantReasoning, isReasoning: true }
                      : m
                  ));
                }
                break;
                
              case "reasoning_end":
                setMessages(prev => prev.map(m => 
                  m.id === tempMessageId 
                    ? { ...m, isReasoning: false }
                    : m
                ));
                break;
                
              case "content":
                if (data.content) {
                  assistantContent += data.content;
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, content: assistantContent }
                      : m
                  ));
                }
                break;
                
              case "tool_call_start":
                if (data.name) {
                  const newToolCall: ToolCallRecord = {
                    id: data.id || `call_${data.index}`,
                    type: "function" as const,
                    name: data.name,
                    arguments: "",
                    status: "pending" as const,
                    executionLocation: data.executionLocation,
                    isStreamingArguments: true,
                    argumentsLength: 0,
                  };
                  
                  const existingIndex = toolCalls.findIndex(tc => tc.id === newToolCall.id);
                  if (existingIndex === -1) {
                    toolCalls.push(newToolCall);
                  }
                  
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, toolCalls: [...toolCalls] }
                      : m
                  ));
                }
                break;
              
              case "tool_call_arguments":
                if (data.index !== undefined && data.index < toolCalls.length) {
                  if (data.argumentsDelta) {
                    toolCalls[data.index].arguments = (toolCalls[data.index].arguments || "") + data.argumentsDelta;
                  }
                  toolCalls[data.index].argumentsLength = data.argumentsLength || toolCalls[data.index].arguments?.length || 0;
                  
                  const now = Date.now();
                  if (now - lastArgsUpdateTime >= ARGS_UPDATE_THROTTLE) {
                    lastArgsUpdateTime = now;
                    setMessages(prev => prev.map(m => 
                      m.id === tempMessageId 
                        ? { ...m, toolCalls: [...toolCalls] }
                        : m
                    ));
                  }
                }
                break;
                
              case "tool_calls":
                if (data.toolCalls) {
                  toolCalls = data.toolCalls.map((tc: any) => ({
                    id: tc.id,
                    type: tc.type,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                    status: "pending" as const,
                    executionLocation: tc.executionLocation,
                    isStreamingArguments: false,
                    argumentsLength: tc.function.arguments?.length || 0,
                  }));
                  
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, toolCalls }
                      : m
                  ));
                }
                break;
                
              case "done":
                messageUsage = data.usage;
                messageDuration = data.duration;
                setMessages(prev => prev.map(m => 
                  m.id === tempMessageId 
                    ? { 
                        ...m, 
                        status: "completed",
                        usage: data.usage,
                        duration: data.duration,
                        isReasoning: false,
                      }
                    : m
                ));
                break;
                
              case "error":
                if (data.error) {
                  // 检查是否是可重试的网络错误
                  if (data.retryable) {
                    receivedNetworkError = true;
                    console.warn('[AI Chat] 收到可重试的错误:', data.error, data.rawReason);
                  }
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, status: "failed", error: data.error }
                      : m
                  ));
                  setError(data.error);
                }
                break;
                
              default:
                if (data.content) {
                  assistantContent += data.content;
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, content: assistantContent }
                      : m
                  ));
                }
                if (data.toolCalls) {
                  toolCalls = data.toolCalls.map((tc: any) => ({
                    id: tc.id,
                    type: tc.type,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                    status: "pending" as const,
                    executionLocation: tc.executionLocation,
                  }));
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, toolCalls }
                      : m
                  ));
                }
                if (data.success !== undefined) {
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, status: "completed", usage: data.usage, duration: data.duration }
                      : m
                  ));
                }
                if (data.error) {
                  setMessages(prev => prev.map(m => 
                    m.id === tempMessageId 
                      ? { ...m, status: "failed", error: data.error }
                      : m
                  ));
                  setError(data.error);
                }
                break;
            }
            
            currentEventType = "";
          } catch {
            // 忽略解析错误
          }
        }
      }
      
      setIsStreaming(false);
      
      // 如果收到网络错误且没有任何内容，提前返回（错误已在 error 事件中处理）
      if (receivedNetworkError && assistantContent.length === 0 && toolCalls.length === 0) {
        console.log('[AI Chat] 网络错误导致空响应，结束当前请求');
        setIsLoading(false);
        return;
      }
      
      // 如果有工具调用，执行工具并继续对话
      if (toolCalls.length > 0) {
        setMessages(prev => prev.map(m => 
          m.id === tempMessageId 
            ? { ...m, toolCalls: toolCalls.map(tc => ({ ...tc, status: "running" as const })) }
            : m
        ));
        
        const { results: executedToolCalls, pendingChanges: newPendingChanges } = await executeToolCalls(
          toolCalls,
          toolContext,
          executeBackendTool,
          requiresApproval
        );
        
        setMessages(prev => prev.map(m => 
          m.id === tempMessageId 
            ? { ...m, toolCalls: executedToolCalls, status: "completed" }
            : m
        ));
        
        // 如果有待确认的变更
        if (newPendingChanges.length > 0) {
          pendingChangesState.setPendingChanges(prev => {
            const updated = [...prev, ...newPendingChanges];
            if (prev.length === 0) {
              pendingChangesState.setCurrentPendingChange(newPendingChanges[0]);
            }
            return updated;
          });
          
          pendingChangesState.pausedStateRef.current = {
            messageHistory,
            loopCount,
            assistantContent,
            toolCalls: executedToolCalls,
          };
          
          let dbMessageId: number | undefined;
          if (session) {
            try {
              const savedMessage = await addMessageMutation.mutateAsync({
                sessionId: session.id,
                role: "assistant",
                content: assistantContent,
                reasoning: assistantReasoning || undefined,
                status: "completed",
                usage: messageUsage,
                duration: messageDuration,
                toolCalls: executedToolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                  status: tc.status,
                  result: tc.result,
                  error: tc.error,
                })),
              });
              dbMessageId = savedMessage.id;
            } catch (err) {
              console.error("保存消息失败:", err);
            }
          }
          
          if (pendingChangesState.pausedStateRef.current) {
            pendingChangesState.pausedStateRef.current.dbMessageId = dbMessageId;
          }
          
          setIsLoading(false);
          return;
        }
        
        // 保存带工具调用的消息到数据库
        if (session) {
          try {
            await addMessageMutation.mutateAsync({
              sessionId: session.id,
              role: "assistant",
              content: assistantContent,
              reasoning: assistantReasoning || undefined,
              status: "completed",
              usage: messageUsage,
              duration: messageDuration,
              toolCalls: executedToolCalls.map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                status: tc.status,
                result: tc.result,
                error: tc.error,
              })),
            });
          } catch (err) {
            console.error("保存消息失败:", err);
          }
        }
        
        // 使用 toolResultFormatter 构建继续对话的消息历史
        // 避免多次 HTTP 传输导致的 JSON 转义字符累积问题
        const newHistory = buildContinueMessageHistory(
          messageHistory,
          assistantContent,
          executedToolCalls
        );
        
        await sendMessageToAPI(newHistory, loopCount + 1);
      } else {
        // 没有工具调用，保存消息到数据库
        if (session) {
          try {
            await addMessageMutation.mutateAsync({
              sessionId: session.id,
              role: "assistant",
              content: assistantContent,
              reasoning: assistantReasoning || undefined,
              status: "completed",
              usage: messageUsage,
              duration: messageDuration,
            });
          } catch (err) {
            console.error("保存消息失败:", err);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages(prev => prev.map(m => 
          m.id === currentMessageIdRef.current 
            ? { ...m, status: "completed" }
            : m
        ));
      } else {
        setError(err instanceof Error ? err.message : "请求失败");
        setMessages(prev => prev.map(m => 
          m.id === currentMessageIdRef.current 
            ? { ...m, status: "failed", error: (err as Error).message }
            : m
        ));
      }
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [selectedModel, toolContext, session, executeBackendTool, addMessageMutation, requiresApproval, thinkingSettings, setMessages, pendingChangesState]);
  
  // 更新 sendMessageToAPI 的 ref（在函数定义后立即更新）
  sendMessageToAPIRef.current = sendMessageToAPI;
  
  // 发送用户消息
  // content 可以是纯文本，也可以是带图片的多部分消息（JSON 字符串）
  const sendMessage = useCallback(async (content: string, images?: string[]) => {
    if ((!content.trim() && (!images || images.length === 0)) || isLoading || isStreaming) return;
    
    setError(null);
    setIsLoading(true);
    setCurrentLoopCount(0);
    
    // 构建消息内容：如果有图片，使用多部分格式
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    let displayContent: string;
    
    if (images && images.length > 0) {
      // 构建多部分消息内容
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      
      if (content.trim()) {
        parts.push({ type: "text", text: content.trim() });
      }
      
      for (const imageBase64 of images) {
        parts.push({
          type: "image_url",
          image_url: { url: imageBase64 },
        });
      }
      
      messageContent = parts;
      // 显示内容：只显示文本部分，图片由 images 字段单独展示
      displayContent = content.trim();
    } else {
      messageContent = content.trim();
      displayContent = content.trim();
    }
    
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: displayContent,
      status: "completed",
      createdAt: new Date().toISOString(),
      // 保存图片数据用于展示
      images: images && images.length > 0 ? images : undefined,
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    if (session) {
      try {
        await addMessageMutation.mutateAsync({
          sessionId: session.id,
          role: "user",
          content: displayContent,
          status: "completed",
        });
      } catch (err) {
        console.error("保存用户消息失败:", err);
      }
    }
    
    const messageHistory = [
      ...messages.filter(m => m.role !== "tool").map(m => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: messageContent },
    ];
    
    await sendMessageToAPI(messageHistory, 0);
  }, [isLoading, isStreaming, messages, session, addMessageMutation, sendMessageToAPI, setMessages]);
  
  // 停止生成 - 中断所有正在进行的操作并重置状态
  const stopGeneration = useCallback(() => {
    // 中断正在进行的网络请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 重置所有加载状态
    setIsLoading(false);
    setIsStreaming(false);
    
    // 清除待确认变更的暂存状态
    if (pendingChangesState.pausedStateRef.current) {
      pendingChangesState.pausedStateRef.current = null;
    }
    
    // 将当前正在流式输出的消息标记为已完成
    if (currentMessageIdRef.current) {
      setMessages(prev => prev.map(m => 
        m.id === currentMessageIdRef.current 
          ? { 
              ...m, 
              status: "completed" as const,
              // 如果有正在执行的工具调用，标记为失败
              toolCalls: m.toolCalls?.map(tc => 
                tc.status === "running" || tc.status === "pending"
                  ? { ...tc, status: "failed" as const, error: "用户中断" }
                  : tc
              ),
            }
          : m
      ));
      currentMessageIdRef.current = null;
    }
  }, [setMessages, pendingChangesState]);
  
  // 清空消息（扩展版本）
  const clearMessages = useCallback(async () => {
    await sessionClearMessages();
    pendingChangesState.resetPendingState();
    setCurrentLoopCount(0);
    setError(null);
  }, [sessionClearMessages, pendingChangesState]);
  
  // 编辑并重新发送消息
  // 找到指定的用户消息，删除该消息及其后的所有消息，然后发送新消息
  const editAndResend = useCallback(async (messageId: string | number, newContent: string, newImages?: string[]) => {
    if ((!newContent.trim() && (!newImages || newImages.length === 0)) || isLoading || isStreaming) return;
    
    // 找到要编辑的消息的索引
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      console.error('[editAndResend] 未找到消息:', messageId);
      return;
    }
    
    // 验证这是一个用户消息
    const targetMessage = messages[messageIndex];
    if (targetMessage.role !== "user") {
      console.error('[editAndResend] 只能编辑用户消息');
      return;
    }
    
    setError(null);
    setIsLoading(true);
    setCurrentLoopCount(0);
    
    // 截断消息列表，保留编辑消息之前的所有消息
    const messagesBeforeEdit = messages.slice(0, messageIndex);
    
    // 构建消息内容：如果有图片，使用多部分格式
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    let displayContent: string;
    
    if (newImages && newImages.length > 0) {
      // 构建多部分消息内容
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      
      if (newContent.trim()) {
        parts.push({ type: "text", text: newContent.trim() });
      }
      
      for (const imageBase64 of newImages) {
        parts.push({
          type: "image_url",
          image_url: { url: imageBase64 },
        });
      }
      
      messageContent = parts;
      displayContent = newContent.trim();
    } else {
      messageContent = newContent.trim();
      displayContent = newContent.trim();
    }
    
    // 创建新的用户消息
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: displayContent,
      status: "completed",
      createdAt: new Date().toISOString(),
      images: newImages && newImages.length > 0 ? newImages : undefined,
    };
    
    // 更新消息列表：保留编辑前的消息 + 新的用户消息
    setMessages([...messagesBeforeEdit, userMessage]);
    
    // 保存用户消息到数据库
    if (session) {
      try {
        await addMessageMutation.mutateAsync({
          sessionId: session.id,
          role: "user",
          content: displayContent,
          status: "completed",
        });
      } catch (err) {
        console.error("保存用户消息失败:", err);
      }
    }
    
    // 构建消息历史并发送
    const messageHistory = [
      ...messagesBeforeEdit.filter(m => m.role !== "tool").map(m => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: messageContent },
    ];
    
    await sendMessageToAPI(messageHistory, 0);
  }, [isLoading, isStreaming, messages, session, addMessageMutation, sendMessageToAPI, setMessages]);
  
  // 添加消息到队列（AI 正在回复时使用）
  const queueMessage = useCallback((content: string, images?: string[]) => {
    const newQueuedMessage: QueuedMessage = {
      id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      images: images && images.length > 0 ? images : undefined,
      createdAt: new Date(),
    };
    setQueuedMessages(prev => [...prev, newQueuedMessage]);
  }, []);
  
  // 移除队列中的消息
  const removeQueuedMessage = useCallback((id: string) => {
    setQueuedMessages(prev => prev.filter(m => m.id !== id));
  }, []);
  
  // 清空队列
  const clearQueuedMessages = useCallback(() => {
    setQueuedMessages([]);
  }, []);
  
  // 用于自动发送队列消息的 ref（避免闭包问题）
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  
  // 当 AI 回复完成后，自动发送队列中的第一条消息
  useEffect(() => {
    // 只在不处于加载/流式状态且队列中有消息时处理
    if (!isLoading && !isStreaming && queuedMessages.length > 0) {
      const firstMessage = queuedMessages[0];
      // 移除已发送的消息
      setQueuedMessages(prev => prev.slice(1));
      // 发送消息
      sendMessageRef.current(firstMessage.content, firstMessage.images);
    }
  }, [isLoading, isStreaming, queuedMessages]);
  
  return {
    session,
    messages,
    isLoading,
    isStreaming,
    error,
    selectedModel,
    availableModels,
    setSelectedModel,
    thinkingSettings,
    setThinkingSettings,
    sendMessage,
    queueMessage,
    stopGeneration,
    clearMessages,
    createNewSession,
    editAndResend,
    queuedMessages,
    removeQueuedMessage,
    clearQueuedMessages,
    currentLoopCount,
    maxLoopCount: selectedModel?.aiLoopConfig?.maxLoops || DEFAULT_MAX_LOOP_COUNT,
    unlimitedLoop: selectedModel?.aiLoopConfig?.unlimited || false,
    pendingChanges: pendingChangesState.pendingChanges,
    currentPendingChange: pendingChangesState.currentPendingChange,
    acceptPendingChange: pendingChangesState.acceptPendingChange,
    rejectPendingChange: pendingChangesState.rejectPendingChange,
  };
}
