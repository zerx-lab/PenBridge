import { useState, useEffect, useRef } from "react";
import { message, Select, DatePicker, TimePicker } from "antd";
import { Loader2, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/utils/trpc";
import JuejinTagSelect from "./JuejinTagSelect";
import dayjs from "dayjs";

// 掘金固定分类列表
const JUEJIN_CATEGORIES = [
  { category_id: "6809637767543259144", category_name: "前端" },
  { category_id: "6809637769959178254", category_name: "后端" },
  { category_id: "6809635626879549454", category_name: "Android" },
  { category_id: "6809635626661445640", category_name: "iOS" },
  { category_id: "6809637773935378440", category_name: "人工智能" },
  { category_id: "6809637771511070734", category_name: "开发工具" },
  { category_id: "6809637776263217160", category_name: "代码人生" },
  { category_id: "6809637772874219534", category_name: "阅读" },
];

interface TagLabelValue {
  value: string;
  label: string;
}

interface JuejinSchedulePublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleId: number;
  // 初始值
  juejinCategoryId?: string;
  juejinTagIds?: string[];
  juejinTagNames?: string[];
  juejinBriefContent?: string;
  juejinIsOriginal?: number;
  // 已有的定时任务信息
  existingTask?: {
    id: number;
    scheduledAt: string;
    config: {
      categoryId: string;
      categoryName?: string;
      tagIds: string[];
      tagNames?: string[];
      briefContent: string;
      isOriginal: 0 | 1;
    };
  } | null;
  onSuccess?: () => void;
}

/**
 * 掘金定时发布配置弹窗
 */
