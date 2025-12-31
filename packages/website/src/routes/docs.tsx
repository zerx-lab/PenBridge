import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Book,
  Download,
  Settings,
  FileText,
  Upload,
  Clock,
  Sparkles,
  Terminal,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const docSections = [
  {
    id: "getting-started",
    title: "快速开始",
    icon: Download,
    content: `
## 安装 PenBridge

### 系统要求

- **Windows**: Windows 10 或更高版本
- **macOS**: macOS 10.15 或更高版本
- **Linux**: Ubuntu 18.04 或其他主流发行版

### 下载安装

1. 访问 [GitHub Releases](https://github.com/yeyouchuan/pen-bridge/releases) 页面
2. 下载对应系统的安装包：
   - Windows: \`.exe\` 安装程序
   - macOS: \`.dmg\` 镜像文件
   - Linux: \`.AppImage\` 或 \`.deb\` 包
3. 运行安装程序，按提示完成安装

### 首次运行

启动 PenBridge 后，你需要：

1. 设置管理员账户（用于本地数据管理）
2. 配置要发布的平台账号
    `,
  },
  {
    id: "editor",
    title: "文章编辑",
    icon: FileText,
    content: `
## Markdown 编辑器

PenBridge 内置了类 Obsidian 风格的 Markdown 编辑器，提供沉浸式写作体验。

### 基础功能

- **实时预览**: 所见即所得的编辑体验
- **语法高亮**: 支持代码块语法高亮
- **斜杠命令**: 输入 \`/\` 快速插入各种内容块
- **快捷键**: 常用格式化操作支持快捷键

### 常用快捷键

| 功能 | Windows/Linux | macOS |
|------|--------------|-------|
| 加粗 | Ctrl+B | Cmd+B |
| 斜体 | Ctrl+I | Cmd+I |
| 链接 | Ctrl+K | Cmd+K |
| 代码 | Ctrl+\` | Cmd+\` |
| 保存 | Ctrl+S | Cmd+S |

### 插入图片

- 支持拖拽图片到编辑器
- 支持从剪贴板粘贴图片
- 图片会自动上传到配置的图床（如腾讯云 COS）
    `,
  },
  {
    id: "publishing",
    title: "发布文章",
    icon: Upload,
    content: `
## 多平台发布

PenBridge 支持一键发布文章到多个技术平台。

### 支持的平台

- **腾讯云开发者社区** - 已支持
- **掘金** - 已支持
- 更多平台持续添加中...

### 发布流程

1. 在编辑器中完成文章撰写
2. 点击发布按钮，选择目标平台
3. 填写平台特定信息（如分类、标签）
4. 确认发布

### 首次登录平台

首次发布到某个平台时，需要完成一次手动登录：

1. 点击发布按钮后，会弹出登录窗口
2. 在登录窗口中完成平台账号登录
3. 登录成功后，状态会自动保存
4. 后续发布无需重复登录

### 同步状态

- 文章发布后会自动记录发布状态
- 可以查看文章在各平台的发布情况
- 支持更新已发布的文章
    `,
  },
  {
    id: "scheduling",
    title: "定时发布",
    icon: Clock,
    content: `
## 定时发布功能

PenBridge 支持设定文章的发布时间，自动在指定时间发布。

### 设置定时发布

1. 完成文章编辑后，点击发布按钮旁的下拉箭头
2. 选择"定时发布"
3. 设置发布时间和目标平台
4. 确认后文章会进入待发布队列

### 管理定时任务

- 在文章列表中可以查看所有定时任务
- 支持修改或取消定时发布
- 发布成功/失败会有通知提醒

### 注意事项

- 定时发布需要应用在后台运行
- 如果发布时间已过且应用未运行，会在下次启动时尝试发布
- 建议提前测试平台登录状态是否有效
    `,
  },
  {
    id: "ai-assistant",
    title: "AI 助手",
    icon: Sparkles,
    content: `
## AI 辅助写作

PenBridge 内置 AI 助手，帮助你提升写作效率。

### 配置 AI 服务

1. 打开设置页面
2. 在 AI 配置中添加服务商
3. 填入 API Key 和相关配置
4. 支持多种 AI 服务商（如 OpenAI、Claude 等）

### AI 功能

- **润色优化**: 改善文章表达，提升可读性
- **生成摘要**: 自动生成文章摘要
- **翻译**: 中英文互译
- **代码解释**: 解释代码片段
- **续写**: 根据上下文续写内容

### 使用方式

1. 选中需要处理的文本
2. 右键菜单或使用快捷键调用 AI
3. 选择需要的操作
4. 查看 AI 生成结果并选择是否采用
    `,
  },
  {
    id: "settings",
    title: "设置",
    icon: Settings,
    content: `
## 应用设置

### 通用设置

- **主题**: 浅色/深色主题切换
- **语言**: 界面语言设置
- **启动**: 是否开机自启动

### 编辑器设置

- **字体**: 自定义编辑器字体
- **字号**: 调整编辑器字号
- **行距**: 调整行间距
- **拼写检查**: 开启/关闭英文拼写检查

### 平台账号

- 管理已登录的平台账号
- 查看登录状态
- 重新登录或退出登录

### 图床配置

- 配置图片上传服务
- 支持腾讯云 COS 等对象存储
- 自定义图片命名规则

### 数据管理

- 数据存储在本地 SQLite 数据库
- 支持导出/导入数据
- 定期备份建议
    `,
  },
  {
    id: "development",
    title: "开发指南",
    icon: Terminal,
    content: `
## 本地开发

PenBridge 是开源项目，欢迎贡献代码。

### 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS
- **桌面**: Electron
- **后端**: Bun + Hono + tRPC
- **数据库**: SQLite (sql.js)

### 开发环境

\`\`\`bash
# 克隆仓库
git clone https://github.com/yeyouchuan/pen-bridge.git
cd pen-bridge

# 安装依赖
bun install

# 启动开发服务器
bun run dev:server  # 启动后端
bun run dev:web     # 启动前端
\`\`\`

### 项目结构

\`\`\`
pen-bridge/
├── electron/        # Electron 桌面应用
├── packages/
│   ├── server/      # 后端服务
│   ├── web/         # 前端应用
│   ├── shared/      # 共享类型
│   └── website/     # 官网
└── docs/            # 文档
\`\`\`

### 贡献代码

1. Fork 仓库
2. 创建功能分支
3. 提交代码
4. 发起 Pull Request

详细指南请参考 [CONTRIBUTING.md](https://github.com/yeyouchuan/pen-bridge/blob/main/CONTRIBUTING.md)
    `,
  },
];

