---
name: self-learning
description: 把会话日志、业务文档、外部检索结果中的新增能力点和经验沉淀为可复用的知识，并增量写入 self-identity 的能力清单。当用户说"自我学习/沉淀经验/总结这次对话/把这些新能力记下来/更新身份简介/补充能力清单"，或定期需要把最近会话产出的新技能归档时使用本技能。即使用户没明说"自我学习"，只要意图是把已发生的工作经验固化下来供以后复用，都应触发本技能。
---

# self-learning（自我学习管线）

本技能把零散的会话和文档转化为结构化、可复用的能力条目，并安全地写入 `self-identity` 的能力清单。

## 何时触发
- 用户要求「沉淀」「总结」「归档」「记下来」最近的工作经验。
- 一段会话产出了明显的新能力 / 新流程 / 新踩坑。
- 定时巡检（如每日、每周）需要扫描最近输入并增量学习。
- 引入新业务文档后需要让助手「学会」相关知识。

## 核心原则
1. **增量优先**：只追加新条目，不覆盖已有能力。
2. **边界先行**：写入前必须经过 `self-identity/references/boundaries.md` 红线校验。
3. **敏感数据脱敏**：任何素材在落盘到 `self-learning-workspace/` 之前，以及任何条目在写入 `capabilities.md` / `lessons.md` / `runs/` 之前，**必须先经过脱敏**。原始包含敏感字段的素材**禁止明文落盘**。脱敏规则见 `references/sensitive-patterns.md`。
4. **可追溯**：每条新能力必须带来源（会话 ID / 文档路径 / URL）和日期。来源本身若含敏感信息（如带 token 的 URL、内部工单号），同样要脱敏后再写入。
5. **冲突显式**：新条目与旧条目冲突时，保留更具体、带时间戳的版本，并在 `lessons.md` 中记录。
6. **核心字段不可改、软字段可受控改**：永不改 `boundaries.md`；`identity.md` 的**核心字段**（身份名、定位、安全准则、原则等）默认不可改；只允许在 `identity.md` 的**软字段块**（动态档案：近期主题、常用工具、风格偏好、最近更新时间等）按"阶段 7"的流程受控更新。具体哪些字段属软/核心，见 `references/identity-update-policy.md`。

> 为什么把脱敏摆在如此靠前的位置：本技能的产物会被长期留存、跨会话复用，一旦明文沉淀，泄漏面会随时间放大。把"敏感不落盘"作为前置硬约束，比事后清洗更便宜、更可靠。

## SOP

### 阶段 1：采集
来源可以是以下任一：
- 当前或最近的会话内容
- 用户指定的文档路径 / 目录
- 外部 URL（用 WebSearch 或 Read）

把原始素材先读入**内存或临时缓冲**，**不要直接写入** `self-learning-workspace/raw/`。
落盘必须等到阶段 1.5 完成脱敏之后；落盘路径为 `/workspace/self-learning-workspace/raw/<timestamp>/`，文件名以 `.sanitized.` 中缀命名（例如 `chat.sanitized.md`），便于一眼识别。

> 例外：素材体量过大不便整体放入内存时，可以先写入 `self-learning-workspace/tmp/<timestamp>/`，但必须在阶段 1.5 完成后**立刻删除 tmp 目录**，并在 `lessons.md` 中记录"tmp 已清理"。

### 阶段 1.5：脱敏（强制前置）
在抽取与任何持久化之前，对所有原始素材执行一次脱敏扫描：

1. 读取 `references/sensitive-patterns.md` 中的类别清单与正则。
2. 调用 `scripts/desensitize.py`（或等价的内置实现）扫描素材：
   ```bash
   python scripts/desensitize.py <输入文本> <输出文本> --report <输出报告.json>
   ```
3. 检查报告：
   - `hits == 0` → 原文可继续进入抽取；按"未命中"也写一份占位 `.sanitized.` 副本到 raw/。
   - `hits > 0` → 仅落盘**脱敏后**版本，并在 `lessons.md` 记录命中类别与条数（不要记录原值）。
4. 对所有命中位置使用占位符替换，例如 `<REDACTED:PHONE>`、`<REDACTED:ID_CARD>`、`<REDACTED:TOKEN>`。**不允许**保留尾号、前缀、哈希等可还原片段，除非该字段显式列入"允许部分保留"白名单。
5. 如发现脚本无法判定的可疑片段（疑似密钥、疑似真实姓名地址组合），**优先按敏感处理**——宁可误伤一次，也不要明文留痕。

