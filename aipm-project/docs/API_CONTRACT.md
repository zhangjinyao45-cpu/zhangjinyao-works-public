# AIPM 数据契约 (API & Schema)

> **版本：** v0.1.0
> **更新：** 2026-06-05
> **目的：** 前后端独立开发的"地基"，任何一方修改契约前必须征得另一方同意

---

## 0. 总览

### 0.1 系统架构

```
┌──────────────┐         HTTP/SSE          ┌──────────────┐
│   Frontend   │ ◄─────────────────────►   │   Backend    │
│  (Live2D UI) │                            │  (Node.js)   │
└──────────────┘                            └──────┬───────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ↓                     ↓                     ↓
                       [Claude API]        [aipm-data-rag]        [workspace/projects/]
                       (5 角色对话)         (App Store + HN)        (项目文件存储)
```

### 0.2 文件存储

所有项目数据存放在 `workspace/projects/{项目名}/`：

```
workspace/projects/{projectId}/
├── meta.json                          # 项目元数据（核心状态）
├── stages/                            # 阶段产出文档
│   ├── 00-需求头脑风暴设计.md
│   ├── 00.5-竞品分析报告.md
│   ├── 01-增强提示词.md
│   ├── 02-产品需求文档.md
│   ├── 03-线框图与交互规范.md
│   └── 04-UI交互原型.html
├── reviews/                           # 评审会数据
│   ├── 00-review.json
│   ├── 00-review-minutes.md
│   ├── 00.5-review.json
│   └── ...
├── decisions/                         # 决策追溯
│   ├── decision-001.md
│   ├── decision-002.md
│   └── ...
├── data-snapshots/                    # 真实数据快照（顾清的数据底盘）
│   ├── 00.5-app-store-search.json
│   ├── 00.5-hn-discussions.json
│   └── 04-pexels-results.json
└── inputs/                            # 用户输入
    ├── 00-brainstorming-answers.json  # 阶段0 答题
    └── decision-answers.json          # 决策点拍板
```

---

## 1. RESTful API

### 1.1 生命周期总览

```
[启动项目]
  POST /api/projects → 创建项目（输入想法）
  ↓
[阶段0 头脑风暴]
  GET  /api/projects/:id/stage/00/questions  ← 周明的提问列表
  POST /api/projects/:id/stage/00/answers    → 用户答题
  GET  /api/projects/:id/stage/00/artifact   ← 产出文档（Markdown）
  ↓
[评审会]
  POST /api/projects/:id/review/00           → 触发评审会
  GET  /api/projects/:id/review/00/stream    ← SSE 流式接收发言
  GET  /api/projects/:id/review/00           ← 完整评审会 JSON
  ↓
[决策拍板]
  GET  /api/projects/:id/decisions           ← 待拍板的决策点
  POST /api/projects/:id/decisions/:decId    → 提交选择
  ↓
[阶段0.5 竞品分析] ← 自动触发
  ...
[阶段1-4 同上]
  ...
[完成]
  GET  /api/projects/:id/export              ← 打包下载所有产物
```

### 1.2 通用响应格式

**成功：**
```json
{
  "success": true,
  "data": { /* 业务数据 */ }
}
```

**失败：**
```json
{
  "success": false,
  "error": {
    "code": "STAGE_NOT_READY",
    "message": "上游阶段未完成，无法进入此阶段",
    "details": { "currentStage": "00", "requestedStage": "01" }
  }
}
```

### 1.3 错误码列表

| 错误码 | HTTP 状态 | 含义 |
|--------|----------|------|
| `INVALID_INPUT` | 400 | 输入参数错误 |
| `PROJECT_NOT_FOUND` | 404 | 项目不存在 |
| `STAGE_NOT_READY` | 409 | 阶段前置条件未满足 |
| `DECISION_PENDING` | 409 | 有未拍板的决策点 |
| `DATA_RAG_FAILED` | 502 | 真实数据源调用失败 |
| `CLAUDE_API_FAILED` | 502 | Claude API 调用失败 |
| `INTERNAL_ERROR` | 500 | 其他内部错误 |

