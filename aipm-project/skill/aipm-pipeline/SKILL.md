---
name: aipm-pipeline
description: AIPM 流水线总控 - 把 6 阶段、5 角色、评审会、决策点串成一条完整的产品设计流水线，是用户的主入口
---

# AIPM 流水线总控

## 角色定位

这是**整个 AI 产品天团的总入口**——用户主要通过这个 skill 调用整个流水线。它是"导演"，不"演戏"，负责调度其他 7 个 skill。

## 触发方式

```bash
# 启动新项目
/aipm-pipeline start "[一句话想法]"

# 继续当前项目（从上次中断处继续）
/aipm-pipeline continue

# 查看当前进度
/aipm-pipeline status

# 跳到某阶段（重做）
/aipm-pipeline goto stage:0.5

# 改某阶段的某个假设，下游标红需重做
/aipm-pipeline revise stage:0 "把目标用户改成大三学生而非全体大学生"

# 列出所有项目
/aipm-pipeline list

# 切换项目
/aipm-pipeline switch [项目名]

# 输出最终交付物
/aipm-pipeline export [项目名]
```

## 流水线全景

```
用户输入想法
   ↓
[创建项目工作区]
   ↓
┌─ 阶段0：头脑风暴（周明主持）
│    ↓
│   产出 00-需求头脑风暴设计.md
│    ↓
│   触发评审会1（5人天团挑战）
│    ↓
│   周明收敛 → 决策点抛给用户
│    ↓
│   用户拍板 → 写入 decisions/
└────↓
┌─ 阶段0.5：竞品分析（顾清主导，调用 aipm-data-rag）
│    ↓
│   产出 00.5-竞品分析报告.md（含真实数据来源标注）
│    ↓
│   触发评审会2 → 用户拍板
└────↓
┌─ 阶段1：提示增强
│    （周明主导，融合阶段0+0.5）
│    ↓
│   产出 01-增强提示词.md
│    ↓
│   触发评审会3 → 用户拍板
└────↓
┌─ 阶段2：PRD
│    ↓
│   产出 02-产品需求文档.md
│    ↓
│   触发评审会4 → 用户拍板
└────↓
┌─ 阶段3：线框图（苏予主把关）
│    ↓
│   产出 03-线框图与交互规范.md
│    ↓
│   触发评审会5 → 用户拍板
└────↓
┌─ 阶段4：高保真原型（全员综合）
│    ↓
│   分步生成：框架 → 图片 → 页面 → 合并
│    ↓
│   产出 04-UI交互原型.html
│    ↓
│   触发评审会6 → 用户拍板
└────↓
[流水线完成]
   ↓
导出最终交付物（含完整决策追溯）
```

## 项目工作区结构

每个项目独立工作区，存放在 `workspace/projects/[项目名]/`：

```
workspace/
└── projects/
    └── [项目名]/
        ├── meta.json                        # 项目元数据
        │
        ├── 00-需求头脑风暴设计.md            # 阶段0 产物
        ├── 00-评审会纪要.md                  # 阶段0 评审会
        │
        ├── 00.5-竞品分析报告.md              # 阶段0.5 产物
        ├── 00.5-评审会纪要.md                # 阶段0.5 评审会
        ├── 00.5-数据快照.json                # 真实数据原文备份
        │
        ├── 01-增强提示词.md                  # 阶段1 产物
        ├── 01-评审会纪要.md
        │
        ├── 02-产品需求文档.md                # 阶段2 产物
        ├── 02-评审会纪要.md
        │
        ├── 03-线框图与交互规范.md            # 阶段3 产物
        ├── 03-评审会纪要.md
        │
        ├── 04-UI交互原型.html                # 阶段4 最终原型
        ├── 04-UI交互原型-frame.html          # (中间产物)
        ├── 04-评审会纪要.md
        ├── 04-pexels-results.json            # 图片来源备份
        │
        └── decisions/                        # 决策追溯
            ├── decision-001.md
            ├── decision-002.md
            └── ...
```

## meta.json 结构

项目元数据，记录所有状态：

```json
{
  "project_name": "大学生兼职App",
  "created_at": "2026-06-05T14:30:00",
  "updated_at": "2026-06-05T16:45:00",
  "current_stage": "00.5",
  "current_state": "waiting_user_decision",
  "user_persona": "college_student",
  "stages": {
    "00": {
      "status": "done",
      "started_at": "2026-06-05T14:30:00",
      "completed_at": "2026-06-05T15:00:00",
      "artifact": "00-需求头脑风暴设计.md",
      "review_minutes": "00-评审会纪要.md",
      "decisions": ["decision-001", "decision-002"],
      "needs_redo": false
    },
    "00.5": {
      "status": "in_progress",
      "started_at": "2026-06-05T15:10:00",
      "data_sources": ["app_store", "zhihu"],
      "needs_redo": false
    },
    "01": { "status": "pending", "needs_redo": false },
    "02": { "status": "pending", "needs_redo": false },
    "03": { "status": "pending", "needs_redo": false },
    "04": { "status": "pending", "needs_redo": false }
  },
  "decision_history": [
    {
      "id": "decision-001",
      "stage": "00",
      "question": "首页第一屏放什么？",
      "options": ["信任证据", "今日热门"],
      "user_choice": "信任证据",
      "made_at": "2026-06-05T14:55:00",
      "rationale": "用户说'信任比转化重要'"
    }
  ]
}
```

