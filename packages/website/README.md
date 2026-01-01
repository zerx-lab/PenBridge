# PenBridge 官网

PenBridge 官方网站，提供产品介绍、文档和功能调研投票等功能。

## 技术栈

- **前端框架**: React 19 + TypeScript
- **路由**: TanStack Router
- **样式**: Tailwind CSS 4 + shadcn/ui
- **动画**: Framer Motion
- **部署**: Vercel

## 本地开发

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 构建生产版本
bun run build

# 预览生产版本
bun run preview
```

## 项目结构

```
packages/website/
├── api/                    # Vercel Serverless Functions
│   ├── auth/
│   │   ├── github.ts       # GitHub OAuth 登录入口
│   │   └── callback.ts     # OAuth 回调处理
│   └── features.ts         # 功能调研 API
├── public/                 # 静态资源
├── src/
│   ├── content/docs/       # MDX 文档内容
│   ├── routes/             # 页面路由
│   │   ├── __root.tsx      # 根布局
│   │   ├── index.tsx       # 首页
│   │   ├── docs.tsx        # 文档页
│   │   └── survey.tsx      # 功能调研页
│   └── lib/                # 工具函数
├── vercel.json             # Vercel 配置
└── package.json
```

## 环境变量配置

在 Vercel 项目设置中配置以下环境变量：

### 必需的环境变量

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token，用于服务端操作 Discussions | [创建 Token](https://github.com/settings/tokens/new?scopes=repo,read:user) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID | 从 OAuth App 设置页获取 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret | 从 OAuth App 设置页获取 |

### 环境变量详细说明

#### GITHUB_TOKEN

用于服务端 API 操作 GitHub Discussions，需要以下权限：
- `repo` - 完整的仓库访问权限（用于创建和管理 Discussions）
- `read:user` - 读取用户信息

创建步骤：
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 选择 `repo` 和 `read:user` scope
4. 生成并复制 token

#### GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET

用于 GitHub OAuth 登录，让用户可以使用 GitHub 账号登录并投票。

创建 OAuth App 步骤：
1. 访问 https://github.com/settings/developers
2. 点击 "New OAuth App"
3. 填写应用信息：
   - **Application name**: PenBridge Survey
   - **Homepage URL**: `https://pen-bridge.zerx.dev`（或你的域名）
   - **Authorization callback URL**: `https://pen-bridge.zerx.dev/api/auth/callback`
4. 创建后获取 Client ID 和 Client Secret

## GitHub 仓库配置

为了让功能调研投票正常工作，需要在 GitHub 仓库中启用 Discussions：

1. 进入仓库设置 (Settings)
2. 在 "Features" 部分勾选 "Discussions"
3. 确保有 "Ideas" 或 "功能建议" 分类（用于用户提交的建议）

### 标签管理系统

功能的状态和分类完全通过 GitHub Labels 来管理，无需修改代码。管理员可以在 GitHub 中为 Discussion 添加标签来控制功能的显示状态。

#### 需要创建的标签

在 GitHub 仓库的 Labels 页面创建以下标签：

**状态标签**（控制功能的开发状态）：

| 标签名 | 颜色建议 | 说明 |
|--------|----------|------|
| `status:voting` | 蓝色 (#0366d6) | 功能正在投票中，用户可以投票 |
| `status:planned` | 橙色 (#f9a825) | 功能已规划，将在未来版本中实现 |
| `status:completed` | 绿色 (#28a745) | 功能已完成，投票按钮禁用 |

**分类标签**（控制功能的分类）：

| 标签名 | 颜色建议 | 说明 |
|--------|----------|------|
| `category:平台支持` | 紫色 (#7b1fa2) | 新平台发布渠道支持 |
| `category:功能增强` | 青色 (#00acc1) | 现有功能的增强改进 |
| `category:用户建议` | 粉色 (#ec407a) | 用户提交的功能建议 |

#### 默认值

- 如果 Discussion 没有状态标签，默认显示为 `voting`（投票中）
- 如果 Discussion 没有分类标签，默认显示为 `用户建议`

#### 管理员操作流程

1. **创建新功能**：在 GitHub Discussions 的 "Ideas" 分类中创建新的讨论
2. **设置状态**：为讨论添加 `status:voting` 等状态标签
3. **设置分类**：为讨论添加 `category:功能增强` 等分类标签
4. **更新状态**：当功能开发完成后，将标签改为 `status:completed`

#### 用户提交的建议

当用户通过网站提交功能建议时，系统会自动创建一个 Discussion，标题前缀为 `[功能建议]`。管理员需要：

1. 审核建议内容
2. 添加适当的 `status:` 和 `category:` 标签
3. 建议添加后会自动显示在投票列表中

## 功能调研页面 (/survey)

功能调研页面支持：

- **GitHub 登录**: 用户使用 GitHub 账号登录
- **投票**: 登录后可以为功能投票（对应 Discussion 的 Reaction）
- **提交建议**: 用户可以提交新的功能建议（创建新的 Discussion）

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/github` | GET | 发起 GitHub OAuth 登录 |
| `/api/auth/callback` | GET | OAuth 回调处理 |
| `/api/features` | GET | 获取功能列表和投票数 |
| `/api/features` | POST | 投票或提交建议 |

### POST /api/features 请求体

投票：
```json
{
  "action": "vote",
  "featureId": "feature-id",
  "userToken": "用户的 GitHub token"
}
```

取消投票：
```json
{
  "action": "unvote",
  "featureId": "feature-id",
  "userToken": "用户的 GitHub token"
}
```

提交建议：
```json
{
  "action": "suggest",
  "title": "功能标题",
  "description": "功能描述"
}
```

## 部署

### Vercel 部署

1. 将仓库连接到 Vercel
2. 设置 Root Directory 为 `packages/website`
3. 配置上述环境变量
4. 部署

### 注意事项

- OAuth callback URL 必须与 GitHub OAuth App 中配置的一致
- 首次部署后需要更新 OAuth App 的 callback URL 为实际部署的域名
