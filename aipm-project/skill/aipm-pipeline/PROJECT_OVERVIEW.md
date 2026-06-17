# AI 产品天团（aipm）项目总览

> 更新于 2026-06-05  
> 项目代号：AI 产品天团（5 角色协作 + 6 阶段流水线 + 真实数据 RAG）

## 项目目标

把 `designPM-ZJY`（单角色 6 阶段流水线）升级为 **5 角色协作的"AI 产品天团"**，每个阶段都有 5 个数字人参与评审会，**互相挑刺、直接对话、收敛决策**。

差异化定位：**Lovable / Bolt / v0 跳过了 PM 这一段直接生成代码，AIPM 做的是"想法→产品定义"这段被忽略的高价值环节，且不是"一个 AI"，是"一支会吵架的团队"。**

## 8 个 Skill 全景

```
.claude/skills/
├── designPM-ZJY/          (旧基线，不动，用作参考)
├── competitors-zjy/       (旧基线，不动，用作参考)
│
├── aipm-zhou-ming/        ✅ Lead PM 周明（主持人）
│   ├── SKILL.md
│   └── references/
│       ├── orchestration.md
│       └── stages/
│           ├── stage-0-brainstorming.md
│           ├── stage-0.5-competitor.md
│           ├── stage-1-prompt.md
│           ├── stage-2-prd.md
│           ├── stage-3-wireframe.md
│           └── stage-4-prototype.md
│
├── aipm-gu-qing/          ✅ Researcher 顾清（数据派）
│   ├── SKILL.md
│   └── references/
│       ├── competitor-analysis-flow.md
│       └── data-honesty-protocol.md
│
├── aipm-su-yu/            ✅ Designer 苏予（审美派）
│   ├── SKILL.md
│   └── references/
│       ├── design-checklist.md
│       └── visual-standards.md
│
├── aipm-li-hang/          ✅ Engineer 李航（务实派）
│   ├── SKILL.md
│   └── references/
│       ├── effort-estimation.md
│       └── tech-risk-checklist.md
│
├── aipm-zhang-lei/        ✅ User Advocate 张磊（普通用户）
│   ├── SKILL.md
│   └── references/
│       ├── 30-second-test.md
│       └── user-personas.md
│
├── aipm-review-session/   ⏳ 评审会编排（D2 做）
├── aipm-data-rag/         ⏳ 真实数据 RAG（D4 做）
└── aipm-pipeline/         ⏳ 流水线总控（D3 做）
```

## 5 人天团速查

| 角色 | 真名 | 标签 | 核心动作 |
|------|------|------|----------|
| Lead PM | 周明 | 沉稳 / 追问 / 收敛 | 主持流水线、召集评审会、收敛决策点 |
| 用研竞品 | 顾清 | 数据 / 严谨 / 诚实 | 提供事实底盘、标置信度、声明数据缺口 |
| 设计师 | 苏予 | 挑剔 / 克制 / 守底线 | 审美把关、信息架构、交互完整性 |
| 工程师 | 李航 | 务实 / 泼冷水 / 给方案 | 工时估算、技术风险、轻量替代方案 |
| 普通用户 | 张磊 | 不耐烦 / 真实 / 用户视角 | 30 秒扫一眼测试、伪需求识别、直觉反馈 |

## 6 阶段流水线（升级版）

```
阶段0   头脑风暴       周明主持 → 评审会1
   ↓
阶段0.5 竞品分析       顾清主导 → 评审会2
   ↓
阶段1   提示增强       周明主导 → 评审会3
   ↓
阶段2   PRD            周明主导 → 评审会4
   ↓
阶段3   线框图         苏予主把关 → 评审会5
   ↓
阶段4   高保真原型     全员综合 → 评审会6
```

**每个阶段产出后必须开评审会，5 人天团挑战，用户拍板，才能进入下一阶段。**

## 评审会发言顺序

```
周明开场（点名第一个发言人）
  ↓
顾清（数据派 - 提供事实底盘）
  ↓ 可被插话
张磊（用户视角 - 现实检查）
  ↓ 可被插话
苏予（设计师 - 体验把关）
  ↓ 可被插话
李航（工程师 - 技术约束）
  ↓
周明收敛（提炼分歧 + 抛 2-4 个决策点）
  ↓
用户拍板
```

## 一周路线图

| 天 | 任务 | 状态 |
|---|------|------|
| D1 (今天) | 5 个角色 SKILL + references | ✅ 完成 |
| D2 | aipm-review-session 评审会编排 | ⏳ |
| D3 | aipm-pipeline 流水线总控 | ⏳ |
| D4 | aipm-data-rag 真实数据 RAG | ⏳ |
| D5 | 端到端跑通 + 调优 | ⏳ |
| D6 | （拉伸）Web 单页 Demo | ⏳ |
| D7 | 收尾 + Demo 视频脚本 | ⏳ |

## 使用方式（CLI 跑通版）

```bash
# 调用周明启动流水线
/aipm-zhou-ming stage:0 "我想做一个帮大学生找兼职的 App"

# 阶段0 完成 → 周明触发评审会（aipm-review-session）
# 5 人轮流发言 → 周明收敛决策点

# 用户拍板后进入下一阶段
/aipm-zhou-ming stage:0.5 "确认进入竞品分析"

# 周明调用顾清（aipm-gu-qing）
# 顾清调用真实数据 RAG（aipm-data-rag）
# ... 后续阶段类似
```

## 与 designPM-ZJY 的关键差异

| 维度 | designPM-ZJY（旧） | aipm（新） |
|------|---------------------|-----------|
| 角色数 | 1（只有 PM） | 5（PM + 用研 + 设计 + 工程 + 用户） |
| 决策方式 | PM 提问 → 用户回答 | 5 人评审会 → 决策点收敛 |
| 数据来源 | 模型脑补 | 真实数据 RAG（Pexels + 知乎 + App Store） |
| 输出文档 | 单线产物 | 文档 + 评审会纪要 + 决策追溯 |
| 阶段数 | 6 | 6（结构相同，每阶段加评审会） |

## 下一步

继续推进 D2：`aipm-review-session`（评审会编排 skill）。
