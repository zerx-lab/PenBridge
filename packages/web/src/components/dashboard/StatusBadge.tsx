import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

// 状态徽章组件
export function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    draft: { label: "草稿", variant: "secondary" },
    scheduled: { label: "待发布", variant: "outline" },
    published: { label: "已发布", variant: "default" },
    pending: { label: "审核中", variant: "outline" },
    failed: { label: "失败", variant: "destructive" },
  };

  const { label, variant } = config[status] || { label: status, variant: "secondary" };

  return <Badge variant={variant} className="text-xs h-5">{label}</Badge>;
}