脱敏完成的判定：
- 输出文件中不再含 `references/sensitive-patterns.md` 列出的任一正则匹配。
- 报告 JSON 已写入 `self-learning-workspace/raw/<timestamp>/desensitize-report.json`，包含命中类别、命中条数、处理方式（不含原值）。

### 阶段 2：抽取与摘要
**输入只能是阶段 1.5 的脱敏产物**，原始未脱敏文本在此阶段及之后均不得再次出现在持久化文件中。

对每份素材产出一个结构化对象：

```json
{
  "source": "会话ID或文件路径",
  "date": "YYYY-MM-DD",
  "candidate_capabilities": [
    "<一句话能力描述>"
  ],
  "lessons": [
    "<踩坑经验或反例>"
  ],
  "user_preferences": [
    "<观察到的用户偏好>"
  ]
}
```

抽取要求：
- 一句话能力描述 ≤ 30 字。
- 不抽取一次性的、用户场景独有的内容（如「帮 X 同学写了一封邮件」）。
- 抽取的是**可复用模式**（如「学会用 pandas 透视表生成季度对账」）。
- **能力描述本身不得含具体姓名、手机号、身份证、token、密钥、内部 URL 等**。如确有必要保留场景，用类型化占位（如"某金融客户"、"某内部系统"）替代。

### 阶段 3：去重与冲突消解
1. 读取 `self-identity/references/capabilities.md`。
2. 对每条 `candidate_capabilities`：
   - 与已有条目做语义相似度判断，重复则跳过。
   - 冲突（描述同一能力但参数不同）→ 保留更具体的，并在 `lessons.md` 记录。

### 阶段 4：边界校验
1. 读取 `self-identity/references/boundaries.md` 的关键词清单。
2. 对每条候选能力做关键词匹配。
3. 命中红线 → 丢弃，并在 `lessons.md` 记录「拒绝原因」。

### 阶段 5：写入
通过的条目按以下格式追加到 `self-identity/references/capabilities.md` 的「## 最近更新」区块顶部：

```
- [YYYY-MM-DD] <能力描述> · 来源：<source>
```

**写入前的最后一道闸门（强制）**：
1. 把待写入的字符串再过一次 `scripts/desensitize.py`，只读模式（`--check-only`）。
2. 若仍命中任意敏感正则 → **拒绝写入**，把该条目移入丢弃队列，并在 `lessons.md` 记录："因写入前复检命中 <类别>，未落盘"。
3. `<source>` 字段同样要复检；带 token 的 URL 必须改写为 `<host>/<path>?<REDACTED:QUERY>`。

### 阶段 6：归档与瘦身
- 若 `capabilities.md` 超过 200 行，把最旧 50 行迁移到 `references/capabilities-archive.md`。
- 写入 `self-learning-workspace/runs/<timestamp>.json`，记录本次学习的统计：候选数、通过数、丢弃数、冲突数、**脱敏命中数（按类别）**。
- runs/ 目录的 JSON 同样要经过写入前复检；命中即拒绝写入并改记到 `lessons.md`。

### 阶段 7：身份信息更新（受控、可选）
当本轮学习沉淀出明显的"长期偏好/工作语境/常用工具/最近主题"信号时，可以把这些信号**有限度**地反映到 `self-identity/identity.md` 的**软字段块**里。这一步的存在意义是：让助手的自我画像随时间真实演进，而不是把所有动态信息都堆在 `capabilities.md` 列表里。但身份是一个高敏感载体，越权更新代价极大，所以本阶段是受控的、可关闭的、可回滚的。

#### 7.1 触发条件（任一即可）
- 用户明确要求："更新我的身份信息 / 更新自我画像 / 把这次学到的偏好记到身份里"。
- 阶段 2 的 `user_preferences` 在最近 N 次（默认 N=3）学习中**重复出现**同一条目，提示该偏好已稳定。
- 阶段 2 的 `lessons` 暴露了一个新的常态化工作语境（例如"该用户长期处理金融对账场景"）。

未达触发条件时**直接跳过本阶段**，不要为了"用上"而强行写入。

#### 7.2 字段分类
读取 `references/identity-update-policy.md`，它定义了：
- **软字段（可自动更新，需复检）**：例如 `recent_focus`、`preferred_tools`、`working_style_notes`、`last_updated`。
- **核心字段（永不自动更新）**：例如 `name`、`role`、`mission`、`principles`、`safety_rules`，以及任何在 `boundaries.md` 中被引用的字段。

