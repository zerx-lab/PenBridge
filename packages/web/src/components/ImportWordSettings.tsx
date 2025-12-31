import { useRef, useState } from "react";
import { message } from "antd";
import { Upload, Loader2 } from "lucide-react";
import { convertWordToMarkdown } from "@/utils/wordToMarkdown";

interface ImportWordSettingsProps {
  onImport: (title: string, content: string) => void | Promise<void>;
  onClose?: () => void;
}

/**
 * 导入 Word 文档的设置面板组件
 * Notion 风格设计，用于在编辑器设置中显示导入功能
 */
export function ImportWordSettings({ onImport, onClose }: ImportWordSettingsProps) {
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await convertWordToMarkdown(file);
      // 等待 onImport 完成（支持异步保存）
      await onImport(result.title, result.markdown);
      message.success(`已导入并保存: ${result.fileName}`);
      // 导入成功后关闭设置面板
      onClose?.();
    } catch (error) {
      console.error("导入 Word 失败:", error);
      message.error(
        error instanceof Error ? error.message : "导入失败，请重试"
      );
    } finally {
      setIsImporting(false);
      // 重置 input 以允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 触发文件选择
  const handleImportClick = () => {
    if (!isImporting) {
      fileInputRef.current?.click();
    }
  };

  return (
    <>
      {/* 导入 Word 文档 - Notion 风格设置项 */}
      <button
        className="w-full text-left"
        onClick={handleImportClick}
        disabled={isImporting}
      >
        <div className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-accent/50 transition-colors group -mx-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </span>
            <span className="text-sm">
              {isImporting ? "导入中..." : "导入 Word"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">.docx</span>
        </div>
      </button>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  );
}

export default ImportWordSettings;
