import { useState, useEffect } from "react";
import { message } from "antd";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  LightDialog,
  LightDialogHeader,
  LightDialogTitle,
  LightDialogDescription,
  LightDialogFooter,
} from "@/components/ui/light-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { trpc } from "@/utils/trpc";
import CsdnTagSelect from "./CsdnTagSelect";

// CSDN 文章类型选项
const CSDN_TYPE_OPTIONS = [
  { value: "original", label: "原创" },
  { value: "repost", label: "转载" },
  { value: "translated", label: "翻译" },
];

// CSDN 可见范围选项
const CSDN_READ_TYPE_OPTIONS = [
  { value: "public", label: "全部可见" },
  { value: "private", label: "仅我可见" },
  { value: "fans", label: "粉丝可见" },
  { value: "vip", label: "VIP可见" },
];

interface CsdnPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleId: number;
  // 文章信息（用于获取推荐标签）
  articleTitle?: string;
  articleContent?: string;
  // 初始值
  csdnTags?: string[];
  csdnDescription?: string;
  csdnType?: string;
  csdnReadType?: string;
  onSuccess?: () => void;
}

/**
 * CSDN 发布配置弹窗
 * 使用轻量级 LightDialog 替代 Radix Dialog，提升性能
 */
export function CsdnPublishDialog({
  open,
  onOpenChange,
  articleId,
  articleTitle = "",
  articleContent = "",
  csdnTags: initialTags = [],
  csdnDescription: initialDescription = "",
  csdnType: initialType = "original",
  csdnReadType: initialReadType = "public",
  onSuccess,
}: CsdnPublishDialogProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [description, setDescription] = useState(initialDescription);
  const [type, setType] = useState<string>(initialType);
  const [readType, setReadType] = useState<string>(initialReadType);

  const trpcUtils = trpc.useContext();

  // 同步初始值
  useEffect(() => {
    if (open) {
      setTags(initialTags || []);
      setDescription(initialDescription);
      setType(initialType);
      setReadType(initialReadType);
    }
  }, [open, initialTags, initialDescription, initialType, initialReadType]);

  // 保存 CSDN 配置
  const saveConfigMutation = trpc.csdn.saveConfig.useMutation({
    onError: (error: Error) => {
      message.error(`配置保存失败: ${error.message}`);
    },
  });

  // 发布到 CSDN
  const publishMutation = trpc.csdn.publish.useMutation({
    onSuccess: (result: any) => {
      message.destroy("publish");
      if (result.success) {
        message.success(result.message || "发布成功");
        if (result.articleUrl) {
          message.info(`文章地址: ${result.articleUrl}`);
        }
        onOpenChange(false);
        trpcUtils.article.list.invalidate();
        trpcUtils.article.get.invalidate({ id: articleId });
        trpcUtils.article.getMeta.invalidate({ id: articleId });
        onSuccess?.();
      } else {
        message.error(result.message || "发布失败");
      }
    },
    onError: (error: Error) => {
      message.destroy("publish");
      message.error(`发布失败: ${error.message}`);
    },
  });

  const handlePublish = async () => {
    // 验证标签
    if (tags.length === 0) {
      message.error("请至少选择一个标签");
      return;
    }

    if (tags.length > 5) {
      message.error("最多可以选择5个标签");
      return;
    }

    // 验证摘要
    if (!description.trim()) {
      message.error("请填写文章摘要");
      return;
    }

    if (description.length > 256) {
      message.error("摘要不能超过256个字符");
      return;
    }

    message.loading({ content: "正在发布文章到 CSDN...", key: "publish", duration: 0 });

    try {
      // 先保存配置
      await saveConfigMutation.mutateAsync({
        id: articleId,
        tags,
        description,
        type: type as "original" | "repost" | "translated",
        readType: readType as "public" | "private" | "fans" | "vip",
      });

      // 发布
      publishMutation.mutate({ id: articleId });
    } catch {
      message.destroy("publish");
      // 错误已在各 mutation 的 onError 中处理
    }
  };

  const isLoading = saveConfigMutation.isLoading || publishMutation.isLoading;

  // 摘要字数统计
  const descriptionLength = description.length;
  const isOverLimit = descriptionLength > 256;

  return (
    <LightDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[520px]">
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <X className="size-4" />
        <span className="sr-only">关闭</span>
      </button>

      <LightDialogHeader>
        <LightDialogTitle>发布到 CSDN</LightDialogTitle>
        <LightDialogDescription>
          配置发布选项，文章将发布至 CSDN 平台
        </LightDialogDescription>
      </LightDialogHeader>

      <div className="space-y-4 py-4">
        {/* 标签选择 */}
        <div className="space-y-2">
          <Label>
            文章标签 <span className="text-destructive">*</span>
          </Label>
          <CsdnTagSelect
            value={tags}
            onChange={setTags}
            articleTitle={articleTitle}
            articleContent={articleContent}
            maxCount={5}
            disabled={isLoading}
          />
        </div>

        {/* 文章类型 */}
        <div className="space-y-2">
          <Label>文章类型</Label>
          <NativeSelect
            value={type}
            onChange={setType}
            options={CSDN_TYPE_OPTIONS}
          />
        </div>

        {/* 可见范围 */}
        <div className="space-y-2">
          <Label>可见范围</Label>
          <NativeSelect
            value={readType}
            onChange={setReadType}
            options={CSDN_READ_TYPE_OPTIONS}
          />
        </div>

        {/* 摘要 */}
        <div className="space-y-2">
          <Label>
            文章摘要 <span className="text-destructive">*</span>
          </Label>
          <textarea
            placeholder="请输入文章摘要（必填，最多256字）"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`flex w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none ${
              isOverLimit ? "border-destructive" : "border-input"
            }`}
          />
          <p className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
            {descriptionLength}/256 字符
            {isOverLimit && " - 摘要过长"}
          </p>
        </div>
      </div>

      <LightDialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
        >
          取消
        </Button>
        <Button onClick={handlePublish} disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          确认发布
        </Button>
      </LightDialogFooter>
    </LightDialog>
  );
}

export default CsdnPublishDialog;