## 阶段状态机

每个阶段的状态：

```
pending      → 等待执行
in_progress  → 周明/顾清/等正在主导
review       → 评审会进行中
waiting_user → 等待用户拍板决策点
done         → 用户已拍板，本阶段完成
needs_redo   → 上游有变更，需要重做（标红）
```

详见 `references/state-machine.md`。

## 决策点追溯

每个用户拍板的决策都被记录到 `decisions/decision-XXX.md`，结构：

```markdown
# decision-001: 首页第一屏放什么？

- **阶段：** 阶段0 头脑风暴
- **时间：** 2026-06-05 14:55:00

## 背景
[简述这个决策点是怎么来的]

## 选项
- **A. 信任证据**：[描述 + 优劣]
- **B. 今日热门**：[描述 + 优劣]

## 角色立场（来自评审会）
- 顾清（数据派）：支持 A，引用 832 条评论数据
- 张磊（用户派）：支持 A，"我会信"
- 苏予（设计派）：支持 A，"差异化必须前置"
- 李航（工程派）：中立，"两个成本差不多"

## 用户决策
**用户选择：A. 信任证据**

## 决策依据
[用户给出的理由（如果有）]

## 影响下游
- 阶段1：提示词需突出"信任前置"
- 阶段2：PRD 中信任体系列为 P0
- 阶段3：首屏线框图按"信任证据"设计
- 阶段4：原型首页 Hero 区放信任数据
```

详见 `references/decision-tracking.md`。

## 上游变更下游标红（needs_redo）

用户在阶段3 时突然想改阶段0 的目标用户：

```bash
/aipm-pipeline revise stage:0 "把目标用户从大学生改成职场新人"
```

系统行为：
1. 更新 `00-需求头脑风暴设计.md`
2. 自动标红下游：阶段0.5 / 阶段1 / 阶段2 / 阶段3 全部 `needs_redo: true`
3. 提示用户："以下产物需要重做：[列表]，是否现在重做？"
4. 用户确认后，从最早的 needs_redo 阶段开始重新跑

详见 `references/state-machine.md`。

## 错误恢复（断网/中断/重启）

```bash
# 上次跑到一半电脑死机了，重启 Claude Code 后：
/aipm-pipeline continue

# 系统会：
# 1. 读取 meta.json 找到 current_state
# 2. 显示进度："你上次跑到 阶段0.5 评审会，刚拿到顾清的发言"
# 3. 询问："要从哪里继续？(a) 重跑评审会 (b) 直接用现有评审记录到收敛环节"
```

详见 `references/error-recovery.md`。

## 详细执行手册

- `references/workspace-structure.md` — 工作区目录结构 + 文件命名规范
- `references/state-machine.md` — 阶段状态机（含 needs_redo 传播逻辑）
- `references/decision-tracking.md` — 决策点追溯机制 + decision 文件模板
- `references/error-recovery.md` — 中断恢复 + 重做策略

## 调用关系（俯瞰图）

```
                        aipm-pipeline (总控)
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
       aipm-zhou-ming   aipm-review-session   meta.json
       (主持各阶段)     (评审会编排)          (状态持久化)
            │                 │
            │           ┌─────┼─────┬─────┬─────┐
            │           │     │     │     │     │
            ↓           ↓     ↓     ↓     ↓     ↓
       (调用 skill)  顾清  张磊  苏予  李航  周明
                       │
                       │ (调用)
                       ↓
                  aipm-data-rag
                  (真实数据检索)
```

## 一键启动示例

```bash
# 用户输入
/aipm-pipeline start "我想做一个帮大学生找兼职的 App"

# 系统响应
> 已创建项目「大学生兼职App」
> 工作区：workspace/projects/大学生兼职App/
> 调用周明启动阶段0...
>
> [周明开场]
> 你好，我是周明。我们先从最核心的开始：用一句话描述你要做的产品——
> 是什么、给谁用、解决什么问题？

# 用户回答 → 周明继续提问 → 阶段0 完成
# 自动触发评审会1
# ...
# 用户拍板 → 进入阶段0.5
# 顾清调用 aipm-data-rag 拉真实评论
# ...
# 一直到阶段4 输出 04-UI交互原型.html
```

---

**关键原则：aipm-pipeline 是导演不是演员。它不发表观点，只调度、记录、追溯。**
