import { useState } from "react";
import { message } from "antd";
import {
  CloudUpload,
  Cloud,
  ChevronDown,
  ExternalLink,
  Clock,
  Calendar,
  Edit,
  Flame,
  Code2,
} from "lucide-react";
import { trpc } from "@/utils/trpc";
import TencentPublishDialog from "./TencentPublishDialog";
import SchedulePublishDialog from "./SchedulePublishDialog";
import JuejinPublishDialog from "./JuejinPublishDialog";
import JuejinSchedulePublishDialog from "./JuejinSchedulePublishDialog";
import CsdnPublishDialog from "./CsdnPublishDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PublishMenuProps {
  articleId: number;
  articleStatus: string;
  articleTitle?: string;  // 文章标题（用于 CSDN 推荐标签）
  articleContent?: string;  // 文章内容（用于 CSDN 推荐标签）
  tencentArticleUrl?: string;
  tencentTagIds?: number[];
  sourceType?: number;
  summary?: string;
  scheduledAt?: string;  // 定时发布时间
  // 掘金相关
  juejinArticleUrl?: string;
  juejinCategoryId?: string;
  juejinTagIds?: string[];
  juejinTagNames?: string[];
  juejinBriefContent?: string;
  juejinIsOriginal?: number;
  juejinStatus?: string;
  juejinScheduledAt?: string;  // 掘金定时发布时间
  // CSDN 相关
  csdnArticleUrl?: string;
  csdnTags?: string[];
  csdnDescription?: string;
  csdnType?: string;
  csdnReadType?: string;
  csdnStatus?: string;
  onSuccess?: () => void;
  /** 显示模式：button 显示完整按钮，icon 只显示图标 */
  variant?: "button" | "icon";
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 发布菜单组件
 * 支持多平台发布，当前已实现腾讯云开发者社区
 */