---

## 2. API 端点详细定义

### 2.1 创建项目

**`POST /api/projects`**

**请求体：**
```json
{
  "name": "大学生兼职App",          // 项目名（作为目录名，唯一）
  "idea": "我想做一个帮大学生找兼职的 App",  // 用户的初始想法
  "userPersona": "default"          // 张磊的目标用户档（影响发言风格）
}
```

`userPersona` 可选值：`default | z_generation | middle_aged | b2b_decision_maker | mom | college_student | tech_savvy`

**成功响应（201）：**
```json
{
  "success": true,
  "data": {
    "projectId": "大学生兼职App",
    "createdAt": "2026-06-05T14:30:00Z",
    "currentStage": "00",
    "currentState": "in_progress",
    "nextAction": {
      "type": "answer_questions",
      "endpoint": "/api/projects/大学生兼职App/stage/00/questions"
    }
  }
}
```

---

### 2.2 获取阶段0 提问列表

**`GET /api/projects/:id/stage/00/questions`**

周明会基于用户的想法，预先生成结构化提问（六维框架，每维 3-4 题）。

**响应：**
```json
{
  "success": true,
  "data": {
    "stage": "00",
    "stageName": "需求头脑风暴",
    "host": "zhou-ming",
    "intro": "好的，我是周明。我们用六个维度把你的想法结构化...",
    "dimensions": [
      {
        "id": "A",
        "name": "产品意图校准",
        "questions": [
          {
            "id": "A1",
            "question": "用一句话描述：这个产品是什么、给谁用、解决什么问题？",
            "type": "single_choice",
            "options": [
              { "id": "A1a", "label": "帮大学生找到靠谱的兼职机会", "description": "聚焦「靠谱」这个核心痛点" },
              { "id": "A1b", "label": "帮大学生快速找到兼职机会", "description": "聚焦「效率」" },
              { "id": "A1c", "label": "帮大学生管理兼职收入和时间", "description": "聚焦「管理」" }
            ]
          },
          {
            "id": "A2",
            "question": "这个产品的形态是？",
            "type": "single_choice",
            "options": [...]
          }
        ]
      },
      { "id": "B", "name": "用户场景与任务流", "questions": [...] },
      { "id": "C", "name": "功能范围收敛", "questions": [...] },
      { "id": "D", "name": "页面与信息架构", "questions": [...] },
      { "id": "E", "name": "交互与视觉确认", "questions": [...] },
      { "id": "F", "name": "确认收敛", "questions": [...] }
    ]
  }
}
```

**Question 类型枚举：**
- `single_choice` — 单选（2-4 个选项）
- `multi_choice` — 多选（2-6 个选项）
- `text` — 自由文本（用于无法穷举选项的场景）

**注意：**
- 周明的提问**不是预先写死的模板**，而是基于用户的 `idea` 用 Claude 动态生成
- 同一个想法，每次启动项目会生成略有差异的问题（这是特性，不是 bug）

---

### 2.3 提交阶段0 答题

**`POST /api/projects/:id/stage/00/answers`**

**请求体：**
```json
{
  "answers": [
    { "questionId": "A1", "answer": "A1a" },              // 单选传 option id
    { "questionId": "A2", "answer": ["A2a", "A2b"] },     // 多选传数组
    { "questionId": "F1", "answer": "我希望产品有温度" }   // 文本传字符串
  ]
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "stage": "00",
    "state": "review_pending",
    "artifactPath": "stages/00-需求头脑风暴设计.md",
    "nextAction": {
      "type": "trigger_review",
      "endpoint": "/api/projects/:id/review/00"
    }
  }
}
```

后端会基于答案生成 `00-需求头脑风暴设计.md`。

---

### 2.4 获取阶段产出文档

**`GET /api/projects/:id/stage/:stageNum/artifact`**

