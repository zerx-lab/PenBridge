import { useNavigate } from "@tanstack/react-router";
import { FileEdit, ExternalLink } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { formatRelativeTime } from "./utils";

interface RecentArticleItemProps {
  article: {
    id: number;
    title: string;
    status: string;
    updatedAt: string;
    tencentArticleUrl?: string;
  };
}

// 最近文章列表项
export function RecentArticleItem({ article }: RecentArticleItemProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({
      to: "/articles/$id/edit",
      params: { id: String(article.id) },
    });
  };

  const handleExternalLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (article.tencentArticleUrl) {
      // 优先使用 Electron API 在系统默认浏览器中打开
      if (window.electronAPI?.shell?.openExternal) {
        window.electronAPI.shell.openExternal(article.tencentArticleUrl);
      } else {
        // 回退到 window.open（Web 环境）
        window.open(article.tencentArticleUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  return (
    <div
      onClick={handleClick}
      className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileEdit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate group-hover:text-primary transition-colors">
            {article.title || "无标题"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {formatRelativeTime(article.updatedAt)}
        </span>
        <StatusBadge status={article.status} />
        {article.tencentArticleUrl && (
          <button
            onClick={handleExternalLinkClick}
            className="text-muted-foreground hover:text-primary"
            title="在腾讯云查看"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
