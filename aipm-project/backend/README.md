# AIPM 评审会编排器（D6）

## 功能

输入阶段产物 → 输出评审会 JSON + Markdown 纪要

实现了完整的评审会流程：
- T0: 周明开场
- T1-T4: 4 个角色主发言 + 插话机制
- T6: 周明收敛决策点

## 安装

```bash
cd backend
npm install
```

## 配置

复制环境变量模板：
```bash
cp .env.example .env
```

编辑 `.env`，填入你的 `ANTHROPIC_API_KEY`。

## 使用

### 方式 1：直接运行（需 API Key）

```bash
node src/index.js 00 ../workspace/projects/大学生兼职App/00-需求头脑风暴设计.md
```

### 方式 2：Mock 模式（开发期，无需 API Key）

```bash
USE_MOCK=true node src/index.js 00 ../workspace/projects/大学生兼职App/00-需求头脑风暴设计.md
```

或使用快捷脚本：
```bash
npm run mock
```

### 方式 3：运行示例

```bash
npm run example
```

## 输出

- `output/review-{stage}-{timestamp}.json` - 评审会完整数据（供前端消费）
- `output/review-{stage}-{timestamp}.md` - 评审会纪要（可读）

## 架构

```
src/
├── index.js             # CLI 入口
├── review-session.js    # 评审会编排器（核心）
├── claude-client.js     # Claude API 封装（支持 Mock）
├── persona-loader.js    # 加载 5 个角色 SKILL.md
└── interrupt-engine.js  # 插话决策引擎
```

## Mock 模式说明

开发期可用 `USE_MOCK=true` 跳过 API 调用，快速验证流程。Mock 模式返回预设的发言内容，插话决策用随机评分模拟。

## 下一步（D7）

- [ ] 流水线总控（串联 6 阶段）
- [ ] 决策点追溯（写入 decisions/）
- [ ] 项目工作区管理（meta.json）
