/**
 * 工具调用展示组件
 * 显示工具调用的名称、参数、状态和结果
 * 支持显示待确认的变更（Diff预览）
 */

import { useState, useRef, useEffect } from "react";
import { 
  ChevronDown, 
  ChevronRight, 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Loader2,
  FileText,
  Edit3,
  Database,
  Clock,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { InlineDiffPreview } from "./InlineDiffPreview";
import type { ToolCallRecord, PendingChange } from "./types";
import { ToolRegistry } from "./types";

interface ToolCallBlockProps {
  toolCalls: ToolCallRecord[];
  className?: string;
  // 待确认的变更（用于显示 Diff 预览）
  pendingChanges?: PendingChange[];
  // 当前正在审核的变更（逐个显示，而不是同时显示所有待确认变更）
  currentPendingChange?: PendingChange | null;
  onAcceptChange?: (change: PendingChange) => void;
  onRejectChange?: (change: PendingChange) => void;
}

// 工具图标映射（根据工具类型和执行位置）
const getToolIcon = (toolName: string): React.ReactNode => {
  const tool = ToolRegistry.getByName(toolName);
  if (!tool) {
    return <Wrench className="h-3.5 w-3.5" />;
  }
  
  // 根据工具类型返回图标
  if (tool.type === "write") {
    return <Edit3 className="h-3.5 w-3.5" />;
  }
  
  // 只读工具根据执行位置返回不同图标
  if (tool.executionLocation === "backend") {
    if (toolName === "view_image") {
      return <Eye className="h-3.5 w-3.5" />;
    }
    return <Database className="h-3.5 w-3.5" />;
  }
  
  return <FileText className="h-3.5 w-3.5" />;
};

// 获取工具信息（从工具注册表获取，支持未注册的工具显示默认信息）
const getToolInfo = (toolName: string): { name: string; description: string } => {
  const tool = ToolRegistry.getByName(toolName);
  if (tool) {
    return { name: tool.displayName, description: tool.description };
  }
  // 未注册的工具返回默认信息
  return { name: toolName, description: `执行 ${toolName} 工具` };
};



// 状态图标和颜色
const statusConfig = {
  pending: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    label: "准备中",
    tooltip: "工具准备执行中",
  },
  running: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "执行中",
    tooltip: "工具正在执行",
  },
  completed: {
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "已完成",
    tooltip: "工具执行完成",
  },
  failed: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "失败",
    tooltip: "工具执行失败",
  },
  awaiting_confirmation: {
    icon: <Clock className="h-3.5 w-3.5" />,
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "待确认",
    tooltip: "等待您确认修改",
  },
};

interface SingleToolCallProps {
  toolCall: ToolCallRecord;
  pendingChange?: PendingChange;
  // 当前正在审核的变更（用于判断是否显示 Diff 预览）
  currentPendingChange?: PendingChange | null;
  onAcceptChange?: (change: PendingChange) => void;
  onRejectChange?: (change: PendingChange) => void;
}

