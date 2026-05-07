# 旅行规划 Agent小青 实现方案

## 基于 LangChain + LangGraph 的智能旅行规划系统

## 1. 项目定位

本项目目标是构建一个面向旅行场景的智能规划 Agent。用户通过前端表单输入出行日期、游玩天数、同行关系、人数、预算、节奏、起点、终点、兴趣标签和备注信息，Agent 根据这些结构化信息生成可执行、可解释、可前端渲染的旅行路线方案。

该 Agent 不是简单的聊天问答工具，而是一个具备结构化输入理解、偏好融合、POI 检索、路线规划、预算控制、节奏控制、结果校验和多轮修改能力的旅行规划系统。

核心目标：

- 将前端结构化输入转化为统一的旅行需求画像；
- 从用户备注中提取补充偏好和限制条件；
- 检索并筛选符合需求的景点、餐厅、活动和交通建议；
- 生成符合天数、起终点、预算、节奏和兴趣偏好的旅行路线；
- 对路线进行合理性校验，避免路线过满、绕路、预算不匹配、终点错误等问题；
- 输出稳定 JSON，供前端直接渲染；
- 支持后续用户修改路线，例如“第二天轻松一点”“多加海边拍照点”“不要网红店，换成本地小店”。

***

## 2. 用户输入设计

当前前端能够采集到的用户输入主要包括：出行时间、同行关系与人数、预算与节奏、起点与终点、兴趣标签与备注。

### 2.1 出行时间

| 字段              | 含义   | 示例值        |
| --------------- | ---- | ---------- |
| departure\_date | 出发日期 | 2026/05/08 |
| duration\_days  | 游玩天数 | 2          |

游玩天数可选项：

| 展示文案 | 建议后端值   |
| ---- | ------- |
| 1天   | 1       |
| 2天   | 2       |
| 3天   | 3       |
| 4天+  | 4\_plus |

示例 JSON：

```json
{
  "departure_date": "2026/05/08",
  "duration_days": 2
}
```

### 2.2 同行关系与人数

| 字段            | 含义   | 示例值   |
| ------------- | ---- | ----- |
| relationship  | 同行关系 | 情侣/朋友 |
| people\_count | 同行人数 | 2     |

同行关系可选项：

| 展示文案  | 建议后端值                  |
| ----- | ---------------------- |
| 情侣/朋友 | couple\_or\_friends    |
| 独自    | solo                   |
| 亲子    | family\_with\_children |
| 长辈同行  | with\_elderly          |

同行人数可选项：

| 展示文案 | 建议后端值   |
| ---- | ------- |
| 1人   | 1       |
| 2人   | 2       |
| 3人   | 3       |
| 4人+  | 4\_plus |

示例 JSON：

```json
{
  "relationship": "情侣/朋友",
  "people_count": 2
}
```

### 2.3 预算与节奏

| 字段            | 含义   | 示例值 |
| ------------- | ---- | --- |
| budget\_level | 预算档位 | 舒适  |
| pace          | 旅行节奏 | 适中  |

预算档位可选项：

| 展示文案 | 建议后端值       | 规划含义                   |
| ---- | ----------- | ---------------------- |
| 经济   | budget      | 优先低成本景点、公共交通、平价餐厅      |
| 舒适   | comfortable | 兼顾体验和成本，可安排质量较好的本地餐厅   |
| 豪华   | luxury      | 可安排高品质餐厅、酒店体验、包车或高预算项目 |

旅行节奏可选项：

| 展示文案 | 建议后端值     | 规划含义                  |
| ---- | --------- | --------------------- |
| 轻松   | relaxed   | 每天景点少，停留时间长，减少赶路      |
| 适中   | moderate  | 每天 3-5 个核心停靠点，兼顾效率和体验 |
| 紧凑   | intensive | 每天更多停靠点，适合高效率打卡       |

示例 JSON：

```json
{
  "budget_level": "舒适",
  "pace": "适中"
}
```

### 2.4 起点与终点

| 字段              | 含义   | 示例值  |
| --------------- | ---- | ---- |
| start\_location | 行程起点 | 青岛站  |
| end\_location   | 行程终点 | 五四广场 |

