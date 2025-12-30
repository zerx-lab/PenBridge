# 腾讯云开发者社区文章管理工具

一个用于管理和发布腾讯云开发者社区文章的桌面应用程序。

## 功能特性

- **文章管理**: 创建、编辑和组织你的技术文章
- **Markdown 编辑器**: 使用 Milkdown 编辑器，支持丰富的 Markdown 语法
- **Word 导入**: 支持从 Word 文档导入内容
- **腾讯云发布**: 一键发布文章到腾讯云开发者社区
- **定时发布**: 支持定时发布功能（开发中）
- **自动登录**: 首次手动登录后自动保存登录状态

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + TanStack Router + shadcn/ui + Tailwind CSS |
| 后端 | Bun + Hono + tRPC + TypeORM + sql.js |
| 桌面端 | Electron + Electron Forge |
| 自动化 | Puppeteer |
| 数据库 | SQLite (sql.js) |

## 系统要求

- Node.js >= 20
- Bun >= 1.0
- 支持平台: Windows, macOS, Linux

## 安装

### 下载预构建版本

前往 [Releases](https://github.com/zero-ljz/tencent-dev-blog/releases) 页面下载适合你系统的安装包：

- **Windows**: `.exe` 安装程序
- **macOS**: `.dmg` (Intel 和 Apple Silicon)
- **Linux**: `.deb`, `.rpm`, `.AppImage`

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/zero-ljz/tencent-dev-blog.git
cd tencent-dev-blog

# 安装依赖
bun install

# 开发模式
bun run dev:server  # 启动后端 (端口 3000)
bun run dev:web     # 启动前端 (端口 5173)

# 构建
bun run build

# 打包 Electron 应用
bun run make:electron
```

## 项目结构

```
tencent-dev-blog/
├── electron/           # Electron 桌面应用
├── packages/
│   ├── server/         # 后端服务 (Hono + tRPC)
│   ├── web/            # 前端应用 (React + Vite)
│   └── shared/         # 共享类型定义
└── docs/               # 文档
```

## 开发

```bash
# 安装依赖
bun install
cd electron && npm install && cd ..

# 启动开发服务器
bun run dev:server  # 终端 1
bun run dev:web     # 终端 2

# 或同时启动前端和 Electron
bun run dev:electron
```

## 许可证

MIT License
