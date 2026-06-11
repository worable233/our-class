# OurClass

班级管理系统 — AI 驱动的班主任工具箱。

## 功能

- **AI 智能助手** — 集成 Claude / DeepSeek，用自然语言管理班级
- **积分 & 成绩管理** — 灵活加减分体系，多科目成绩排名
- **作业与提交批改** — 作业发布、在线提交、批改打分
- **权限 & 职位体系** — 角色 + 职位双层权限，精细到按钮级别
- **文章资讯** — 教师发布、学生阅读
- **数据看板** — ECharts 可视化图表、流量监控

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vue 3, TypeScript, Vite, Naive UI, Tailwind CSS, Pinia |
| 后端 | Express, TypeScript, better-sqlite3, JWT |
| AI | Anthropic Claude / OpenAI 兼容 API |

## 快速开始

```bash
# 一键安装（自动检测 Node.js、安装依赖、构建前端、启动配置向导）
# macOS / Linux
bash install.sh

# Windows
.\install.ps1
```

安装完成后，浏览器自动打开配置向导，按提示创建管理员和配置 AI 接口即可。

## 开发

```bash
# 安装依赖
npm install
cd server && npm install && cd ..

# 启动前后端开发服务器
cd server && npm run dev &   # 后端 → localhost:3000
npm run dev                   # 前端 → localhost:5173

# 类型检查
npm run type-check

# 格式化
npm run format
```

## 项目结构

```
our-class/
├── src/                  # 前端源码
│   ├── views/            # 页面组件（teacher/ student/）
│   ├── components/       # 通用组件
│   ├── stores/           # Pinia 状态管理
│   ├── router/           # 路由配置
│   └── api/              # API 客户端
├── server/               # 后端源码
│   └── src/
│       ├── routes/       # Express 路由
│       ├── middleware/    # 认证 & 验证中间件
│       ├── db/           # SQLite 数据库 & 迁移
│       └── setup/        # 首次安装向导
├── install.sh            # macOS/Linux 一键安装
├── install.ps1           # Windows 一键安装
├── reset.sh              # macOS/Linux 重置脚本
└── reset.ps1             # Windows 重置脚本
```

## 重置

```bash
# macOS / Linux
bash reset.sh

# Windows
.\reset.ps1
```

## 环境变量

复制 `.env.example` 或在配置向导中自动生成：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（必须设置） |
| `PORT` | 后端端口，默认 3000 |
| `CORS_ORIGIN` | 跨域允许来源 |

## License

MIT