示例 JSON：

```json
{
  "start_location": "青岛站",
  "end_location": "五四广场"
}
```

起点和终点是路线规划的硬约束。Agent 生成路线时，第一天必须从起点开始，最后一天应以终点或终点附近区域收尾。

### 2.5 兴趣、限制与备注

| 字段             | 含义           | 示例值                              |
| -------------- | ------------ | -------------------------------- |
| selected\_tags | 用户选择的兴趣或限制标签 | 老城建筑、本地海鲜、避开排队、摄影出片              |
| note           | 用户补充备注       | 喜欢老城建筑、海景、海鲜，不想排太久队，希望有本地人推荐的小店。 |

标签说明：

| 标签   | 类型 | 规划含义                 |
| ---- | -- | -------------------- |
| 老城建筑 | 兴趣 | 优先推荐历史街区、建筑群、城市文化路线  |
| 本地海鲜 | 兴趣 | 优先推荐本地海鲜餐厅或市场类体验     |
| 摄影出片 | 兴趣 | 优先推荐适合拍照的海景、街区、地标    |
| 避开排队 | 限制 | 降低高热度、高排队风险 POI 的优先级 |

备注示例：

```text
喜欢老城建筑、海景、海鲜，不想排太久队，希望有本地人推荐的小店。
```

备注解析结果示例：

```json
{
  "extra_interests": ["海景", "海鲜", "本地小店"],
  "extra_constraints": ["不想排太久队"],
  "special_requests": ["希望有本地人推荐的小店"]
}
```

***

## 3. 前端提交给 Agent 的标准输入 JSON

建议前端向后端提交如下统一结构：

```json
{
  "trip_time": {
    "departure_date": "2026/05/08",
    "duration_days": 2
  },
  "companions": {
    "relationship": "情侣/朋友",
    "people_count": 2
  },
  "budget_and_pace": {
    "budget_level": "舒适",
    "pace": "适中"
  },
  "route_points": {
    "start_location": "青岛站",
    "end_location": "五四广场"
  },
  "preferences": {
    "selected_tags": ["老城建筑", "本地海鲜", "避开排队", "摄影出片"],
    "note": "喜欢老城建筑、海景、海鲜，不想排太久队，希望有本地人推荐的小店。"
  }
}
```

Agent 应优先使用前端表单字段，再使用备注进行语义补充。不要完全依赖大模型从自然语言中猜测用户需求。

***

## 4. 技术选型

### 4.1 LangGraph

LangGraph 负责 Agent 的流程编排和状态管理。它适合处理多节点、多分支、可回退、可校验的 Agent 工作流。

| 能力        | 说明                   |
| --------- | -------------------- |
| 输入标准化     | 将前端 JSON 转成内部统一字段    |
| 备注解析流程控制  | 控制是否需要调用 LLM 解析备注    |
| 偏好融合      | 合并标签和备注语义            |
| 信息完整性检查   | 判断是否缺少城市、日期、起终点等必要字段 |
| POI 检索流程  | 调用景点、餐厅、活动检索节点       |
| 路线生成流程    | 控制路线生成、校验、修复         |
| JSON 校验流程 | 控制格式校验与自动修复          |
| 失败重试      | 对路线或 JSON 失败进行有限重试   |
| 最终输出      | 返回前端可渲染 JSON         |

### 4.2 LangChain

LangChain 负责每个节点内部的模型调用、工具调用、Prompt 管理、RAG 检索和结构化输出。

| 能力        | 说明                       |
| --------- | ------------------------ |
| LLM 调用    | 调用大模型解析备注、生成路线、修复 JSON   |
| Prompt 管理 | 管理备注解析、路线生成、路线修复等 Prompt |
| 工具封装      | 封装 POI 检索、餐厅检索、预算估算、交通估算 |
| RAG 检索    | 接入本地知识库或向量库              |
| 结构化输出     | 约束模型输出为固定 JSON           |
| 输出解析      | 解析模型返回内容并交给校验节点          |

### 4.3 二者关系

