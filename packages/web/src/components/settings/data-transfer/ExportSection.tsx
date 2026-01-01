import { useState } from "react";
import {
  FileDown,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/utils/trpc";
import { message } from "antd";
import type { ExportOptions } from "./types";
import { defaultExportOptions } from "./types";

// 数据导出组件
export function ExportSection() {
  const [exportOptions, setExportOptions] = useState<ExportOptions>(defaultExportOptions);
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 导出数据 mutation
  const exportMutation = trpc.dataTransfer.export.useMutation({
    onSuccess: (data: any) => {
      // 将 base64 转换为 Blob 并下载为 ZIP 文件
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `penbridge-backup-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success("数据导出成功");
    },
    onError: (error: Error) => {
      message.error(`导出失败: ${error.message}`);
    },
  });

  // 处理导出
  const handleExport = () => {
    setIsExporting(true);
    exportMutation.mutate({
      includeArticles: exportOptions.includeArticles,
      includeFolders: exportOptions.includeFolders,
      includeUsers: exportOptions.includeUsers,
      includeAdminUsers: exportOptions.includeAdminUsers,
      includeAIConfig: exportOptions.includeAIProviders,
      includeEmailConfig: exportOptions.includeEmailConfig,
      includeScheduledTasks: exportOptions.includeScheduledTasks,
      includeImages: exportOptions.includeImages,
      includeSensitiveData: exportOptions.includeSensitiveData,
      encryptionPassword: exportOptions.encryptionPassword || undefined,
    }, {
      onSettled: () => setIsExporting(false),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileDown className="h-4 w-4" />
          数据导出
        </CardTitle>
        <CardDescription>
          将应用数据导出为 ZIP 压缩包，包含数据库和图片文件
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 导出选项 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">选择导出内容</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-articles" className="text-sm font-normal cursor-pointer">
                文章数据
              </Label>
              <Switch
                id="export-articles"
                checked={exportOptions.includeArticles}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeArticles: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-folders" className="text-sm font-normal cursor-pointer">
                文件夹结构
              </Label>
              <Switch
                id="export-folders"
                checked={exportOptions.includeFolders}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeFolders: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-users" className="text-sm font-normal cursor-pointer">
                平台登录信息
              </Label>
              <Switch
                id="export-users"
                checked={exportOptions.includeUsers}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeUsers: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-admin" className="text-sm font-normal cursor-pointer">
                管理员账户
              </Label>
              <Switch
                id="export-admin"
                checked={exportOptions.includeAdminUsers}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeAdminUsers: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-ai" className="text-sm font-normal cursor-pointer">
                AI 配置
              </Label>
              <Switch
                id="export-ai"
                checked={exportOptions.includeAIProviders}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeAIProviders: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-email" className="text-sm font-normal cursor-pointer">
                邮件配置
              </Label>
              <Switch
                id="export-email"
                checked={exportOptions.includeEmailConfig}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeEmailConfig: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-tasks" className="text-sm font-normal cursor-pointer">
                定时任务
              </Label>
              <Switch
                id="export-tasks"
                checked={exportOptions.includeScheduledTasks}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeScheduledTasks: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <Label htmlFor="export-images" className="text-sm font-normal cursor-pointer">
                文章图片
              </Label>
              <Switch
                id="export-images"
                checked={exportOptions.includeImages}
                onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeImages: checked })}
              />
            </div>
          </div>
        </div>

        {/* 敏感数据选项 */}
        <div className="p-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <Label htmlFor="export-sensitive" className="text-sm font-medium text-amber-700 dark:text-amber-400 cursor-pointer">
                包含敏感数据
              </Label>
            </div>
            <Switch
              id="export-sensitive"
              checked={exportOptions.includeSensitiveData}
              onCheckedChange={(checked) => setExportOptions({ ...exportOptions, includeSensitiveData: checked })}
            />
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            包含登录凭证、API Key 等敏感信息。建议设置加密密码保护。
          </p>
        </div>

        {/* 加密密码 */}
        {exportOptions.includeSensitiveData && (
          <div className="space-y-2">
            <Label htmlFor="export-password" className="flex items-center gap-2">
              <Lock className="h-3 w-3" />
              加密密码（可选）
            </Label>
            <div className="relative">
              <Input
                id="export-password"
                type={showExportPassword ? "text" : "password"}
                placeholder="设置密码保护导出文件"
                value={exportOptions.encryptionPassword}
                onChange={(e) => setExportOptions({ ...exportOptions, encryptionPassword: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowExportPassword(!showExportPassword)}
              >
                {showExportPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              设置密码后，敏感数据将使用 AES-256 加密。导入时需要输入相同密码。
            </p>
          </div>
        )}

        {/* 导出按钮 */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            导出数据
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
