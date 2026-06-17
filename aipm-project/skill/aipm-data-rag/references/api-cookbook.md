# API 使用手册

## App Store（iTunes Search API + Reviews RSS）

### 1. App 搜索（找竞品）

**接口：** `https://itunes.apple.com/search`

**参数：**
- `term`: 搜索关键词（中文/英文）
- `country`: 地区代码（`cn` / `us` / `jp` / `de` 等）
- `entity`: 固定为 `software`（iOS App）
- `limit`: 结果数量，1-200

**请求示例：**
```bash
curl 'https://itunes.apple.com/search?term=任务管理&country=cn&entity=software&limit=10'
```

**响应字段（重点）：**
```json
{
  "resultCount": 10,
  "results": [
    {
      "trackId": 904237743,
      "trackName": "Things 3",
      "bundleId": "com.culturedcode.things3",
      "sellerName": "Cultured Code GmbH & Co. KG",
      "description": "...",
      "price": 68,
      "currency": "CNY",
      "averageUserRating": 4.5,
      "userRatingCount": 12345,
      "version": "3.20",
      "releaseDate": "...",
      "trackViewUrl": "https://apps.apple.com/cn/app/things-3/id904237743",
      "artworkUrl512": "...",
      "screenshotUrls": ["..."]
    }
  ]
}
```

**关键字段说明：**
- `trackId` — 用于后续拉评论的 App ID
- `averageUserRating` — 平均评分（0-5）
- `userRatingCount` — 累计评价数
- `averageUserRatingForCurrentVersion` — 当前版本评分（更能反映最新体验）

**调用脚本：**
```bash
node scripts/app-store-search.js "任务管理" --country cn --limit 10 --write 竞品搜索.json
```

---

### 2. App 评论（RSS Feed）

**接口：** `https://itunes.apple.com/{country}/rss/customerreviews/id={app_id}/sortBy=mostRecent/page={page}/json`

**参数：**
- `country`: 同搜索接口
- `app_id`: 从搜索接口拿到的 `trackId`
- `page`: 页码，1-10（每页约 50 条）

**请求示例：**
```bash
curl 'https://itunes.apple.com/cn/rss/customerreviews/id=904237743/sortBy=mostRecent/page=1/json'
```

**响应结构：**
```json
{
  "feed": {
    "entry": [
      {
        "id": { "label": "..." },
        "im:rating": { "label": "2" },
        "title": { "label": "Great idea, terrible sync" },
        "content": { "label": "I wanted to love this app but..." },
        "author": { "name": { "label": "user_2891" } },
        "im:version": { "label": "3.20" },
        "updated": { "label": "2026-05-15T10:23:00-07:00" },
        "im:voteSum": { "label": "15" },
        "im:voteCount": { "label": "20" }
      }
    ]
  }
}
```

**关键字段说明：**
- `im:rating` — 评分 1-5 星
- `title` + `content` — 评论标题和正文（用户原话，最有价值）
- `im:version` — 评论针对的版本
- `updated` — 评论时间
- `im:voteSum` / `im:voteCount` — 其他用户觉得有用的投票

**注意事项：**
- RSS 仅含最近约 500 条评论（10 页 × 50 条）
- 高频调用可能被 429，建议每页间隔 1 秒
- 第一条 entry 通常是 App 元信息，从第 2 条起是真实评论

**调用脚本：**
```bash
node scripts/app-store-reviews.js 904237743 --country cn --pages 5 --write Things评论.json
```

**典型工作流（顾清的竞品差评聚类）：**
```bash
# 1. 搜索竞品
node scripts/app-store-search.js "任务管理" --country cn --limit 5 --write 搜索结果.json

# 2. 拉每个竞品的评论（手动提取 trackId）
node scripts/app-store-reviews.js 904237743 --country cn --pages 5 --write Things评论.json
node scripts/app-store-reviews.js 1234567890 --country cn --pages 5 --write Todoist评论.json

# 3. 顾清读取 JSON，聚类差评（1-2 星），引用原文写报告
```

---

## Hacker News（Algolia 官方 API）

**接口：** `https://hn.algolia.com/api/v1/search`

**参数：**
- `query`: 搜索词
- `tags`: `story`（限制为帖子，不含评论）
- `hitsPerPage`: 结果数（默认 20，最大 1000）
- `numericFilters`: 过滤器，如 `points>=100`（高赞帖）

**请求示例：**
```bash
curl 'https://hn.algolia.com/api/v1/search?query=task+manager&tags=story&hitsPerPage=20'

# 高赞过滤
curl 'https://hn.algolia.com/api/v1/search?query=notion+alternative&tags=story&hitsPerPage=30&numericFilters=points>=100'
```

**响应字段（重点）：**
```json
{
  "nbHits": 1234,
  "hits": [
    {
      "objectID": "23304536",
      "title": "I wrote Task Manager and I just remembered something",
      "url": "https://old.reddit.com/r/techsupport/comments/...",
      "author": "notRobot",
      "points": 827,
      "num_comments": 102,
      "created_at": "2020-05-25T20:20:25Z",
      "_tags": ["story", "author_notRobot", "story_23304536"]
    }
  ]
}
```

**关键字段说明：**
- `title` — 帖子标题
- `url` — 外链（可能为 null，此时看 HN 讨论本身）
- `points` — HN 点赞数（越高越热门）
- `num_comments` — 评论数（技术圈长评质量高）
- `created_at` — 发帖时间
- `objectID` — 帖子 ID，可拼 `https://news.ycombinator.com/item?id={objectID}` 看讨论

**调用脚本：**
```bash
node scripts/hn-search.js "task manager" --limit 20 --write HN讨论-任务管理.json

# 只看高赞
node scripts/hn-search.js "notion alternative" --min-points 100 --limit 30 --write HN高赞-Notion替代.json
```

**适用场景：**
- 找海外/技术圈对某产品或赛道的真实讨论
- 看开发者/早期用户的深度吐槽和推荐
- 验证趋势（某赛道是否被技术圈关注）

**限制：**
- 宣称 10000 次/小时免费
- 搜索结果按相关性排序，不一定按时间
- 评论需要单独拉取（`https://hn.algolia.com/api/v1/items/{story_id}`）

---

## Pexels 图片（复用已有）

复用 `.claude/skills/designPM-ZJY/pexels-search.js`，详见：
- `aipm-zhou-ming/references/stages/stage-4-prototype.md` 的 Pexels 章节

**API Key（已有）：**
```
omwklTEJRj66M1cARVdU0vhXbZhTUldHDIZW6NWEVXVrMPzdQpbGe93C
```

**限额：** 200 次/小时免费

**调用示例：**
```bash
node ~/.claude/skills/designPM-ZJY/pexels-search.js "moody coffee shop interior" --per-page 8 --orientation portrait --write pexels-results.json
```

---

## 数据源对比

| 数据源 | 适用产品类型 | 数据类型 | 样本量 | 语言 | 时效性 |
|--------|------------|----------|--------|------|--------|
| App Store CN | 中国市场 App | 评分 + 评论原文 | 最近 500 条 | 中文为主 | 高（实时更新） |
| App Store US | 海外 App | 同上 | 同上 | 英文为主 | 高 |
| Hacker News | 技术/工具类产品 | 讨论帖 + 长评 | 上千条 | 英文 | 中（可回溯历史） |
| Pexels | 阶段4 原型图片 | 真实场景图 | 海量 | - | - |

**顾清的典型组合策略：**
- **中国市场产品**：App Store CN（主力）+ HN（海外对比）
- **海外产品**：App Store US + HN（主力）
- **技术工具**：HN（主力）+ App Store（辅助）
