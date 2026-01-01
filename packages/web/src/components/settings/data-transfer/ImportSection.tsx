import { useState } from "react";
import {
  FileUp,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Upload,
  XCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/utils/trpc";
import { message } from "antd";
import type { ImportOptions, PreviewData, ImportResult } from "./types";
import { defaultImportOptions } from "./types";

// 数据导入组件
export function ImportSection() {
  const utils = trpc.useContext();

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>(defaultImportOptions);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // 预览导入数据 mutation
  const previewMutation = trpc.dataTransfer.preview.useMutation({
    onSuccess: (data: any) => {
      setPreviewData({
        version: data.stats.version,
        exportedAt: data.stats.exportedAt,
        isEncrypted: data.stats.encrypted,
        counts: {
          users: data.stats.counts?.users || 0,
          adminUsers: data.stats.counts?.adminUsers || 0,
          folders: data.stats.counts?.folders || 0,
          articles: data.stats.counts?.articles || 0,
          aiProviders: data.stats.counts?.aiProviders || 0,
          aiModels: data.stats.counts?.aiModels || 0,
          emailConfig: (data.stats.counts?.emailConfigs || 0) > 0,
          scheduledTasks: data.stats.counts?.scheduledTasks || 0,
          images: data.stats.counts?.images || 0,
        },
      });
    },
    onError: (error: Error) => {
      message.error(`预览失败: ${error.message}`);
      setPreviewData(null);
    },
  });

  // 导入数据 mutation
  const importMutation = trpc.dataTransfer.import.useMutation({
    onSuccess: (data: any) => {
      setImportResult({
        success: data.success,
        imported: {
          users: data.stats?.users?.imported || 0,
          adminUsers: data.stats?.adminUsers?.imported || 0,
          folders: data.stats?.folders?.imported || 0,
          articles: data.stats?.articles?.imported || 0,
          aiProviders: data.stats?.aiProviders?.imported || 0,
          aiModels: data.stats?.aiModels?.imported || 0,
          emailConfig: (data.stats?.emailConfigs?.imported || 0) > 0,
          scheduledTasks: data.stats?.scheduledTasks?.imported || 0,
          images: data.stats?.images?.imported || 0,
        },
        skipped: {
          users: data.stats?.users?.skipped || 0,
          adminUsers: data.stats?.adminUsers?.skipped || 0,
          folders: data.stats?.folders?.skipped || 0,
          articles: data.stats?.articles?.skipped || 0,
          aiProviders: data.stats?.aiProviders?.skipped || 0,
          aiModels: data.stats?.aiModels?.skipped || 0,
          scheduledTasks: data.stats?.scheduledTasks?.skipped || 0,
          images: data.stats?.images?.skipped || 0,
        },
        errors: data.errors || [],
      });
      if (data.success) {
        message.success("数据导入成功");
        utils.invalidate();
      } else {
        message.warning("数据导入部分完成，请查看详情");
      }
    },
    onError: (error: Error) => {
      message.error(`导入失败: ${error.message}`);
    },
  });

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportResult(null);
    setIsPreviewing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      
      previewMutation.mutate({ zipData: base64Data }, {
        onSettled: () => setIsPreviewing(false),
      });
    } catch {
      message.error("无法读取文件");
      setIsPreviewing(false);
    }
  };

  // 处理导入
  const handleImport = async () => {
    if (!importFile) {
      message.error("请先选择要导入的文件");
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const arrayBuffer = await importFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      
      importMutation.mutate({
        zipData: base64Data,
        decryptionPassword: importOptions.decryptionPassword || undefined,
        overwriteExisting: importOptions.overwriteExisting,
      }, {
        onSettled: () => setIsImporting(false),
      });
    } catch {
      message.error("无法读取文件");
      setIsImporting(false);
    }
  };

  // 重置导入状态
  const handleResetImport = () => {
    setImportFile(null);
    setPreviewData(null);
    setImportResult(null);
    setImportOptions(defaultImportOptions);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileUp className="h-4 w-4" />
          数据导入
        </CardTitle>
        <CardDescription>
          从 ZIP 备份文件导入数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 文件选择 */}
        <div className="space-y-2">
          <Label htmlFor="import-file">选择备份文件 (.zip)</Label>
          <div className="flex gap-2">
            <Input
              id="import-file"
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="flex-1"
            />
            {importFile && (
              <Button variant="outline" size="icon" onClick={handleResetImport}>
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 预览加载状态 */}
        {isPreviewing && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">正在解析文件...</span>
          </div>
        )}

        {/* 预览信息 */}
        {previewData && (
          <div className="p-4 rounded-md border bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">备份文件信息</span>
              <Badge variant="outline">v{previewData.version}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              导出时间: {new Date(previewData.exportedAt).toLocaleString("zh-CN")}
            </div>
            {previewData.isEncrypted && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                <span className="text-xs">此备份包含加密的敏感数据</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {previewData.counts.users > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">平台账户:</span>
                  <span>{previewData.counts.users}</span>
                </div>
              )}
              {previewData.counts.adminUsers > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">管理员:</span>
                  <span>{previewData.counts.adminUsers}</span>
                </div>
              )}
              {previewData.counts.folders > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">文件夹:</span>
                  <span>{previewData.counts.folders}</span>
                </div>
              )}
              {previewData.counts.articles > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">文章:</span>
                  <span>{previewData.counts.articles}</span>
                </div>
              )}
              {previewData.counts.aiProviders > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI 供应商:</span>
                  <span>{previewData.counts.aiProviders}</span>
                </div>
              )}
              {previewData.counts.aiModels > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI 模型:</span>
                  <span>{previewData.counts.aiModels}</span>
                </div>
              )}
              {previewData.counts.emailConfig && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">邮件配置:</span>
                  <span>有</span>
                </div>
              )}
              {previewData.counts.scheduledTasks > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">定时任务:</span>
                  <span>{previewData.counts.scheduledTasks}</span>
                </div>
              )}
              {previewData.counts.images > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">文章图片:</span>
                  <span>{previewData.counts.images}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 导入选项 */}
        {previewData && (
          <div className="space-y-3">
            {/* 解密密码 */}
            {previewData.isEncrypted && (
              <div className="space-y-2">
                <Label htmlFor="import-password" className="flex items-center gap-2">
                  <Lock className="h-3 w-3" />
                  解密密码
                </Label>
                <div className="relative">
                  <Input
                    id="import-password"
                    type={showImportPassword ? "text" : "password"}
                    placeholder="输入备份文件的加密密码"
                    value={importOptions.decryptionPassword}
                    onChange={(e) => setImportOptions({ ...importOptions, decryptionPassword: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowImportPassword(!showImportPassword)}
                  >
                    {showImportPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {/* 覆盖选项 */}
            <div className="flex items-center justify-between p-3 rounded-md border">
              <div>
                <Label htmlFor="import-overwrite" className="text-sm font-medium cursor-pointer">
                  覆盖现有数据
                </Label>
                <p className="text-xs text-muted-foreground">
                  如果存在相同的数据（如同名文章），是否覆盖
                </p>
              </div>
              <Switch
                id="import-overwrite"
                checked={importOptions.overwriteExisting}
                onCheckedChange={(checked) => setImportOptions({ ...importOptions, overwriteExisting: checked })}
              />
            </div>
          </div>
        )}

        {/* 导入结果 */}
        {importResult && (
          <div className={cn(
            "p-4 rounded-md border space-y-3",
            importResult.success
              ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
              : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
          )}>
            <div className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              <span className="font-medium">
                {importResult.success ? "导入完成" : "导入部分完成"}
              </span>
            </div>

            {/* 导入统计 */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {importResult.imported.users > 0 && (
                <div className="flex justify-between">
                  <span>导入平台账户:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.users}</span>
                </div>
              )}
              {importResult.imported.adminUsers > 0 && (
                <div className="flex justify-between">
                  <span>导入管理员:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.adminUsers}</span>
                </div>
              )}
              {importResult.imported.folders > 0 && (
                <div className="flex justify-between">
                  <span>导入文件夹:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.folders}</span>
                </div>
              )}
              {importResult.imported.articles > 0 && (
                <div className="flex justify-between">
                  <span>导入文章:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.articles}</span>
                </div>
              )}
              {importResult.imported.aiProviders > 0 && (
                <div className="flex justify-between">
                  <span>导入 AI 供应商:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.aiProviders}</span>
                </div>
              )}
              {importResult.imported.aiModels > 0 && (
                <div className="flex justify-between">
                  <span>导入 AI 模型:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.aiModels}</span>
                </div>
              )}
              {importResult.imported.emailConfig && (
                <div className="flex justify-between">
                  <span>导入邮件配置:</span>
                  <span className="text-green-600 dark:text-green-400">是</span>
                </div>
              )}
              {importResult.imported.scheduledTasks > 0 && (
                <div className="flex justify-between">
                  <span>导入定时任务:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.scheduledTasks}</span>
                </div>
              )}
              {importResult.imported.images > 0 && (
                <div className="flex justify-between">
                  <span>导入文章图片:</span>
                  <span className="text-green-600 dark:text-green-400">{importResult.imported.images}</span>
                </div>
              )}
            </div>

            {/* 跳过统计 */}
            {(importResult.skipped.users > 0 ||
              importResult.skipped.adminUsers > 0 ||
              importResult.skipped.folders > 0 ||
              importResult.skipped.articles > 0 ||
              importResult.skipped.aiProviders > 0 ||
              importResult.skipped.aiModels > 0 ||
              importResult.skipped.scheduledTasks > 0 ||
              importResult.skipped.images > 0) && (
              <div className="pt-2 border-t border-amber-200 dark:border-amber-700">
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-1">跳过的数据（已存在）:</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  {importResult.skipped.users > 0 && <span>平台账户: {importResult.skipped.users}</span>}
                  {importResult.skipped.adminUsers > 0 && <span>管理员: {importResult.skipped.adminUsers}</span>}
                  {importResult.skipped.folders > 0 && <span>文件夹: {importResult.skipped.folders}</span>}
                  {importResult.skipped.articles > 0 && <span>文章: {importResult.skipped.articles}</span>}
                  {importResult.skipped.aiProviders > 0 && <span>AI 供应商: {importResult.skipped.aiProviders}</span>}
                  {importResult.skipped.aiModels > 0 && <span>AI 模型: {importResult.skipped.aiModels}</span>}
                  {importResult.skipped.scheduledTasks > 0 && <span>定时任务: {importResult.skipped.scheduledTasks}</span>}
                  {importResult.skipped.images > 0 && <span>图片: {importResult.skipped.images}</span>}
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {importResult.errors.length > 0 && (
              <div className="pt-2 border-t border-red-200 dark:border-red-700">
                <p className="text-sm text-red-600 dark:text-red-400 mb-1">错误信息:</p>
                <ul className="text-xs text-red-500 space-y-1">
                  {importResult.errors.slice(0, 5).map((error, idx) => (
                    <li key={idx}>• {error}</li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li>...还有 {importResult.errors.length - 5} 个错误</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 导入按钮 */}
        {previewData && !importResult && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleImport} disabled={isImporting || (previewData.isEncrypted && !importOptions.decryptionPassword)}>
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              开始导入
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
