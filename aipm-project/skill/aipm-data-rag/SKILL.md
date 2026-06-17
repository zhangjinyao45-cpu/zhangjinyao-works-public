---
name: aipm-data-rag
description: 真实数据检索 - 顾清的"数据底盘"，从 App Store + Hacker News + Pexels 拿真实评论/讨论/图片，标注来源与置信度，不脑补
---

# AIPM 真实数据 RAG

## 角色定位

这是 **顾清（aipm-gu-qing）的"军火库"**——竞品分析阶段，顾清通过这个 skill 拿到真实评论原文、行业讨论、产品截图，而不是凭模型先验脑补。

**核心承诺：** 每条数据都标来源 + 时间戳 + 原始链接，做到"诚实协议"可视化。

## 数据源选型（精简版）

经过实测，选定 **2 个可靠免费渠道 + 1 个图片渠道**：

| 数据源 | 用途 | 接口 | 鉴权 | 实测状态 |
|--------|------|------|------|---------|
| **App Store**（中国/全球） | App 元数据（评分、评论数、截图） | iTunes Search API | ❌ 无需 Key | ✅ 稳定 |
| **Hacker News** | 技术圈对产品的真实讨论、长评 | Algolia 官方 API | ❌ 无需 Key | ✅ 稳定 |
| **Pexels** | 真实场景图片（阶段4 用） | 官方 API | ✅ 已有 Key | ✅ 稳定 |

**为什么砍掉以下数据源：**
- ❌ **App Store 评论 RSS**：2026-06 实测已失效（苹果关闭了公开 RSS 接口）
- ❌ **小红书**：反爬最严，无官方 API，违规风险高
- ❌ **知乎**：API 需鉴权，公开接口被封禁
- ❌ **Reddit**：在大陆网络访问不稳定（实测超时）

**降级原则：** 数据源失败时主动声明数据缺口，绝不用脑补结果替代。

## 接口设计

### 统一调用入口

```bash
# 顾清调用（阶段0.5 竞品分析）
/aipm-data-rag search --source [app_store|hn] --query "[关键词]" --limit 20

# (已废弃) 拉某个 App 的评论 — 2026-06 App Store RSS 已失效
# /aipm-data-rag app-reviews --country cn --app-id 414478124 --pages 3

# 苏予调用（阶段4 找图片）
/aipm-data-rag images --query "moody coffee shop interior" --orientation portrait
```

### 输出格式（统一）

每次返回结构化 JSON，落到 `data-snapshots/[阶段]-[源]-[查询].json`：

```json
{
  "query": "task manager",
  "source": "app_store_cn",
  "fetched_at": "2026-06-05T16:30:00Z",
  "total_results": 20,
  "items": [
    {
      "id": "r12345",
      "type": "review",
      "rating": 2,
      "title": "Great idea, terrible sync",
      "content": "I wanted to love this app but the sync between iOS and macOS is broken. Lost 3 days of tasks.",
      "author": "user_2891",
      "date": "2026-04-15",
      "source_url": "https://apps.apple.com/cn/app/things-3/id904237743",
      "source_app": "Things 3",
      "language": "en"
    }
  ],
  "data_gaps": [
    "未覆盖小红书数据（反爬限制）",
    "评论时间窗口仅近 90 天（RSS 限制）"
  ],
  "confidence_note": "样本 N=20，单源数据，置信度约 60%"
}
```

## App Store 接口详解

### 1. 搜索 App（找竞品）

```
GET https://itunes.apple.com/search
  ?term=任务管理
  &country=cn
  &entity=software
  &limit=10
```

**返回字段：** `trackName`(App 名)、`trackId`(用于拉评论)、`description`、`averageUserRating`、`userRatingCount`、`price`、`screenshotUrls`、`releaseNotes`

### 2. 拉真实评论（最有价值）

```
GET https://itunes.apple.com/{country}/rss/customerreviews/id={app_id}/sortBy=mostRecent/page={1-10}/json
```

**参数：**
- `country`: `cn` / `us` / `jp` 等
- `app_id`: 从搜索接口拿的 `trackId`
- `page`: 1-10（每页约 50 条评论）

**实测：** 微信 App ID 414478124，国区评论 RSS 可正常返回。

**注意：**
- 评论 RSS 只有最近约 500 条
- 需要解析 JSON 中的 `feed.entry` 数组
- 每条评论有 `title`, `content`, `rating`, `author`, `updated`

### 用法范例：竞品差评聚类

```python
# 顾清的典型工作流
def analyze_competitor_reviews(competitor_name, country='cn'):
    # 1. 搜索 App
    apps = search_apps(term=competitor_name, country=country, limit=5)
    target_app = apps[0]  # 取第一个匹配
    
    # 2. 拉所有评论（最多 10 页）
    all_reviews = []
    for page in range(1, 11):
        reviews = fetch_reviews(app_id=target_app.id, country=country, page=page)
        if not reviews:
            break
        all_reviews.extend(reviews)
    
    # 3. 筛选差评（1-2 星）
    bad_reviews = [r for r in all_reviews if r.rating <= 2]
    
    # 4. 顾清基于真实差评做聚类（不是脑补）
    return {
        'app': target_app,
        'total_reviews': len(all_reviews),
        'bad_reviews_sample': bad_reviews,
        'data_gap': '评论 RSS 仅含最近 500 条' if len(all_reviews) >= 500 else None
    }
```