返回纯 Markdown 文本（前端自己渲染）。

**响应：**
```
Content-Type: text/markdown; charset=utf-8

# 00-需求头脑风暴设计

## 一、产品定义
- **一句话定义**：帮大学生找到靠谱的兼职机会
...
```

或 JSON 包装：

**`GET /api/projects/:id/stage/:stageNum/artifact?format=json`**

```json
{
  "success": true,
  "data": {
    "stage": "00",
    "filename": "00-需求头脑风暴设计.md",
    "content": "# 00-需求头脑风暴设计\n\n## 一、产品定义\n...",
    "wordCount": 1234,
    "generatedAt": "2026-06-05T15:30:00Z"
  }
}
```

阶段4 是 HTML 不是 Markdown，前端要识别 `filename` 后缀。

---

### 2.5 触发评审会

**`POST /api/projects/:id/review/:stageNum`**

**请求体：** 无（可选 `{ "interruptBudget": 3 }`）

**响应：**
```json
{
  "success": true,
  "data": {
    "reviewId": "00-review",
    "state": "running",
    "streamEndpoint": "/api/projects/:id/review/00/stream"
  }
}
```

---

### 2.6 SSE 流式接收评审会发言

**`GET /api/projects/:id/review/:stageNum/stream`**

**协议：** Server-Sent Events

**事件流：**
```
event: opening
data: {"speaker":"zhou-ming","speakerName":"周明","content":"好...","time":"T0"}

event: main_speech
data: {"speaker":"gu-qing","speakerName":"顾清","content":"我看到的是...","time":"T1"}

event: interrupt
data: {"speaker":"zhang-lei","interruptedSpeaker":"gu-qing","content":"等等...","time":"T1.5"}

event: closing
data: {"speaker":"zhou-ming","content":"好，评审会结束...","time":"T6","decisions":[...]}

event: complete
data: {"reviewPath":"reviews/00-review.json","decisionCount":3}
```

---

### 2.7 获取完整评审会 JSON

**`GET /api/projects/:id/review/:stageNum`**

返回 D6 编排器输出的完整 JSON（详见 §3.2）。

---

### 2.8 待拍板决策点

**`GET /api/projects/:id/decisions?status=pending`**

**响应：**
```json
{
  "success": true,
  "data": {
    "pendingDecisions": [
      {
        "id": "decision-001",
        "stage": "00",
        "question": "目标用户是否收窄到大一/大二？",
        "background": "评审会上顾清和张磊提出质疑：赚零花钱的诉求和"靠谱性"的核心价值可能不匹配...",
        "options": [
          {
            "id": "A",
            "label": "收窄到大一/大二",
            "description": "聚焦低门槛兼职",
            "pros": ["用户画像清晰", "产品设计聚焦"],
            "cons": ["与"靠谱性"诉求不匹配", "市场可能偏小"],
            "supporters": [],
            "opponents": ["zhang-lei", "gu-qing"]
          },
          {
            "id": "B",
            "label": "扩大到全体大学生",
            "description": "覆盖大三/大四实习需求",
            "pros": ["覆盖面更广", "和核心价值匹配"],
            "cons": ["用户画像模糊"],
            "supporters": ["zhou-ming", "gu-qing", "zhang-lei"],
            "opponents": []
          }
        ],
        "recommendation": "B"
      }
    ]
  }
}
```

### 2.9 提交决策

**`POST /api/projects/:id/decisions/:decisionId`**

**请求体：**
```json
{
  "choice": "B",
  "rationale": "（可选）我同意大家的判断"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "decisionId": "decision-001",
    "choice": "B",
    "decidedAt": "2026-06-05T15:45:00Z",
    "nextAction": {
      "type": "next_decision_or_advance",
      "endpoint": "/api/projects/:id/decisions?status=pending"
    }
  }
}
```

当所有决策点都拍板后，自动进入下一阶段。

---

### 2.10 项目状态总览

