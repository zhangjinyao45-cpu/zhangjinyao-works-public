# 限流与缓存策略

## 限流规则

### App Store（iTunes API + RSS）

**官方文档未明确限流数**，但实测：
- 高频调用（>10 次/秒）会被 429 (Too Many Requests)
- 评论 RSS 限流比搜索接口更严格

**策略：**
- 搜索接口：每次调用间隔 ≥ 500ms
- 评论 RSS：每次调用间隔 ≥ 1000ms（脚本已内置）
- 被 429 后：指数退避（1s → 2s → 4s → 8s），最多重试 3 次

**实现（伪代码）：**
```javascript
let lastCall = 0;
async function rateLimitedFetch(url, minInterval = 1000) {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < minInterval) {
    await sleep(minInterval - elapsed);
  }
  lastCall = Date.now();
  return fetch(url);
}
```

---

### Hacker News（Algolia API）

**官方限额：** 10000 次/小时（约 2.7 次/秒）

**策略：**
- 搜索请求：无需节流（远低于限额）
- 被限流后：429 返回带 `Retry-After` header，遵守该值

**实现：**
```javascript
async function hnSearch(query) {
  const res = await fetch(`https://hn.algolia.com/api/v1/search?query=${query}`);
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
    throw new RateLimitError(`HN 限流，${retryAfter} 秒后重试`);
  }
  return res.json();
}
```

---

### Pexels

**官方限额：** 200 次/小时（约 0.055 次/秒）

**策略：**
- 原型生成阶段集中调用（一次跑 10-20 张图）
- 搜索前先查缓存
- 限额耗尽时降级到渐变背景（见 aipm-zhou-ming stage-4 手册）

---

## 缓存策略

### 缓存目录结构

```
.claude/cache/
└── aipm-data-rag/
    ├── app-store-search/
    │   ├── {country}-{term}-{limit}.json
    │   └── {country}-{term}-{limit}.meta.json (含 cached_at)
    ├── app-store-reviews/
    │   └── {country}-{app_id}-p{pages}.json
    ├── hn-search/
    │   └── {query}-{limit}.json
    └── pexels/
        └── {query}-{orientation}-{per_page}.json
```

### 缓存有效期

| 数据源 | 缓存时长 | 理由 |
|--------|---------|------|
| App Store 搜索 | 24 小时 | App 排序变化慢 |
| App Store 评论 | 6 小时 | 新评论增量小 |
| HN 搜索 | 24 小时 | 历史讨论不变 |
| Pexels 图片 | 7 天 | 搜索结果稳定 |

### 缓存命中判断

```python
def should_use_cache(cache_file):
    if not cache_file.exists():
        return False
    
    meta = load_cache_meta(cache_file)
    age = now() - meta['cached_at']
    ttl = CACHE_TTL[meta['source']]
    
    return age < ttl
```

### 缓存穿透保护

同一 query 1 分钟内只调用 1 次，即使缓存过期：

```python
INFLIGHT_REQUESTS = {}  # {query_key: Promise}

async def fetch_with_dedup(query_key, fetch_fn):
    if query_key in INFLIGHT_REQUESTS:
        # 等待已有请求完成
        return await INFLIGHT_REQUESTS[query_key]
    
    promise = fetch_fn()
    INFLIGHT_REQUESTS[query_key] = promise
    
    try:
        result = await promise
        return result
    finally:
        del INFLIGHT_REQUESTS[query_key]
```

---

## 失败降级策略

### App Store 失败

```
App Store 搜索失败
  ↓
降级1：换地区（cn → us）
  ↓
降级2：手动指定竞品 App ID
  ↓
降级3：顾清基于先验知识列竞品（标低置信度 30%）
```

### App Store 评论失败

```
评论 RSS 失败（429 / 空）
  ↓
降级1：降低页数（10 → 3）
  ↓
降级2：切换排序（mostRecent → mostHelpful）
  ↓
降级3：声明数据缺口，不做评论聚类（只基于评分）
```

### HN 失败

```
HN API 失败
  ↓
降级1：等待 Retry-After
  ↓
降级2：跳过 HN 数据源，只用 App Store
  ↓
数据缺口标注："未覆盖技术圈讨论（HN 不可用）"
```

### Pexels 失败

```
Pexels API 失败
  ↓
降级1：使用缓存的旧结果
  ↓
降级2：使用渐变背景占位
  ↓
数据缺口标注："原型图片为占位图（Pexels 不可用）"
```

---

## 监控与告警

每次调用记录到 `meta.json` 的 `data_fetch_log`：

```json
{
  "data_fetch_log": [
    {
      "time": "2026-06-05T16:30:00Z",
      "source": "app_store_cn",
      "query": "任务管理",
      "status": "success",
      "items": 10,
      "latency_ms": 234
    },
    {
      "time": "2026-06-05T16:35:00Z",
      "source": "app_store_reviews",
      "app_id": "904237743",
      "status": "rate_limited",
      "retry_after": 60
    }
  ]
}
```

**告警规则：**
- 连续 3 次失败 → 提示用户"数据源不可用"
- 降级次数 > 5 → 提示用户"本次分析质量受限"
