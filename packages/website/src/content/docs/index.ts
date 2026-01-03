// 文档索引 - 定义文档结构和元数据
import { Download, FileText, Upload, Clock, Sparkles, Settings, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DocMeta {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  order: number;
}

// 文档元数据配置
export const docsMeta: DocMeta[] = [
  {
    id: "getting-started",
    title: "快速开始",
    description: "桌面应用、Docker、源码三种部署方式",
    icon: Download,
    order: 1,
  },
  {
    id: "editor",
    title: "文章编辑",
    description: "Milkdown 编辑器、斜杠命令、Word 导入",
    icon: FileText,
    order: 2,
  },
  {
    id: "publishing",
    title: "发布文章",
    description: "腾讯云、掘金多平台一键发布",
    icon: Upload,
    order: 3,
  },
  {
    id: "scheduling",
    title: "定时发布",
    description: "自动调度、失败重试、邮件通知",
    icon: Clock,
    order: 4,
  },
  {
    id: "ai-assistant",
    title: "AI 助手",
    description: "多模型支持、工具调用、差异预览",
    icon: Sparkles,
    order: 5,
  },
  {
    id: "settings",
    title: "设置",
    description: "AI 配置、邮件通知、数据管理",
    icon: Settings,
    order: 6,
  },
  {
    id: "development",
    title: "开发指南",
    description: "项目架构、API 文档、贡献指南",
    icon: Terminal,
    order: 7,
  },
];

// 按 order 排序
export const sortedDocsMeta = [...docsMeta].sort((a, b) => a.order - b.order);

// 获取文档元数据
export function getDocMeta(id: string): DocMeta | undefined {
  return docsMeta.find((doc) => doc.id === id);
}

// 获取上一篇/下一篇文档
export function getAdjacentDocs(id: string): { prev?: DocMeta; next?: DocMeta } {
  const index = sortedDocsMeta.findIndex((doc) => doc.id === id);
  if (index === -1) return {};
  
  return {
    prev: index > 0 ? sortedDocsMeta[index - 1] : undefined,
    next: index < sortedDocsMeta.length - 1 ? sortedDocsMeta[index + 1] : undefined,
  };
}