**`GET /api/projects/:id/status`**

返回完整的 meta.json 内容（详见 §3.1）。前端用这个驱动"流水线进度"侧边栏。

---

### 2.11 导出最终交付物

**`GET /api/projects/:id/export`**

返回 zip 文件流，包含所有阶段产出 + 评审会纪要 + 决策追溯。

---

### 2.12 错误恢复

**`POST /api/projects/:id/resume`**

如果中途中断（断网、重启），可以调用这个继续。后端读 meta.json 找到 `current_state` 自动恢复。

---

## 3. 数据 Schema

### 3.1 meta.json（项目元数据）

```json
{
  "$schema": "https://aipm.dev/schemas/meta-v1.json",
  "projectId": "大学生兼职App",
  "name": "大学生兼职App",
  "idea": "我想做一个帮大学生找兼职的 App",
  "userPersona": "default",
  "createdAt": "2026-06-05T14:30:00Z",
  "updatedAt": "2026-06-05T16:45:00Z",

  "currentStage": "00.5",
  "currentState": "review_pending",
  "globalState": "running",
  "blockedReason": null,

  "stages": {
    "00": {
      "status": "done",
      "startedAt": "2026-06-05T14:30:00Z",
      "completedAt": "2026-06-05T15:00:00Z",
      "artifactPath": "stages/00-需求头脑风暴设计.md",
      "reviewPath": "reviews/00-review.json",
      "reviewMinutesPath": "reviews/00-review-minutes.md",
      "decisions": ["decision-001", "decision-002", "decision-003"],
      "needsRedo": false
    },
    "00.5": {
      "status": "in_progress",
      "startedAt": "2026-06-05T15:10:00Z",
      "dataSnapshots": [
        "data-snapshots/00.5-app-store-search.json",
        "data-snapshots/00.5-hn-discussions.json"
      ]
    },
    "01": { "status": "pending", "needsRedo": false },
    "02": { "status": "pending", "needsRedo": false },
    "03": { "status": "pending", "needsRedo": false },
    "04": { "status": "pending", "needsRedo": false }
  },

  "decisionHistory": [
    {
      "id": "decision-001",
      "stage": "00",
      "title": "目标用户是否收窄到大一/大二？",
      "userChoice": "B",
      "decidedAt": "2026-06-05T14:55:00Z",
      "affectsStages": ["01", "02", "03", "04"]
    }
  ],

  "eventLog": [
    {
      "time": "2026-06-05T14:30:00Z",
      "event": "pipeline_started",
      "user": "default"
    },
    {
      "time": "2026-06-05T15:00:00Z",
      "event": "stage_done",
      "stage": "00"
    }
  ]
}
```

### 3.1.1 状态枚举

**`stages.{N}.status`**：
- `pending` — 待执行
- `in_progress` — 主导角色正在执行
- `review_pending` — 等待触发评审会
- `review_running` — 评审会进行中
- `decision_pending` — 等用户拍板决策点
- `done` — 已完成
- `needs_redo` — 上游变更需要重做

**`globalState`**：
- `running` — 流水线运行中
- `paused` — 暂停（等用户拍板）
- `completed` — 全部完成
- `blocked` — 卡住（必填字段在 `blockedReason`）

---

### 3.2 评审会 JSON（reviews/{stage}-review.json）

D6 编排器输出，前端 Live2D 圆桌消费。

