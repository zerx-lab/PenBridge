/**
 * 工具权限配置对话框
 * 允许用户配置哪些 AI 工具需要审核才能执行
 */

import { 
  Settings2, 
  Zap,
  FileText,
  Edit3,
  Database,
  Eye,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { UseToolPermissionsReturn } from "./hooks/useToolPermissions";
import { ToolRegistry, type ToolPermission } from "./types";

interface ToolPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: UseToolPermissionsReturn;
}

// 根据工具定义获取图标
const getToolIcon = (tool: ToolPermission): React.ReactNode => {
  const toolDef = ToolRegistry.getByName(tool.toolName);
  if (!toolDef) {
    return <Settings2 className="h-4 w-4" />;
  }
  
  // 根据工具类型返回图标
  if (toolDef.type === "write") {
    return <Edit3 className="h-4 w-4" />;
  }
  
  // 只读工具根据执行位置返回不同图标
  if (toolDef.executionLocation === "backend") {
    if (tool.toolName === "view_image") {
      return <Eye className="h-4 w-4" />;
    }
    return <Database className="h-4 w-4" />;
  }
  
  return <FileText className="h-4 w-4" />;
};

export function ToolPermissionDialog({ 
  open, 
  onOpenChange,
  permissions,
}: ToolPermissionDialogProps) {
  const { 
    settings, 
    isYoloMode, 
    setYoloMode, 
    setToolApproval,
    setAllToolsApproval,
    resetToDefault,
    getToolList,
  } = permissions;

  const tools = getToolList();
  
  // 分组工具：只读工具 和 修改工具
  const readTools = tools.filter(t => t.type === "read");
  const writeTools = tools.filter(t => t.type === "write");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            工具权限配置
          </DialogTitle>
          <DialogDescription>
            配置 AI 调用工具时是否需要您的审核确认
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* YOLO 模式开关 */}
          <div className={cn(
            "rounded-lg border p-4",
            isYoloMode 
              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" 
              : "border-border"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  isYoloMode 
                    ? "bg-amber-500 text-white" 
                    : "bg-muted text-muted-foreground"
                )}>
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <Label htmlFor="yolo-mode" className="text-base font-medium cursor-pointer">
                    YOLO 模式
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    开启后所有工具无需审核，直接执行
                  </p>
                </div>
              </div>
              <Switch
                id="yolo-mode"
                checked={isYoloMode}
                onCheckedChange={setYoloMode}
              />
            </div>
            {isYoloMode && (
              <div className="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 rounded px-2 py-1">
                AI 将完全自主执行所有操作，包括修改文章内容
              </div>
            )}
          </div>
          
          {/* 分隔线 */}
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">单独配置</span>
            <Separator className="flex-1" />
          </div>
          
          {/* 快捷操作按钮 */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setAllToolsApproval(true)}
              disabled={isYoloMode}
              className="flex-1"
            >
              全部需要审核
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setAllToolsApproval(false)}
              disabled={isYoloMode}
              className="flex-1"
            >
              全部免审核
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={resetToDefault}
              disabled={isYoloMode}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          
          {/* 只读工具 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              只读工具
            </h4>
            <div className="space-y-1">
              {readTools.map(tool => (
                <ToolPermissionItem
                  key={tool.toolName}
                  tool={tool}
                  icon={getToolIcon(tool)}
                  requiresApproval={settings.permissions[tool.toolName] ?? true}
                  onChange={(requires) => setToolApproval(tool.toolName, requires)}
                  disabled={isYoloMode}
                />
              ))}
            </div>
          </div>
          
          {/* 修改工具 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Edit3 className="h-3.5 w-3.5" />
              修改工具
            </h4>
            <div className="space-y-1">
              {writeTools.map(tool => (
                <ToolPermissionItem
                  key={tool.toolName}
                  tool={tool}
                  icon={getToolIcon(tool)}
                  requiresApproval={settings.permissions[tool.toolName] ?? true}
                  onChange={(requires) => setToolApproval(tool.toolName, requires)}
                  disabled={isYoloMode}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 单个工具权限配置项
interface ToolPermissionItemProps {
  tool: ToolPermission;
  icon?: React.ReactNode;
  requiresApproval: boolean;
  onChange: (requires: boolean) => void;
  disabled?: boolean;
}

function ToolPermissionItem({ 
  tool, 
  icon, 
  requiresApproval, 
  onChange,
  disabled,
}: ToolPermissionItemProps) {
  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 rounded-md",
      disabled ? "opacity-50" : "hover:bg-muted/50"
    )}>
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground">
          {icon || <Settings2 className="h-4 w-4" />}
        </span>
        <div>
          <span className="text-sm">{tool.displayName}</span>
          <p className="text-xs text-muted-foreground">{tool.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(
          "text-xs",
          requiresApproval ? "text-amber-600" : "text-green-600"
        )}>
          {requiresApproval ? "需审核" : "自动执行"}
        </span>
        <Switch
          checked={!requiresApproval}
          onCheckedChange={(checked) => onChange(!checked)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
