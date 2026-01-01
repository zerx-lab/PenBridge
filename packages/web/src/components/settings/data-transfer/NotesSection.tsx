import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// 注意事项组件
export function NotesSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">注意事项</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>• 导出的文件包含应用的配置和数据，请妥善保管</p>
        <p>• 包含敏感数据的备份文件建议设置加密密码保护</p>
        <p>• 导入时会根据唯一标识匹配已存在的数据，可选择跳过或覆盖</p>
        <p>• AI Chat 历史记录不会被导出，仅导出配置信息</p>
        <p>• 建议在导入前先导出当前数据作为备份</p>
      </CardContent>
    </Card>
  );
}