```json
{
  "$schema": "https://aipm.dev/schemas/review-v1.json",
  "stage": "00",
  "stageName": "需求头脑风暴",
  "artifactPath": "stages/00-需求头脑风暴设计.md",

  "transcript": [
    {
      "time": "T0",
      "speaker": "zhou-ming",
      "speakerName": "周明",
      "type": "opening",
      "content": "好，阶段0 的头脑风暴产出了基础定义...",
      "timestamp": 1717584000000,
      "duration": 8000,
      "evidenceRefs": []
    },
    {
      "time": "T1",
      "speaker": "gu-qing",
      "speakerName": "顾清",
      "type": "main_speech",
      "content": "我看到的是这样的——基于 App Store CN 数据：青团社 ⭐3.7（8446 评分）...",
      "timestamp": 1717584012000,
      "duration": 25000,
      "evidenceRefs": [
        {
          "source": "app_store_cn",
          "snapshotPath": "data-snapshots/00.5-app-store-search.json",
          "snapshotIndex": 0,
          "originalUrl": "https://apps.apple.com/cn/app/.../id1274874023",
          "snippet": "青团社兼职 ⭐3.7 (8446 ratings)"
        }
      ],
      "confidence": 0.6
    },
    {
      "speaker": "zhang-lei",
      "speakerName": "张磊",
      "type": "interrupt",
      "interruptedSpeaker": "gu-qing",
      "content": "等等！顾清你说的评分，我作为用户得说一下——",
      "timestamp": 1717584040000,
      "duration": 6000
    }
  ],

  "decisions": [
    {
      "id": "decision-001",
      "stage": "00",
      "question": "目标用户是否收窄到大一/大二？",
      "background": "...",
      "options": [...],
      "recommendation": "B",
      "supporters": { "B": ["zhou-ming", "gu-qing", "zhang-lei"] }
    }
  ],

  "metadata": {
    "totalSpeaks": 9,
    "interrupts": 2,
    "duration": 180000,
    "tokenCost": 0.15,
    "model": "claude-sonnet-4-6"
  }
}
```

### 3.2.1 transcript 条目类型枚举

**`type`**：
- `opening` — 周明开场
- `main_speech` — 4 个角色主发言
- `interrupt` — 插话
- `response_to_interrupt` — 被插话者的回应
- `closing` — 周明收敛决策点

### 3.2.2 evidenceRefs（证据引用）

顾清发言里引用真实数据时必填：
- `source` — 数据源标识（`app_store_cn` / `app_store_us` / `hacker_news` / `pexels` / `manual`）
- `snapshotPath` — 数据快照文件路径
- `snapshotIndex` — 在快照中的索引
- `originalUrl` — 原始链接（用户可点开验证）
- `snippet` — 引用片段

前端在该角色发言时可显示「📎 N 条证据」按钮，点开看原始数据。

---

### 3.3 决策点（decisions/decision-{NNN}.md）

人读的 Markdown，但**前端展示用 §2.8 的 JSON 格式**。

后端写 Markdown 是为了：
1. 评委可以打开看
2. 导出 zip 时直接打包

---

### 3.4 阶段产出文档结构

每个阶段产出文档的**章节标题必须遵循约定**，方便前端解析和展示。

#### 阶段0：00-需求头脑风暴设计.md

```markdown
# 00-需求头脑风暴设计

> 生成时间：YYYY-MM-DD HH:MM
> 项目：{项目名}

## 一、产品定义
- **一句话定义**：xxx
- **目标用户**：xxx
- **核心问题**：xxx
- **产品形态**：xxx
- **首版目标**：xxx

## 二、用户场景与任务流
...

## 三、功能范围（P0/P1/P2）
...

## 四、页面与信息架构
...

## 五、交互与视觉
...

## 六、PRD-ready 自检
- [x] 用户画像清晰
- [x] 主任务流明确
- [x] P0 功能列表完整
- [x] 核心页面清单完整
- [x] 视觉风格方向已选

## 七、待评审会挑战的风险点
⚠️ ...
```

#### 阶段0.5：00.5-竞品分析报告.md

详见 `aipm-gu-qing/references/competitor-analysis-flow.md` 的报告模板。

#### 阶段1-4：详见各阶段的 SKILL references

---

## 4. SSE 事件协议

### 4.1 评审会流式事件

**`GET /api/projects/:id/review/:stageNum/stream`**

