import { ExportSection } from "./data-transfer/ExportSection";
import { ImportSection } from "./data-transfer/ImportSection";
import { NotesSection } from "./data-transfer/NotesSection";

// 数据导入导出组件
export function DataTransferSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">数据管理</h2>
        <p className="text-sm text-muted-foreground">
          导出和导入应用数据，用于备份或迁移到其他设备
        </p>
      </div>

      {/* 数据导出 */}
      <ExportSection />

      {/* 数据导入 */}
      <ImportSection />

      {/* 注意事项 */}
      <NotesSection />
    </div>
  );
}
