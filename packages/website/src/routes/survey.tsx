import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Vote,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  CheckCircle2,
  Circle,
  Sparkles,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// 功能调研数据（静态模拟，后续可接入后端）
const surveyData = {
  features: [
    {
      id: "csdn",
      title: "CSDN 平台支持",
      description: "支持一键发布文章到 CSDN 博客平台",
      votes: 156,
      status: "voting",
      category: "平台支持",
    },
    {
      id: "segmentfault",
      title: "思否平台支持",
      description: "支持一键发布文章到思否社区",
      votes: 89,
      status: "voting",
      category: "平台支持",
    },
    {
      id: "zhihu",
      title: "知乎专栏支持",
      description: "支持发布文章到知乎专栏",
      votes: 234,
      status: "voting",
      category: "平台支持",
    },
    {
      id: "cnblogs",
      title: "博客园支持",
      description: "支持发布文章到博客园",
      votes: 67,
      status: "voting",
      category: "平台支持",
    },
    {
      id: "wechat",
      title: "微信公众号支持",
      description: "支持发布文章到微信公众号",
      votes: 312,
      status: "planned",
      category: "平台支持",
    },
    {
      id: "image-hosting",
      title: "更多图床支持",
      description: "支持七牛云、阿里云 OSS、GitHub 等更多图床",
      votes: 145,
      status: "voting",
      category: "功能增强",
    },
    {
      id: "templates",
      title: "文章模板",
      description: "预设多种文章模板，快速开始写作",
      votes: 78,
      status: "voting",
      category: "功能增强",
    },
    {
      id: "statistics",
      title: "数据统计",
      description: "统计各平台文章阅读量、点赞数等数据",
      votes: 198,
      status: "voting",
      category: "功能增强",
    },
    {
      id: "sync",
      title: "云同步",
      description: "支持多设备数据同步（可选功能）",
      votes: 167,
      status: "voting",
      category: "功能增强",
    },
    {
      id: "export",
      title: "批量导出",
      description: "支持批量导出文章为 PDF、Word 等格式",
      votes: 112,
      status: "voting",
      category: "功能增强",
    },
    {
      id: "tencent-cloud",
      title: "腾讯云开发者社区",
      description: "已支持发布到腾讯云开发者社区",
      votes: 0,
      status: "completed",
      category: "平台支持",
    },
    {
      id: "juejin",
      title: "掘金平台",
      description: "已支持发布到掘金技术社区",
      votes: 0,
      status: "completed",
      category: "平台支持",
    },
  ],
  totalVotes: 1558,
  totalParticipants: 423,
};

const statusConfig = {
  voting: {
    label: "投票中",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: Vote,
  },
  planned: {
    label: "已规划",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: TrendingUp,
  },
  completed: {
    label: "已完成",
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
    icon: CheckCircle2,
  },
};

function SurveyPage() {
  const [votedItems, setVotedItems] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "voting" | "planned" | "completed">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = [...new Set(surveyData.features.map((f) => f.category))];

  const filteredFeatures = surveyData.features
    .filter((f) => filter === "all" || f.status === filter)
    .filter((f) => categoryFilter === "all" || f.category === categoryFilter)
    .sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return b.votes - a.votes;
    });

  const handleVote = (id: string) => {
    if (votedItems.has(id)) {
      setVotedItems((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setVotedItems((prev) => new Set(prev).add(id));
    }
  };

  return (
    <div className="min-h-screen pt-16">
      {/* Hero */}
      <section className="py-16 gradient-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>你的声音很重要</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              功能调研
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              投票支持你最想要的功能，帮助我们确定开发优先级。
              你的每一票都将影响 PenBridge 的未来发展方向。
            </p>
          </motion.div>

          {/* 统计 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-12 flex items-center justify-center gap-8"
          >
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {surveyData.totalVotes + votedItems.size}
              </div>
              <div className="text-sm text-muted-foreground">总投票数</div>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {surveyData.features.length}
              </div>
              <div className="text-sm text-muted-foreground">功能建议</div>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {surveyData.totalParticipants}
              </div>
              <div className="text-sm text-muted-foreground">参与者</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 投票列表 */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 筛选器 */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">状态:</span>
              <div className="flex gap-1">
                {(["all", "voting", "planned", "completed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      filter === status
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {status === "all" ? "全部" : statusConfig[status].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">分类:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    categoryFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  全部
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      categoryFilter === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 功能列表 */}
          <div className="space-y-4">
            {filteredFeatures.map((feature, index) => {
              const status = statusConfig[feature.status as keyof typeof statusConfig];
              const isVoted = votedItems.has(feature.id);
              const voteCount = feature.votes + (isVoted ? 1 : 0);

              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "p-5 rounded-xl border border-border bg-card transition-all",
                    feature.status === "voting" && "hover:border-primary/50 hover:shadow-md"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* 投票按钮 */}
                    <button
                      onClick={() => feature.status === "voting" && handleVote(feature.id)}
                      disabled={feature.status !== "voting"}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-xl transition-all shrink-0",
                        feature.status === "voting"
                          ? isVoted
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary"
                          : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      <ThumbsUp className={cn("w-5 h-5", isVoted && "fill-current")} />
                      <span className="text-sm font-semibold">{voteCount}</span>
                    </button>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{feature.title}</h3>
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", status.color)}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{feature.description}</p>
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Circle className="w-3 h-3" />
                          {feature.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* 提交建议 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-12 p-8 rounded-2xl bg-muted/50 border border-border text-center"
          >
            <MessageSquare className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">有新的功能建议？</h3>
            <p className="text-muted-foreground mb-6">
              欢迎在 GitHub Issues 中提出你的想法，或参与社区讨论
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://github.com/yeyouchuan/pen-bridge/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                提交建议
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/yeyouchuan/pen-bridge/discussions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-background font-medium hover:bg-accent transition-colors"
              >
                <Users className="w-4 h-4" />
                社区讨论
              </a>
            </div>
          </motion.div>

          {/* 说明 */}
          <div className="mt-8 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700 dark:text-amber-300">
            <strong>说明：</strong>当前投票功能为前端演示，投票数据不会持久化保存。
            后续将接入独立后端以支持真实的投票和数据统计功能。
          </div>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/survey")({
  component: SurveyPage,
});