export function JuejinSchedulePublishDialog({
  open,
  onOpenChange,
  articleId,
  juejinCategoryId: initialCategoryId = "",
  juejinTagIds: initialTagIds = [],
  juejinTagNames: initialTagNames = [],
  juejinBriefContent: initialBriefContent = "",
  juejinIsOriginal: initialIsOriginal = 1,
  existingTask,
  onSuccess,
}: JuejinSchedulePublishDialogProps) {
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId);
  const [tags, setTags] = useState<TagLabelValue[]>([]);
  const [briefContent, setBriefContent] = useState(initialBriefContent);
  const [isOriginal, setIsOriginal] = useState<number>(initialIsOriginal);
  const [scheduledDate, setScheduledDate] = useState<dayjs.Dayjs | null>(null);
  const [scheduledTime, setScheduledTime] = useState<dayjs.Dayjs | null>(null);

  const trpcUtils = trpc.useContext();

  // 同步初始值
  useEffect(() => {
    if (open) {
      if (existingTask) {
        // 编辑模式：使用已有任务的配置
        setCategoryId(existingTask.config.categoryId);
        const initialTags: TagLabelValue[] = existingTask.config.tagIds.map((id, index) => ({
          value: id,
          label: existingTask.config.tagNames?.[index] || id,
        }));
        setTags(initialTags);
        setBriefContent(existingTask.config.briefContent);
        setIsOriginal(existingTask.config.isOriginal);
        const taskTime = dayjs(existingTask.scheduledAt);
        setScheduledDate(taskTime);
        setScheduledTime(taskTime);
      } else {
        // 新建模式：使用文章的配置
        setCategoryId(initialCategoryId);
        const initialTags: TagLabelValue[] = initialTagIds.map((id, index) => ({
          value: id,
          label: initialTagNames[index] || id,
        }));
        setTags(initialTags);
        setBriefContent(initialBriefContent);
        setIsOriginal(initialIsOriginal);
        // 默认设置为1小时后
        const defaultTime = dayjs().add(1, "hour");
        setScheduledDate(defaultTime);
        setScheduledTime(defaultTime);
      }
    }
  }, [open, existingTask, initialCategoryId, initialTagIds, initialTagNames, initialBriefContent, initialIsOriginal]);

  // 创建定时任务
  const createTaskMutation = trpc.schedule.create.useMutation({
    onSuccess: () => {
      message.success("定时发布任务创建成功");
      onOpenChange(false);
      trpcUtils.article.list.invalidate();
      trpcUtils.article.get.invalidate({ id: articleId });
      trpcUtils.schedule.listPending.invalidate();
      onSuccess?.();
    },
    onError: (error: Error) => {
      message.error(`创建失败: ${error.message}`);
    },
  });

  // 更新定时任务
  const updateTaskMutation = trpc.schedule.update.useMutation({
    onSuccess: () => {
      message.success("定时发布任务已更新");
      onOpenChange(false);
      trpcUtils.article.list.invalidate();
      trpcUtils.article.get.invalidate({ id: articleId });
      trpcUtils.schedule.listPending.invalidate();
      onSuccess?.();
    },
    onError: (error: Error) => {
      message.error(`更新失败: ${error.message}`);
    },
  });

  // 取消定时任务
  const cancelTaskMutation = trpc.schedule.cancel.useMutation({
    onSuccess: () => {
      message.success("定时发布任务已取消");
      onOpenChange(false);
      trpcUtils.article.list.invalidate();
      trpcUtils.article.get.invalidate({ id: articleId });
      trpcUtils.schedule.listPending.invalidate();
      onSuccess?.();
    },
    onError: (error: Error) => {
      message.error(`取消失败: ${error.message}`);
    },
  });

  const handleTagChange = (newTags: TagLabelValue[]) => {
    setTags(newTags);
  };

  const handleSubmit = async () => {
    // 验证分类
    if (!categoryId) {
      message.error("请选择文章分类");
      return;
    }

    // 验证标签
    if (tags.length === 0) {
      message.error("请至少选择一个标签");
      return;
    }

    if (tags.length > 3) {
      message.error("最多选择3个标签");
      return;
    }

    // 验证摘要
    if (!briefContent.trim()) {
      message.error("请填写文章摘要");
      return;
    }

    if (briefContent.length < 50) {
      message.error("摘要至少需要50个字符");
      return;
    }

    if (briefContent.length > 100) {
      message.error("摘要不能超过100个字符");
      return;
    }

    // 验证时间
    if (!scheduledDate || !scheduledTime) {
      message.error("请选择发布时间");
      return;
    }

    // 合并日期和时间
    const scheduledAt = scheduledDate
      .hour(scheduledTime.hour())
      .minute(scheduledTime.minute())
      .second(0);

    if (scheduledAt.isBefore(dayjs())) {
      message.error("发布时间必须在当前时间之后");
      return;
    }

    // 获取分类名称
    const category = JUEJIN_CATEGORIES.find(c => c.category_id === categoryId);

    const juejinConfig = {
      categoryId,
      categoryName: category?.category_name,
      tagIds: tags.map(t => t.value),
      tagNames: tags.map(t => t.label),
      briefContent,
      isOriginal: isOriginal as 0 | 1,
    };

    if (existingTask) {
      // 更新模式
      updateTaskMutation.mutate({
        taskId: existingTask.id,
        platform: "juejin" as any,
        scheduledAt: scheduledAt.toISOString(),
        juejinConfig,
      });
    } else {
      // 创建模式
      createTaskMutation.mutate({
        articleId,
        platform: "juejin" as any,
        scheduledAt: scheduledAt.toISOString(),
        juejinConfig,
      });
    }
  };

  const handleCancel = () => {
    if (existingTask) {
      cancelTaskMutation.mutate({ taskId: existingTask.id });
    }
  };

  const isLoading =
    createTaskMutation.isLoading ||
    updateTaskMutation.isLoading ||
    cancelTaskMutation.isLoading;

  // 用于 antd 组件的容器引用
  const containerRef = useRef<HTMLDivElement>(null);

  // 禁用过去的日期
  const disabledDate = (current: dayjs.Dayjs) => {
    return current && current < dayjs().startOf("day");
  };

  // 摘要字数统计
  const briefContentLength = briefContent.length;
  const isUnderLimit = briefContentLength > 0 && briefContentLength < 50;
  const isOverLimit = briefContentLength > 100;
  const isInvalidLength = isUnderLimit || isOverLimit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" ref={containerRef}>
        <DialogHeader>
          <DialogTitle>
            {existingTask ? "编辑定时发布" : "定时发布到掘金"}
          </DialogTitle>
          <DialogDescription>
            设置发布时间和配置，系统将在指定时间自动发布文章到掘金
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 发布时间 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              发布时间 <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <DatePicker
                value={scheduledDate}
                onChange={setScheduledDate}
                disabledDate={disabledDate}
                placeholder="选择日期"
                className="flex-1"
                getPopupContainer={() => containerRef.current || document.body}
              />
              <TimePicker
                value={scheduledTime}
                onChange={setScheduledTime}
                format="HH:mm"
                placeholder="选择时间"
                className="flex-1"
                getPopupContainer={() => containerRef.current || document.body}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              系统将在设定时间自动发布文章
            </p>
          </div>

          {/* 分类选择 */}
          <div className="space-y-2">
            <Label>
              文章分类 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={categoryId || undefined}
              onChange={setCategoryId}
              placeholder="请选择文章分类"
              options={JUEJIN_CATEGORIES.map(c => ({
                value: c.category_id,
                label: c.category_name,
              }))}
              className="w-full"
              getPopupContainer={() => containerRef.current || document.body}
            />
          </div>

          {/* 标签选择 */}
          <div className="space-y-2">
            <Label>
              文章标签 <span className="text-destructive">*</span>
            </Label>
            <JuejinTagSelect
              value={tags}
              onChange={handleTagChange}
              maxCount={3}
              getPopupContainer={() => containerRef.current || document.body}
            />
            <p className="text-xs text-muted-foreground">
              至少选择1个标签，最多3个
            </p>
          </div>

          {/* 是否原创 */}
          <div className="space-y-2">
            <Label>文章类型</Label>
            <Select
              value={isOriginal}
              onChange={setIsOriginal}
              options={[
                { value: 1, label: "原创" },
                { value: 0, label: "转载" },
              ]}
              className="w-full"
              getPopupContainer={() => containerRef.current || document.body}
            />
          </div>

          {/* 摘要 */}
          <div className="space-y-2">
            <Label>
              文章摘要 <span className="text-destructive">*</span>
            </Label>
            <textarea
              placeholder="请输入文章摘要（必填，50-100字）"
              rows={3}
              value={briefContent}
              onChange={(e) => setBriefContent(e.target.value)}
              className={`flex w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none ${
                isInvalidLength ? "border-destructive" : "border-input"
              }`}
            />
            <p className={`text-xs ${isInvalidLength ? "text-destructive" : "text-muted-foreground"}`}>
              {briefContentLength}/100 字符（至少50字）
              {isUnderLimit && " - 摘要过短"}
              {isOverLimit && " - 摘要过长"}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {existingTask && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isLoading}
              className="sm:mr-auto"
            >
              {cancelTaskMutation.isLoading && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              取消定时
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            关闭
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {(createTaskMutation.isLoading || updateTaskMutation.isLoading) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            <Clock className="h-4 w-4 mr-2" />
            {existingTask ? "更新定时" : "确认定时"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default JuejinSchedulePublishDialog;