| 层级    | 对应组件           | 作用                  |
| ----- | -------------- | ------------------- |
| 流程控制层 | LangGraph      | 决定 Agent 每一步怎么走     |
| 节点能力层 | LangChain      | 提供 LLM、工具、RAG、结构化输出 |
| 模型能力层 | LLM            | 完成语义理解、路线生成、文本推理    |
| 数据工具层 | POI/地图/餐厅/预算工具 | 提供真实或模拟数据           |

完整关系：

```text
用户表单输入
↓
LangGraph 控制流程
↓
各个节点内部调用 LangChain
↓
LangChain 调用 LLM / 工具 / 数据库 / RAG
↓
返回节点结果
↓
LangGraph 决定下一步
↓
输出最终旅行规划 JSON
```

***

## 5. 总体架构

| 层级          | 作用                        |
| ----------- | ------------------------- |
| 前端输入层       | 采集用户出行条件                  |
| 后端接口层       | 接收前端 JSON 请求，并调用 Agent    |
| 输入标准化层      | 将表单字段转为统一结构               |
| Agent 流程编排层 | 使用 LangGraph 控制节点流转       |
| 能力调用层       | 使用 LangChain 调用模型、工具和 RAG |
| 数据与工具层      | 提供 POI、餐厅、交通、预算、排队风险数据    |
| 结果输出层       | 输出前端可渲染 JSON              |

推荐接口：

```text
POST /api/travel-agent/plan
```

***

## 6. Agent 核心流程

```text
START
↓
normalize_form_input_node
↓
parse_note_node
↓
merge_preferences_node
↓
check_required_fields_node
↓
是否缺失必要信息？
├── 是：ask_clarification_node → END
└── 否：retrieve_poi_node
        ↓
        rank_poi_node
        ↓
        plan_route_node
        ↓
        validate_plan_node
        ↓
        路线是否合理？
        ├── 否：revise_plan_node → validate_plan_node
        └── 是：format_json_node
                ↓
                validate_json_node
                ↓
                JSON 是否合格？
                ├── 否：repair_json_node → validate_json_node
                └── 是：final_answer_node → END
```

***

## 7. State 设计

LangGraph 通过 State 保存 Agent 执行过程中的全部中间状态。

```python
from typing import TypedDict, List, Dict, Any, Optional

class TravelAgentState(TypedDict):
    raw_form_input: Dict[str, Any]
    normalized_input: Dict[str, Any]
    user_note: str
    note_semantics: Dict[str, Any]
    travel_profile: Dict[str, Any]
    missing_info: List[str]
    poi_candidates: List[Dict[str, Any]]
    ranked_pois: List[Dict[str, Any]]
    draft_plan: Dict[str, Any]
    validation_report: Dict[str, Any]
    final_json: Dict[str, Any]
    json_error: Optional[str]
    retry_count: int
    final_answer: str
```

字段说明：

| 字段                 | 含义                 |
| ------------------ | ------------------ |
| raw\_form\_input   | 前端提交的原始 JSON       |
| normalized\_input  | 标准化后的表单字段          |
| user\_note         | 用户备注               |
| note\_semantics    | 从备注中解析出的偏好、限制和特殊要求 |
| travel\_profile    | 融合后的旅行需求画像         |
| missing\_info      | 缺失字段               |
| poi\_candidates    | 候选 POI             |
| ranked\_pois       | 排序后的 POI           |
| draft\_plan        | 初版路线               |
| validation\_report | 路线校验报告             |
| final\_json        | 最终 JSON            |
| json\_error        | JSON 校验错误          |
| retry\_count       | 重试次数               |
| final\_answer      | 最终返回内容             |

***

## 8. 内部旅行需求画像 travel\_profile

Agent 内部应将表单字段与备注解析结果合并成统一的 `travel_profile`。