## Hacker News 接口详解

### 搜索讨论（适合海外/技术圈竞品）

```
GET https://hn.algolia.com/api/v1/search
  ?query={关键词}
  &tags=story
  &hitsPerPage=20
```

**返回字段：** `title`, `url`(原帖链接), `points`(点赞), `num_comments`, `created_at`, `author`

**适用场景：**
- 找技术圈对某个产品/赛道的讨论
- 看真实用户(开发者)的吐槽和推荐
- 验证趋势（某个赛道是否在 HN 被讨论）

**典型查询：**
- `query=todo+app` 找待办类 App 的所有讨论
- `query=notion+alternative` 找 Notion 替代品讨论
- `query=ai+productivity&tags=story&numericFilters=points>=100` 高赞热帖

### 拉某个帖子的评论

```
GET https://hn.algolia.com/api/v1/items/{story_id}
```

返回完整评论树。HN 评论质量高，每条都是技术圈一线观察。

## Pexels 接口（已有，复用）

复用 `.claude/skills/designPM-ZJY/pexels-search.js`：

```bash
node pexels-search.js "moody coffee shop interior"
node pexels-search.js "editorial restaurant interior" --per-page 8 --orientation portrait --write pexels-results.json
```

**详细规范见 `aipm-zhou-ming/references/stages/stage-4-prototype.md` 的 Pexels 章节。**

## 实现脚本

为保证可重用、可调试，每个数据源单独写一个 Node.js 脚本（统一接口）：

```
.claude/skills/aipm-data-rag/
├── SKILL.md
├── scripts/
│   ├── app-store-search.js       # iTunes Search API
│   ├── app-store-reviews.js      # 评论 RSS 解析
│   └── hn-search.js              # HN Algolia API
└── references/
    ├── api-cookbook.md           # 各 API 调用范式
    ├── rate-limits.md            # 限流和缓存策略
    └── data-honesty.md           # 来源标注规范
```

详细实现见各 references。脚本会在 D4 实施时落地。

## 调用顺序（顾清的标准流程）

```
1. 搜索竞品 App（App Store Search API）
   ↓ 拿到 5-10 个直接竞品 + 评分 + 评论数
   
2. 拉每个竞品的真实评论（App Store Reviews RSS）
   ↓ 拿到 N 条带评分的真实用户评论原文
   
3. 搜索行业讨论（Hacker News API）
   ↓ 拿到技术圈对赛道的长评和趋势
   
4. 数据落地（data-snapshots/ 目录）
   ↓ JSON 文件，含原始数据 + 元信息
   
5. 顾清基于真实数据做聚类、统计、引用
   ↓ 报告中每条结论都标 [来源 + N 条样本 + 置信度]
```

## 诚实协议（强制）

任何调用 aipm-data-rag 的输出都必须遵守：

1. **来源必标** — 每条数据写明 `source_url` 和 `fetched_at`
2. **样本量必标** — 报告中写"基于 N=XXX 条样本"
3. **缺口必标** — `data_gaps` 字段必须诚实声明（哪些源没覆盖、为什么）
4. **置信度必标** — 单源数据不超过 70%，多源交叉才能 >80%
5. **不得伪造** — 所有引用的"用户原话"必须来自真实数据快照，能在 JSON 里找到对应 entry

## 限流与缓存

- iTunes API：未公开限流数，但实测高频调用会被 429。**策略：每次调用间隔 1 秒**
- App Store RSS：相同地区同 App 评论变化慢。**策略：缓存 6 小时**
- HN Algolia：宣称 10000 次/小时免费。**策略：相同 query 缓存 24 小时**
- Pexels：免费 200 次/小时。**策略：相同 query 缓存 7 天**

详见 `references/rate-limits.md`。

## 与其他 skill 的协作

```
aipm-gu-qing (顾清)
    ↓ 调用
aipm-data-rag
    ↓ 内部调度
[App Store API] [HN API] [Pexels API]
    ↓ 数据落地
data-snapshots/*.json
    ↓ 顾清读取并写入
00.5-竞品分析报告.md
```

## 详细执行手册

- `references/api-cookbook.md` — 三个 API 的完整调用示例 + 响应字段说明
- `references/rate-limits.md` — 限流策略 + 缓存策略 + 失败降级
- `references/data-honesty.md` — 数据使用的诚实协议（来源标注、置信度计算、数据缺口声明）

---

**关键原则：能拿真实数据就不用模型先验。拿不到就诚实声明缺口，绝不脑补。**