export function PublishMenu({
  articleId,
  articleStatus,
  articleTitle = "",
  articleContent = "",
  tencentArticleUrl,
  tencentTagIds = [],
  sourceType = 1,
  summary = "",
  scheduledAt,
  // 掘金相关
  juejinArticleUrl,
  juejinCategoryId = "",
  juejinTagIds = [],
  juejinTagNames = [],
  juejinBriefContent = "",
  juejinIsOriginal = 1,
  juejinStatus,
  juejinScheduledAt,
  // CSDN 相关
  csdnArticleUrl,
  csdnTags = [],
  csdnDescription = "",
  csdnType = "original",
  csdnReadType = "public",
  csdnStatus,
  onSuccess,
  variant = "button",
  disabled = false,
}: PublishMenuProps) {
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [juejinPublishDialogOpen, setJuejinPublishDialogOpen] = useState(false);
  const [juejinScheduleDialogOpen, setJuejinScheduleDialogOpen] = useState(false);
  const [csdnPublishDialogOpen, setCsdnPublishDialogOpen] = useState(false);

  // 获取文章的腾讯云定时任务
  const { data: existingTask } = trpc.schedule.getByArticle.useQuery(
    { articleId, platform: "tencent" as any },
    { enabled: articleStatus === "scheduled" }
  );

  // 获取文章的掘金定时任务
  const { data: existingJuejinTask } = trpc.schedule.getByArticle.useQuery(
    { articleId, platform: "juejin" as any },
    { enabled: juejinStatus === "scheduled" }
  );

  const trpcUtils = trpc.useContext();

  // 同步草稿
  const saveDraftMutation = trpc.sync.syncToDraft.useMutation({
    onSuccess: (result: any) => {
      message.destroy("sync-draft");
      if (result.success) {
        message.success(result.message || "草稿已同步到云端");
        trpcUtils.article.list.invalidate();
        trpcUtils.article.get.invalidate({ id: articleId });
        onSuccess?.();
      } else {
        message.error(result.message || "同步失败");
      }
    },
    onError: (error: Error) => {
      message.destroy("sync-draft");
      message.error(`同步失败: ${error.message}`);
    },
  });

  const handleSyncDraft = () => {
    message.loading({ content: "正在同步草稿...", key: "sync-draft", duration: 0 });
    saveDraftMutation.mutate({ id: articleId });
  };

  const handleViewArticle = () => {
    if (tencentArticleUrl) {
      // 优先使用 Electron API 在系统默认浏览器中打开
      if (window.electronAPI?.shell?.openExternal) {
        window.electronAPI.shell.openExternal(tencentArticleUrl);
      } else {
        // 回退到 window.open（Web 环境）
        window.open(tencentArticleUrl, "_blank");
      }
    }
  };

  const handleViewJuejinArticle = () => {
    if (juejinArticleUrl) {
      if (window.electronAPI?.shell?.openExternal) {
        window.electronAPI.shell.openExternal(juejinArticleUrl);
      } else {
        window.open(juejinArticleUrl, "_blank");
      }
    }
  };

  const handleViewCsdnArticle = () => {
    if (csdnArticleUrl) {
      if (window.electronAPI?.shell?.openExternal) {
        window.electronAPI.shell.openExternal(csdnArticleUrl);
      } else {
        window.open(csdnArticleUrl, "_blank");
      }
    }
  };

  // 判断文章状态
  const isPublished = articleStatus === "published";
  const isPending = articleStatus === "pending";
  const isScheduled = articleStatus === "scheduled";
  const canPublish =
    articleStatus === "draft" ||
    articleStatus === "failed";

  // 掘金状态判断
  const canPublishJuejin = !juejinStatus || juejinStatus === "draft" || juejinStatus === "failed";

  // CSDN 状态判断
  const canPublishCsdn = !csdnStatus || csdnStatus === "draft" || csdnStatus === "failed";

  // 格式化定时发布时间
  const formatScheduledTime = (time: string) => {
    const date = new Date(time);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  // 渲染触发器按钮
  const TriggerButton = (
    <Button
      variant={variant === "icon" ? "ghost" : "default"}
      size={variant === "icon" ? "icon-sm" : "default"}
      disabled={disabled}
    >
      <CloudUpload className="size-4" />
      {variant !== "icon" && (
        <>
          发布
          <ChevronDown className="size-3" />
        </>
      )}
    </Button>
  );

  return (
    <>
      {/* modal={false} 是关键优化：防止 DropdownMenu 阻塞主线程，允许与 Dialog 更好地交互 */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          {variant === "icon" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {TriggerButton}
              </TooltipTrigger>
              <TooltipContent>发布文章</TooltipContent>
            </Tooltip>
          ) : (
            TriggerButton
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* 腾讯云开发者社区子菜单 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Cloud className="size-4" />
              腾讯云开发者社区
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {canPublish && (
                <>
                  <DropdownMenuItem onClick={() => setPublishDialogOpen(true)}>
                    <CloudUpload className="size-4" />
                    立即发布
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setScheduleDialogOpen(true)}>
                    <Calendar className="size-4" />
                    定时发布
                  </DropdownMenuItem>
                </>
              )}

              {isScheduled && (
                <DropdownMenuItem onClick={() => setScheduleDialogOpen(true)}>
                  <Edit className="size-4" />
                  编辑定时 {scheduledAt ? `(${formatScheduledTime(scheduledAt)})` : ""}
                </DropdownMenuItem>
              )}

              {(canPublish || isScheduled) && (
                <DropdownMenuItem
                  onClick={handleSyncDraft}
                  disabled={saveDraftMutation.isLoading}
                >
                  <Cloud className="size-4" />
                  同步草稿
                </DropdownMenuItem>
              )}

              {isPending && (
                <DropdownMenuItem disabled>
                  <Clock className="size-4" />
                  审核中...
                </DropdownMenuItem>
              )}

              {(isPublished || isPending) && tencentArticleUrl && (
                <DropdownMenuItem onClick={handleViewArticle}>
                  <ExternalLink className="size-4" />
                  查看文章
                </DropdownMenuItem>
              )}

              {isPublished && !tencentArticleUrl && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">已发布</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* 掘金子菜单 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flame className="size-4" />
              掘金
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {canPublishJuejin && (
                <>
                  <DropdownMenuItem onClick={() => setJuejinPublishDialogOpen(true)}>
                    <CloudUpload className="size-4" />
                    立即发布
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setJuejinScheduleDialogOpen(true)}>
                    <Calendar className="size-4" />
                    定时发布
                  </DropdownMenuItem>
                </>
              )}

              {juejinStatus === "scheduled" && (
                <DropdownMenuItem onClick={() => setJuejinScheduleDialogOpen(true)}>
                  <Edit className="size-4" />
                  编辑定时 {juejinScheduledAt ? `(${formatScheduledTime(juejinScheduledAt)})` : ""}
                </DropdownMenuItem>
              )}

              {juejinStatus === "pending" && (
                <DropdownMenuItem disabled>
                  <Clock className="size-4" />
                  审核中...
                </DropdownMenuItem>
              )}

              {juejinStatus === "published" && juejinArticleUrl && (
                <DropdownMenuItem onClick={handleViewJuejinArticle}>
                  <ExternalLink className="size-4" />
                  查看文章
                </DropdownMenuItem>
              )}

              {juejinStatus === "published" && !juejinArticleUrl && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">已发布</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* CSDN 子菜单 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Code2 className="size-4" />
              CSDN
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {canPublishCsdn && (
                <DropdownMenuItem onClick={() => setCsdnPublishDialogOpen(true)}>
                  <CloudUpload className="size-4" />
                  立即发布
                </DropdownMenuItem>
              )}

              {csdnStatus === "pending" && (
                <DropdownMenuItem disabled>
                  <Clock className="size-4" />
                  审核中...
                </DropdownMenuItem>
              )}

              {csdnStatus === "published" && csdnArticleUrl && (
                <DropdownMenuItem onClick={handleViewCsdnArticle}>
                  <ExternalLink className="size-4" />
                  查看文章
                </DropdownMenuItem>
              )}

              {csdnStatus === "published" && !csdnArticleUrl && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">已发布</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 腾讯云开发者社区发布配置弹窗 - 条件渲染，只在打开时才加载 */}
      {publishDialogOpen && (
        <TencentPublishDialog
          open={publishDialogOpen}
          onOpenChange={setPublishDialogOpen}
          articleId={articleId}
          tencentTagIds={tencentTagIds}
          sourceType={sourceType}
          summary={summary}
          onSuccess={onSuccess}
        />
      )}

      {/* 定时发布配置弹窗 - 条件渲染 */}
      {scheduleDialogOpen && (
        <SchedulePublishDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          articleId={articleId}
          tencentTagIds={tencentTagIds}
          sourceType={sourceType}
          summary={summary}
          existingTask={existingTask ? {
            id: existingTask.id,
            scheduledAt: existingTask.scheduledAt as unknown as string,
            config: existingTask.config as any,
          } : null}
          onSuccess={onSuccess}
        />
      )}

      {/* 掘金发布配置弹窗 - 条件渲染 */}
      {juejinPublishDialogOpen && (
        <JuejinPublishDialog
          open={juejinPublishDialogOpen}
          onOpenChange={setJuejinPublishDialogOpen}
          articleId={articleId}
          juejinCategoryId={juejinCategoryId}
          juejinTagIds={juejinTagIds}
          juejinTagNames={juejinTagNames}
          juejinBriefContent={juejinBriefContent}
          juejinIsOriginal={juejinIsOriginal}
          onSuccess={onSuccess}
        />
      )}

      {/* 掘金定时发布配置弹窗 - 条件渲染 */}
      {juejinScheduleDialogOpen && (
        <JuejinSchedulePublishDialog
          open={juejinScheduleDialogOpen}
          onOpenChange={setJuejinScheduleDialogOpen}
          articleId={articleId}
          juejinCategoryId={juejinCategoryId}
          juejinTagIds={juejinTagIds}
          juejinTagNames={juejinTagNames}
          juejinBriefContent={juejinBriefContent}
          juejinIsOriginal={juejinIsOriginal}
          existingTask={existingJuejinTask ? {
            id: existingJuejinTask.id,
            scheduledAt: existingJuejinTask.scheduledAt as unknown as string,
            config: existingJuejinTask.config as any,
          } : null}
          onSuccess={onSuccess}
        />
      )}

      {/* CSDN 发布配置弹窗 - 条件渲染 */}
      {csdnPublishDialogOpen && (
        <CsdnPublishDialog
          open={csdnPublishDialogOpen}
          onOpenChange={setCsdnPublishDialogOpen}
          articleId={articleId}
          articleTitle={articleTitle}
          articleContent={articleContent}
          csdnTags={csdnTags}
          csdnDescription={csdnDescription}
          csdnType={csdnType}
          csdnReadType={csdnReadType}
          onSuccess={onSuccess}
        />
      )}
    </>
  );
}

export default PublishMenu;