```json
{
  "city": "青岛",
  "departure_date": "2026/05/08",
  "duration_days": 2,
  "start_location": "青岛站",
  "end_location": "五四广场",
  "relationship": "情侣/朋友",
  "people_count": 2,
  "budget_level": "舒适",
  "pace": "适中",
  "interests": ["老城建筑", "本地海鲜", "摄影出片", "海景", "本地小店"],
  "constraints": ["避开排队", "不想排太久队"],
  "special_requests": ["希望有本地人推荐的小店"],
  "raw_note": "喜欢老城建筑、海景、海鲜，不想排太久队，希望有本地人推荐的小店。"
}
```

当前前端如果没有单独的目的地城市字段，可以先从起点和终点推断城市。例如起点为“青岛站”，则推断 `city = 青岛`。如果无法推断城市，则进入追问节点。产品上更稳妥的方式是增加“目的地城市”字段。

***

## 9. 节点详细设计

### 9.1 normalize\_form\_input\_node

作用：将前端表单 JSON 转换为 Agent 内部统一字段。

输入：`raw_form_input`

输出：`normalized_input`、`user_note`

```python
def normalize_form_input_node(state):
    raw = state["raw_form_input"]

    normalized = {
        "departure_date": raw["trip_time"].get("departure_date"),
        "duration_days": raw["trip_time"].get("duration_days"),
        "relationship": raw["companions"].get("relationship"),
        "people_count": raw["companions"].get("people_count"),
        "budget_level": raw["budget_and_pace"].get("budget_level"),
        "pace": raw["budget_and_pace"].get("pace"),
        "start_location": raw["route_points"].get("start_location"),
        "end_location": raw["route_points"].get("end_location"),
        "selected_tags": raw["preferences"].get("selected_tags", [])
    }

    user_note = raw["preferences"].get("note", "")

    return {
        "normalized_input": normalized,
        "user_note": user_note
    }
```

### 9.2 parse\_note\_node

作用：解析用户备注中的补充偏好、限制条件和特殊要求。

输入：`user_note`

输出：`note_semantics`

```json
{
  "extra_interests": ["海景", "海鲜", "本地小店"],
  "extra_constraints": ["不想排太久队"],
  "special_requests": ["希望有本地人推荐的小店"]
}
```

Prompt 示例：

```text
你是一个旅行偏好解析助手。

请从用户备注中提取补充偏好、限制条件和特殊要求。

用户备注：
{user_note}

请输出 JSON，字段包括：
- extra_interests：用户额外喜欢的内容
- extra_constraints：用户希望避免或限制的内容
- special_requests：用户的特殊请求

要求：
1. 只能输出 JSON；
2. 不要添加解释；
3. 不要编造备注中没有的信息；
4. 如果没有对应内容，则输出空数组。
```

### 9.3 merge\_preferences\_node

作用：合并前端标签和备注解析结果，形成完整旅行需求画像。

| 来源                                 | 目标字段              |
| ---------------------------------- | ----------------- |
| selected\_tags 中的正向标签              | interests         |
| selected\_tags 中的限制标签              | constraints       |
| note\_semantics.extra\_interests   | interests         |
| note\_semantics.extra\_constraints | constraints       |
| note\_semantics.special\_requests  | special\_requests |

### 9.4 check\_required\_fields\_node

作用：检查必要字段是否完整。

| 字段              | 说明    |
| --------------- | ----- |
| city            | 目的地城市 |
| departure\_date | 出发日期  |
| duration\_days  | 游玩天数  |
| start\_location | 起点    |
| end\_location   | 终点    |
| relationship    | 同行关系  |
| people\_count   | 人数    |
| budget\_level   | 预算档位  |
| pace            | 旅行节奏  |

如果存在缺失字段，则进入 `ask_clarification_node`。

### 9.5 retrieve\_poi\_node

作用：根据 `travel_profile` 检索候选 POI、餐厅和活动。

MVP 阶段建议使用本地 JSON 数据。

| 文件                             | 作用     |
| ------------------------------ | ------ |
| data/pois\_qingdao.json        | 青岛景点数据 |
| data/restaurants\_qingdao.json | 青岛餐厅数据 |
| data/activities\_qingdao.json  | 活动数据   |
| data/transport\_rules.json     | 交通估算规则 |
| data/budget\_rules.json        | 预算估算规则 |
| data/queue\_risk\_rules.json   | 排队风险规则 |