function DocsPage() {
  const [activeSection, setActiveSection] = useState(docSections[0].id);

  const currentSection = docSections.find((s) => s.id === activeSection);

  return (
    <div className="min-h-screen pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* 侧边导航 */}
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:w-64 shrink-0"
          >
            <div className="lg:sticky lg:top-24">
              <div className="flex items-center gap-2 mb-6">
                <Book className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">文档</h2>
              </div>
              <nav className="space-y-1">
                {docSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors",
                      activeSection === section.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <section.icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium">{section.title}</span>
                    {activeSection === section.id && (
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </motion.aside>

          {/* 文档内容 */}
          <motion.main
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0"
          >
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
                {currentSection && (
                  <>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <currentSection.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold m-0">
                      {currentSection.title}
                    </h1>
                  </>
                )}
              </div>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(currentSection?.content || ""),
                }}
              />
            </article>
          </motion.main>
        </div>
      </div>
    </div>
  );
}

// 简单的 Markdown 渲染（实际项目可使用 remark/rehype）
function renderMarkdown(content: string): string {
  return content
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-8 mb-4">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-10 mb-6">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc list-inside space-y-2 my-4">$&</ul>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">$1</code>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="p-4 rounded-lg bg-muted overflow-x-auto my-4"><code class="text-sm font-mono">$2</code></pre>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '</p><p class="my-4">')
    .replace(/^\|(.+)\|$/gm, (_match, content) => {
      const cells = content.split('|').map((cell: string) => cell.trim());
      const isHeader = cells.every((cell: string) => cell.match(/^-+$/));
      if (isHeader) return '';
      const tag = 'td';
      return `<tr>${cells.map((cell: string) => `<${tag} class="border border-border px-4 py-2">${cell}</${tag}>`).join('')}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, '<table class="w-full border-collapse my-4">$&</table>');
}

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});