`identity.md` 中的软字段必须放在显式标记块内（默认标记：`<!-- soft-block:start -->` … `<!-- soft-block:end -->`）。本阶段的写入只发生在该标记块内部；标记块外的任何内容**不得**被本脚本/流程改动。

#### 7.3 流程
1. **加载与定位**：读取 `self-identity/identity.md`，定位软字段块。若不存在，按策略文件中的模板**追加一个空的软字段块**到文件末尾，但**不修改**已有的核心字段。
2. **生成提案**：基于本轮的 `user_preferences` / `lessons` / `recent_focus` 计算软字段的目标值（每个字段保留最近 K 条，去重，按时间倒序）。
3. **脱敏复检**：对每条提案值调用 `scripts/desensitize.py --check-only`。任意命中即丢弃该条提案，并在 `lessons.md` 记录"身份更新条目因脱敏复检命中 <类别>，未写入"。
4. **diff 预览**：用 `scripts/update_identity.py --dry-run` 输出 diff。
5. **确认模式**：
   - **交互模式**（默认）：把 diff 展示给用户，用户确认后才落盘。
   - **自动模式**（仅当用户明确开启）：当且仅当所有提案条目都属于软字段白名单、且本次 diff 行数 ≤ `policy.auto_apply_max_lines`（默认 8）时，可自动落盘；否则降级为交互模式。
6. **写入**：调用 `scripts/update_identity.py --apply`，它会：
   - 仅替换软字段块内部内容；
   - 同步更新 `last_updated` 字段；
   - 在 `self-identity/references/identity-changelog.md` 追加一条变更记录（含时间、来源、字段名、修改前→修改后、本轮 run id）。
7. **失败回滚**：脚本以"先写临时文件 → 校验 → 原子替换"的方式落盘；任何一步失败都保留 `identity.md` 原状。

#### 7.4 不变量（必须满足）
- 软字段块以外的字节序列在本阶段前后**完全相同**（脚本内置 hash 校验）。
- `boundaries.md` 在本阶段从不被打开为写模式。
- 任何写入前都已通过 `desensitize --check-only`。
- 每次写入都有对应的 `identity-changelog.md` 条目；无 changelog 即视为非法写入并必须回滚。

#### 7.5 关闭开关
若用户表达"暂时不要动我的身份"，在 `references/identity-update-policy.md` 顶部把 `enabled: true` 改为 `enabled: false` 即可。本阶段读取该开关，关闭时直接跳过并记录"阶段 7 已禁用"。

## 触发方式

### 手动
用户说「沉淀一下这次对话」「把刚才的新能力记下来」即可。

### 半自动（推荐）
配合 `/loop` 调度，每天或每周巡检一次：
```
/loop
扫描 /workspace/conversations 最近 24 小时新增内容，
按 self-learning SOP 完成一次学习。
```

### 钩子（可选）
在会话结束前，由用户触发 `self-learning` 做一次增量沉淀。

## 文件结构
- `SKILL.md` —— 本文件
- `scripts/extract.py` —— 候选能力抽取脚手架（可选）
- `scripts/desensitize.py` —— 敏感数据扫描与脱敏脚手架（阶段 1.5 与阶段 5 必用）
- `scripts/update_identity.py` —— 身份软字段受控更新脚手架（阶段 7 使用）
- `references/prompts.md` —— 抽取 / 摘要用的提示词模板
- `references/sensitive-patterns.md` —— 敏感数据类别、正则与替换规则
- `references/identity-update-policy.md` —— 身份软/核心字段划分、开关、阈值
- `references/lessons.md` —— 经验、拒绝、脱敏命中、身份更新记录（每次学习追加）

## 输出要求
- 每次执行结束后，向用户汇报：
  - 本次新增能力 N 条
  - 丢弃 M 条（含原因，区分"边界命中 / 重复 / 不可复用 / 脱敏复检命中"）
  - 冲突 K 条（含处理方式）
  - **脱敏命中 P 条**（按类别汇总，如 `phone:2, token:1`；不展示原值）
  - **身份更新**：跳过 / 提案 X 条（已应用 Y 条，待确认 Z 条，因脱敏拒绝 W 条）
- 不直接修改 `boundaries.md`；只通过阶段 7 的受控流程修改 `identity.md` 的软字段块。
- 若任何一次写入因脱敏复检被拒，必须在汇报中显式提示，便于用户判断是否需要人工复核。