候选 POI 数据结构示例：

```json
{
  "name": "八大关",
  "city": "青岛",
  "type": "景点",
  "area": "市南区",
  "tags": ["老城建筑", "拍照", "情侣", "历史建筑"],
  "suitable_for": ["情侣/朋友", "亲子", "独自"],
  "budget_level": ["经济", "舒适"],
  "suggested_stay_minutes": 90,
  "best_time": ["上午", "下午"],
  "queue_level": "中",
  "photo_score": 5,
  "local_score": 4,
  "latitude": 36.059,
  "longitude": 120.354
}
```

### 9.6 rank\_poi\_node

作用：根据用户需求对候选 POI 进行排序。

| 因素      | 含义                     |
| ------- | ---------------------- |
| 兴趣匹配度   | 是否匹配老城建筑、海景、本地海鲜、摄影出片等 |
| 同行关系适配度 | 是否适合情侣、朋友、亲子或长辈        |
| 预算档位适配度 | 是否符合经济、舒适或豪华           |
| 节奏适配度   | 是否适合轻松、适中或紧凑节奏         |
| 拍照出片程度  | 是否适合拍照                 |
| 本地特色程度  | 是否符合本地小店、本地体验          |
| 排队风险    | 是否存在高排队风险              |
| 顺路程度    | 是否符合起点到终点的路线方向         |

推荐评分公式：

```text
score = 兴趣匹配分 + 同行适配分 + 预算适配分 + 摄影出片分 + 本地特色分 - 排队风险惩罚 - 路线绕行惩罚
```

### 9.7 plan\_route\_node

作用：根据旅行需求画像和排序后的 POI 生成完整行程。

路线规划必须满足：

- 天数正确；
- 起点正确；
- 终点正确；
- 预算档位匹配；
- 节奏匹配；
- 同行关系匹配；
- 兴趣标签被体现；
- 限制条件被处理；
- 餐饮安排合理；
- 交通方式合理；
- 每天时间安排合理。

### 9.8 validate\_plan\_node

作用：校验路线是否合理。

| 校验项  | 说明                 |
| ---- | ------------------ |
| 天数   | 是否为用户选择的天数         |
| 起点   | 第一天是否从起点开始         |
| 终点   | 最后一天是否到达终点或终点附近    |
| 节奏   | 每日景点数量是否符合轻松/适中/紧凑 |
| 餐饮   | 是否安排午餐和晚餐          |
| 兴趣   | 是否体现主要兴趣           |
| 限制   | 是否处理避开排队等限制        |
| 路线   | 是否存在明显绕路或跨区折返      |
| 预算   | 是否符合预算档位           |
| 排队风险 | 是否避开高排队风险地点        |

### 9.9 revise\_plan\_node

作用：根据校验报告修正路线。

修正原则：

- 只修正不合理部分；
- 不改变用户核心输入；
- 保留已满足偏好的安排；
- 优先保证起点、终点、天数、节奏和预算；
- 最大重试次数建议为 2 次。

### 9.10 format\_json\_node

作用：将路线整理为前端需要的标准 JSON。

### 9.11 validate\_json\_node

作用：检查 `final_json` 是否符合前端 Schema。推荐使用 Pydantic 校验。

### 9.12 repair\_json\_node

作用：当 JSON 格式不符合要求时，调用 LLM 修复。

***

## 10. 条件分支设计

```python
def route_after_required_check(state):
    if state.get("missing_info"):
        return "ask_clarification"
    return "retrieve_poi"


def route_after_plan_validation(state):
    report = state.get("validation_report", {})
    retry_count = state.get("retry_count", 0)

    if report.get("is_valid", False):
        return "format_json"

    if retry_count >= 2:
        return "format_json"

    return "revise_plan"


def route_after_json_validation(state):
    json_error = state.get("json_error")
    retry_count = state.get("retry_count", 0)

    if json_error is None:
        return "final_answer"

    if retry_count >= 2:
        return "final_answer"

    return "repair_json"
```

***