function SingleToolCall({ toolCall, pendingChange, currentPendingChange, onAcceptChange, onRejectChange }: SingleToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const argsRef = useRef<HTMLPreElement>(null);
  
  // 是否正在流式生成参数
  const isStreamingArgs = toolCall.isStreamingArguments && toolCall.status === "pending";
  
  // 是否有待确认的变更：必须同时满足工具状态是 awaiting_confirmation 且有对应的 pendingChange
  // 这样可以避免状态更新延迟导致的 UI 不一致问题
  const hasPendingChange = toolCall.status === "awaiting_confirmation" && !!pendingChange;
  // 是否是当前正在审核的变更（只有当前变更才显示 Diff 预览，其他待确认的显示等待状态）
  const isCurrentPending = hasPendingChange && currentPendingChange?.id === pendingChange?.id;
  
  // 流式生成参数时自动展开并滚动到底部
  useEffect(() => {
    if (isStreamingArgs && toolCall.argumentsLength && toolCall.argumentsLength > 0) {
      setIsExpanded(true);
    }
  }, [isStreamingArgs, toolCall.argumentsLength]);
  
  // 参数区域自动滚动到底部
  useEffect(() => {
    if (isStreamingArgs && isExpanded && argsRef.current) {
      argsRef.current.scrollTop = argsRef.current.scrollHeight;
    }
  }, [toolCall.arguments, isStreamingArgs, isExpanded]);
  
  const status = statusConfig[toolCall.status];
  const icon = getToolIcon(toolCall.name);
  const info = getToolInfo(toolCall.name);
  const displayName = info.name;
  const toolDescription = info.description;
  
  // 格式化参数长度显示
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} 字符`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };
  
  // 解析参数
  // 流式生成时参数可能是不完整的 JSON，此时显示原始字符串
  let parsedArgs: Record<string, any> = {};
  let rawArgs = toolCall.arguments || "";
  let parseError = false;
  
  if (rawArgs) {
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch {
      // JSON 解析失败，可能是不完整的 JSON（流式生成中）
      parseError = true;
    }
  }
  
  // 解析结果
  let parsedResult: any = null;
  try {
    if (toolCall.result) {
      parsedResult = JSON.parse(toolCall.result);
    }
  } catch {
    parsedResult = toolCall.result;
  }
  
  // 如果有待确认的变更
  if (hasPendingChange) {
    // 如果是当前正在审核的变更，显示 Diff 预览
    if (isCurrentPending && onAcceptChange && onRejectChange) {
      return (
        <InlineDiffPreview
          pendingChange={pendingChange}
          onAccept={onAcceptChange}
          onReject={onRejectChange}
        />
      );
    }
    
    // 如果不是当前正在审核的变更，显示等待审核状态
    return (
      <div className="rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-4 w-4 animate-pulse" />
          <span className="font-medium">
            {getToolInfo(toolCall.name).name}
          </span>
          <span className="text-xs">- 等待审核...</span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          {pendingChange?.description}
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {/* 工具调用信息卡片 */}
      <div className={cn(
        "rounded-md border",
        status.bgColor
      )}>
        {/* 头部 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-md"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1.5 cursor-help">
                  <span className={cn("shrink-0", status.color)}>
                    {icon}
                  </span>
                  <span className="text-xs font-medium truncate">
                    {displayName}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {toolDescription}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 流式生成参数时显示进度 */}
          {isStreamingArgs && toolCall.argumentsLength !== undefined && toolCall.argumentsLength > 0 && (
            <span className="text-[10px] text-muted-foreground ml-1">
              ({formatSize(toolCall.argumentsLength)})
            </span>
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("ml-auto shrink-0 cursor-help", status.color)}>
                  {status.icon}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {status.tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 流式生成参数时显示状态文字 */}
          {isStreamingArgs && (
            <span className="text-[10px] text-blue-500 ml-1 whitespace-nowrap">
              生成中...
            </span>
          )}
          
          {toolCall.executionLocation === "backend" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
              服务端
            </span>
          )}
        </button>
        
        {/* 展开内容 */}
        {isExpanded && (
          <div className="px-2.5 pb-2 pt-1 space-y-2 border-t border-black/5 dark:border-white/5">
            {/* 参数 */}
            {(Object.keys(parsedArgs).length > 0 || isStreamingArgs || rawArgs) && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">
                  参数
                  {isStreamingArgs && (
                    <span className="ml-1 text-blue-500">
                      <Loader2 className="h-2.5 w-2.5 animate-spin inline" />
                    </span>
                  )}
                </div>
                <pre 
                  ref={argsRef}
                  className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-auto max-h-[200px] whitespace-pre-wrap break-all"
                >
                  {/* 流式生成中或解析失败时显示原始字符串，否则显示格式化的 JSON */}
                  {(isStreamingArgs || parseError) ? rawArgs : JSON.stringify(parsedArgs, null, 2)}
                  {isStreamingArgs && (
                    <span className="inline-block w-1.5 h-3 bg-blue-500 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              </div>
            )}
            
            {/* 结果 */}
            {parsedResult && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">结果</div>
                <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto max-h-40">
                  {typeof parsedResult === "string" 
                    ? parsedResult 
                    : JSON.stringify(parsedResult, null, 2)
                  }
                </pre>
              </div>
            )}
            
            {/* 错误 */}
            {toolCall.error && (
              <div>
                <div className="text-[10px] font-medium text-red-500 mb-1">错误</div>
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
                  {toolCall.error}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolCallBlock({ 
  toolCalls, 
  className,
  pendingChanges,
  currentPendingChange,
  onAcceptChange,
  onRejectChange,
}: ToolCallBlockProps) {
  if (!toolCalls || toolCalls.length === 0) return null;
  
  // 检查是否有正在执行的工具
  const hasRunningTools = toolCalls.some(tc => tc.status === "running");
  // 检查是否有正在生成参数的工具
  const hasStreamingArgs = toolCalls.some(tc => tc.isStreamingArguments && tc.status === "pending");
  // 检查是否有等待确认的工具
  const hasAwaitingTools = toolCalls.some(tc => tc.status === "awaiting_confirmation");
  
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5 cursor-help">
                <Wrench className="h-3 w-3" />
                <span>工具调用 ({toolCalls.length})</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>AI 正在使用工具来完成任务</p>
              <p className="text-muted-foreground">共 {toolCalls.length} 个工具调用</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {hasStreamingArgs && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-blue-500 ml-1 cursor-help">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>生成参数中...</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                AI 正在生成工具调用所需的参数
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {!hasStreamingArgs && hasRunningTools && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-blue-500 ml-1 cursor-help">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>执行中...</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                工具正在执行，请稍候
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {!hasStreamingArgs && !hasRunningTools && hasAwaitingTools && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-amber-500 ml-1 cursor-help">
                  <Clock className="h-3 w-3" />
                  <span>等待确认</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                有修改需要您确认才能应用
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {toolCalls.map((toolCall, index) => {
        // 查找对应的待确认变更
        const pendingChange = pendingChanges?.find(pc => pc.toolCallId === toolCall.id);
        return (
          <SingleToolCall 
            key={toolCall.id || index} 
            toolCall={toolCall}
            pendingChange={pendingChange}
            currentPendingChange={currentPendingChange}
            onAcceptChange={onAcceptChange}
            onRejectChange={onRejectChange}
          />
        );
      })}
    </div>
  );
}