```
event: ready
data: {"reviewId":"00-review","totalSpeaks":9}

event: opening
data: {"speaker":"zhou-ming","speakerName":"周明","type":"opening","content":"...","time":"T0"}

event: main_speech
data: {"speaker":"gu-qing","speakerName":"顾清","type":"main_speech","content":"...","time":"T1"}

event: interrupt
data: {"speaker":"zhang-lei","speakerName":"张磊","type":"interrupt","interruptedSpeaker":"gu-qing","content":"...","time":"T1.5"}

event: response
data: {"speaker":"gu-qing","speakerName":"顾清","type":"response_to_interrupt","content":"...","time":"T1.6"}

event: closing
data: {"speaker":"zhou-ming","speakerName":"周明","type":"closing","content":"...","time":"T6"}

event: complete
data: {"reviewPath":"reviews/00-review.json","decisionCount":3,"durationMs":180000}

event: error
data: {"code":"CLAUDE_API_FAILED","message":"..."}
```

### 4.2 客户端示例

```javascript
const eventSource = new EventSource(`/api/projects/${projectId}/review/00/stream`);

eventSource.addEventListener('opening', (e) => {
  const data = JSON.parse(e.data);
  // 显示周明开场
});

eventSource.addEventListener('main_speech', (e) => {
  const data = JSON.parse(e.data);
  // 在 Live2D 圆桌上让该角色发言
});

eventSource.addEventListener('interrupt', (e) => {
  const data = JSON.parse(e.data);
  // 插话效果
});

eventSource.addEventListener('complete', (e) => {
  eventSource.close();
  // 显示决策点弹窗
});
```

---

## 5. 字段命名规范

- **JSON Key：** `camelCase`（如 `projectId`、`createdAt`）
- **路径参数：** `:id` / `:stageNum`
- **阶段编号：** 字符串 `"00" | "00.5" | "01" | "02" | "03" | "04"`（**保留前导零**！）
- **角色 ID：** kebab-case `"zhou-ming" | "gu-qing" | "su-yu" | "li-hang" | "zhang-lei"`
- **时间戳：** ISO 8601 字符串 `"2026-06-05T14:30:00Z"`
- **文件路径：** 相对项目根目录的 POSIX 风格 `"stages/00-xxx.md"`

---

## 6. 版本演进

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1.0 | 2026-06-05 | 初版，定义 6 阶段流水线核心 API |

**未来扩展不破坏兼容性的方式：**
- 添加新字段 ✅
- 添加新错误码 ✅
- 删除字段 ❌（必须升大版本）
- 修改字段语义 ❌（必须升大版本）
- 修改字段类型 ❌（必须升大版本）

---

## 7. 实现优先级

D7 后端实现按以下优先级，前端可以同步对照：

### P0 - 核心 Demo 路径
- [x] §3.2 评审会 JSON（D6 已完成）
- [ ] §2.1 创建项目
- [ ] §2.2 阶段0 提问列表
- [ ] §2.3 阶段0 答题
- [ ] §2.5 触发评审会
- [ ] §2.6 SSE 评审会流
- [ ] §2.8 待拍板决策
- [ ] §2.9 提交决策
- [ ] §2.10 项目状态

### P1 - 完整流水线
- [ ] 阶段0.5 竞品分析（含 RAG 调用）
- [ ] 阶段1-4 实现
- [ ] §2.4 阶段产出文档
- [ ] §2.11 导出

### P2 - 锦上添花
- [ ] §2.12 错误恢复
- [ ] needs_redo 传播逻辑
- [ ] 决策修改追溯

---

## 8. 当前 Mock 数据示例

前端开发期可用的 mock 数据放在 `frontend/data/`：

- `frontend/data/review-sample.json` - 阶段0 评审会示例
- `frontend/data/meta-sample.json` - meta.json 示例（待补）
- `frontend/data/decisions-sample.json` - 决策点列表示例（待补）

后端实现时按本文档输出格式，前端切换数据源只需改 `fetch` URL 即可。

---

**契约一旦签字，前后端各自闭门造车，联调时只需"插电"。**