## 11. 输出 JSON Schema

最终输出建议采用如下结构，便于前端渲染卡片、时间轴、地图路线和推荐说明。

```json
{
  "overview": {
    "title": "青岛 2 天游",
    "city": "青岛",
    "departure_date": "2026/05/08",
    "days": 2,
    "people": "情侣/朋友，2人",
    "budget_level": "舒适",
    "pace": "适中",
    "start_location": "青岛站",
    "end_location": "五四广场",
    "matched_preferences": ["老城建筑", "海景", "本地海鲜", "摄影出片", "本地小店"],
    "handled_constraints": ["避开排队"],
    "why_this_plan": [
      "路线围绕青岛老城与海岸线展开，减少跨区折返",
      "保留建筑、海景、海鲜和拍照需求",
      "避开高排队风险点，优先安排本地小店"
    ]
  },
  "days_plan": [
    {
      "day": 1,
      "theme": "老城建筑与海边初体验",
      "summary": "从青岛站出发，串联老城建筑、海岸地标和本地海鲜。",
      "stops": [
        {
          "time": "09:00",
          "poi": "青岛站",
          "type": "起点",
          "stay": "20分钟",
          "activity": "抵达青岛，整理行李，准备出发",
          "reason": "符合用户设定起点",
          "transport_to_next": "步行或打车前往老城区域",
          "estimated_cost": "￥0-20",
          "tips": ["建议提前寄存大件行李"]
        }
      ],
      "daily_budget_estimate": "舒适档"
    }
  ],
  "food_recommendations": [
    {
      "name": "本地海鲜小店",
      "type": "海鲜",
      "area": "老城/市南区",
      "reason": "符合本地海鲜和避开排队需求",
      "estimated_cost": "人均￥80-150"
    }
  ],
  "transport_summary": {
    "main_transport": "步行 + 打车",
    "notes": [
      "老城区适合步行拍照",
      "跨区域移动建议打车减少体力消耗"
    ]
  },
  "risk_notes": [
    "热门景点建议避开正午和节假日高峰",
    "海边拍照受天气影响较大"
  ],
  "modifiable_options": [
    "改成轻松节奏",
    "增加更多本地小店",
    "减少景点数量",
    "加入夜景路线"
  ]
}
```

***

## 12. 项目目录设计

```text
travel_agent/
├── app.py
├── requirements.txt
├── README.md
├── graph/
│   ├── state.py
│   ├── graph_builder.py
│   └── conditions.py
├── nodes/
│   ├── normalize_form_input.py
│   ├── parse_note.py
│   ├── merge_preferences.py
│   ├── check_required_fields.py
│   ├── ask_clarification.py
│   ├── retrieve_poi.py
│   ├── rank_poi.py
│   ├── plan_route.py
│   ├── validate_plan.py
│   ├── revise_plan.py
│   ├── format_json.py
│   ├── validate_json.py
│   ├── repair_json.py
│   └── final_answer.py
├── chains/
│   ├── note_parse_chain.py
│   ├── route_plan_chain.py
│   ├── plan_revise_chain.py
│   └── json_repair_chain.py
├── tools/
│   ├── poi_search_tool.py
│   ├── restaurant_tool.py
│   ├── budget_tool.py
│   ├── transport_tool.py
│   └── queue_risk_tool.py
├── schemas/
│   ├── frontend_input_schema.py
│   ├── travel_profile_schema.py
│   └── travel_plan_schema.py
├── data/
│   ├── pois_qingdao.json
│   ├── restaurants_qingdao.json
│   ├── activities_qingdao.json
│   ├── transport_rules.json
│   ├── budget_rules.json
│   └── queue_risk_rules.json
├── prompts/
│   ├── parse_note_prompt.md
│   ├── plan_route_prompt.md
│   ├── revise_plan_prompt.md
│   └── repair_json_prompt.md
└── tests/
    ├── test_normalize_form_input.py
    ├── test_parse_note.py
    ├── test_merge_preferences.py
    ├── test_retrieve_poi.py
    ├── test_rank_poi.py
    ├── test_validate_plan.py
    ├── test_json_schema.py
    └── test_full_graph.py
```

