import { Link } from "@tanstack/react-router";
import { Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { formatScheduleTime } from "./utils";

interface ScheduledTaskItemProps {
  task: {
    id: number;
    scheduledAt: string;
    status: string;
    article?: { id: number; title: string };
  };
}

// 定时任务列表项
export function ScheduledTaskItem({ task }: ScheduledTaskItemProps) {
  const statusConfig: Record<
    string,
    { icon: React.ElementType; color: string; label: string }
  > = {
    pending: { icon: Clock, color: "text-blue-500", label: "等待" },
    running: { icon: Loader2, color: "text-orange-500", label: "执行中" },
    completed: { icon: CheckCircle, color: "text-green-500", label: "完成" },
    failed: { icon: XCircle, color: "text-red-500", label: "失败" },
    cancelled: { icon: XCircle, color: "text-muted-foreground", label: "取消" },
  };

  const { icon: StatusIcon, color } = statusConfig[task.status] || statusConfig.pending;

  return (
    <Link
      to="/articles/$id/edit"
      params={{ id: String(task.article?.id || 0) }}
      className="block"
    >
      <div className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer group">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
          <p className="text-sm truncate group-hover:text-primary transition-colors">
            {task.article?.title || "未知文章"}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatScheduleTime(task.scheduledAt)}
        </span>
      </div>
    </Link>
  );
}