***

## 13. 后端接口设计

### 13.1 生成行程接口

```text
POST /api/travel-agent/plan
```

请求体使用第 3 节定义的标准输入 JSON。

响应体：

```json
{
  "success": true,
  "data": {
    "overview": {},
    "days_plan": [],
    "food_recommendations": [],
    "transport_summary": {},
    "risk_notes": [],
    "modifiable_options": []
  }
}
```

### 13.2 修改行程接口

```text
POST /api/travel-agent/revise
```

请求体：

```json
{
  "current_plan": {},
  "revision_instruction": "第二天轻松一点，多加一个海边拍照点"
}
```

该接口用于多轮修改。后续可以设计单独的 `revise_route_node`，只修改用户指定部分，不重新生成全部路线。

***

## 14. 数据工具设计

| 工具       | 作用                      |
| -------- | ----------------------- |
| POI 检索工具 | 根据城市、兴趣标签和预算档位检索候选景点    |
| 餐厅检索工具   | 根据本地海鲜、本地小店、预算、排队风险检索餐厅 |
| 交通估算工具   | 估算两个 POI 之间的交通方式、耗时和费用  |
| 预算估算工具   | 根据预算档位估算每日花费范围          |
| 排队风险工具   | 根据静态热度或实时数据估算排队风险       |

预算估算规则示例：

| 档位 | 人均每日范围      | 说明               |
| -- | ----------- | ---------------- |
| 经济 | 150-300 元/天 | 平价餐厅、公共交通、免费景点优先 |
| 舒适 | 300-600 元/天 | 体验和成本平衡，可安排较好餐厅  |
| 豪华 | 600 元以上/天   | 高品质餐厅、包车、特色体验优先  |

***

## 15. MVP 开发路线

### 第一阶段：表单输入最小闭环

目标流程：

```text
前端表单 JSON → 标准化输入 → 解析备注 → 融合偏好 → 本地 POI 检索 → 生成路线 → 输出 JSON
```

实现节点：

- normalize\_form\_input
- parse\_note
- merge\_preferences
- retrieve\_poi
- plan\_route
- final\_answer

### 第二阶段：增加校验能力

新增节点：

- check\_required\_fields
- validate\_plan
- format\_json
- validate\_json
- repair\_json

重点解决路线不顺、终点错误、节奏过满、预算不匹配、兴趣没有体现、JSON 不合格等问题。

### 第三阶段：增加 POI 排序和规则工具

新增能力：

- POI 标签匹配；
- 排队风险评分；
- 本地小店优先级；
- 摄影出片评分；
- 预算档位适配；
- 路线顺路评分。

### 第四阶段：接入真实 API

可接入地图 API、天气 API、景点开放时间 API、交通耗时 API、餐厅数据 API、热度或排队风险数据。

### 第五阶段：支持多轮修改

示例指令：

- 第二天轻松一点；
- 多加一个海边拍照点；
- 不要网红店，换成本地小店；
- 预算再降低一点；
- 最后必须 18 点前到五四广场。

***

## 16. 项目难点与解决策略

| 难点       | 问题                   | 解决策略                                      |
| -------- | -------------------- | ----------------------------------------- |
| 城市识别不稳定  | 前端未明确目的地城市           | 从起终点推断；无法推断则追问；建议前端增加城市字段                 |
| 模型编造 POI | LLM 可能生成不存在的景点或餐厅    | 只允许使用检索工具返回的候选 POI                        |
| 路线不顺     | 可能跨区折返、时间不合理         | POI 增加坐标与区域；排序节点加入顺路评分；校验节点检查路线           |
| 用户偏好冲突   | 表单与备注可能冲突            | 表单优先；严重冲突时进入追问                            |
| JSON 不稳定 | 可能输出解释、Markdown 或缺字段 | 使用结构化输出、Pydantic 校验、repair\_json\_node 修复 |
| 多轮修改丢上下文 | 用户说“第二天轻松点”时需要知道原路线  | 保存 current\_plan，并设计局部修改节点                |

***

##
