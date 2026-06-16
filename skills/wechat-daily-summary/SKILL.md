---
name: wechat-daily-summary
description: >
  每日定时抓取公众号（新智元、量子位）最新文章，生成AI读后卡并推送飞书群。
  当用户需要"每天自动推送公众号文章"、"公众号文章读后卡"、"定时抓取微信公众号"、"给飞书群推日报"时触发。
---

# 微信公众号每日读后卡推送

## 架构
```
WeWe RSS (localhost:4000) → SQLite DB → 抓取原文 → AI生成读后卡 → 飞书群(机器人身份)
                                        ↑
                                  OpenClaw Cron (每天11:30)
```

## 前置条件
- WeWe RSS 运行在 localhost:4000（默认代理: weread.111965.xyz）
- 微信读书已扫码登录
- 飞书群ID: `oc_3a814b3e15aecb94717f56c3492d5fc1`
- **必须用机器人身份(`message`工具)发消息，禁止用用户个人号**

## 数据源（双源保险，自动切换）

### 主源：WeWe RSS
- SQLite DB: `C:\Users\zhangjinyao01_dxm\Desktop\wewe-rss\apps\server\data\wewe-rss.db`
- 量子位 Feed ID: `MP_WXS_3236757533`
- 新智元 Feed ID: `MP_WXS_3271041950`
- **需微信读书Token有效，否则不可用**

### 备源：官网直抓（永不断线）
- 量子位官网: `https://www.qbitai.com/` — 直接HTTP请求可获取文章列表和正文
- AI工具集: `https://ai-bot.cn/daily-ai-news/` — 每日AI资讯聚合
- 百度搜索: 新智元文章搜索
- **不需要任何Token，永远可用**

### 切换逻辑
```
if WeWe RSS可用(账号status=1且Token活着):
    用WeWe RSS DB查文章（最全最快）
else:
    量子位 → qbitai.com官网直抓
    新智元 → AI工具集 + 百度搜索
    并DM通知用户：WeWe RSS Token失效，建议扫码续命
```

## 每日推送流程（Cron 11:30）

### Step 0: 自动修复账号状态（每次执行前必做）

WeWe RSS 的微信读书 Token 实际有效期为 10 年（到 2036 年），但微信读书接口偶尔会因 IP 变化、频率限制等返回 401，导致 WeWe RSS 将账号标记为 status=0（失效）。**实际上 Token 还有用，只需把 status 改回 1 即可。**

自动修复脚本：

```python
import sqlite3, json, base64, time
db_path = r'C:\Users\zhangjinyao01_dxm\Desktop\wewe-rss\apps\server\data\wewe-rss.db'
conn = sqlite3.connect(db_path)
accounts = conn.execute('SELECT id, token, status FROM accounts').fetchall()
for acc_id, token, status in accounts:
    # 解析 JWT 检查是否真的过期
    payload = token.split('.')[1]
    payload += '==' * (4 - len(payload) % 4)
    data = json.loads(base64.urlsafe_b64decode(payload))
    exp = data.get('exp', 0)
    is_token_valid = exp > time.time()
    if status == 0 and is_token_valid:
        conn.execute('UPDATE accounts SET status=1 WHERE id=?', (acc_id,))
        print(f'账号 {acc_id} Token未过期(到期:{time.strftime("%Y-%m-%d",time.localtime(exp))})，已恢复status=1')
    elif status == 0 and not is_token_valid:
        print(f'账号 {acc_id} Token已过期，需要重新扫码登录！')
conn.commit()
conn.close()
```

**执行逻辑：**
1. 读取 accounts 表，检查每个账号的 JWT exp 字段
2. 如果 Token 未过期但 status=0 → 自动改回 status=1
3. 如果 Token 真的过期了 → DM 通知用户扫码登录

### Step 1: 检查数据源 & 获取文章

**双源自动切换：**
1. 先尝试 WeWe RSS：修复账号status → 查DB当天文章
2. WeWe RSS 无文章时，切换到备源：
   - 量子位 → `https://www.qbitai.com/` 官网直抓（Python urllib，带UA）
   - 新智元 → `https://ai-bot.cn/daily-ai-news/` AI工具集
3. 如果用了备源，DM通知用户Token失效

**Python抓取脚本已就绪：** `C:\Users\zhangjinyao01_dxm\Desktop\dxm\article_fetcher.py`
可直接 `uv run python article_fetcher.py` 测试

关键函数：
- `check_wewe_alive()` → 检查WeWe RSS是否可用
- `fetch_qbitai_from_web(limit)` → 从量子位官网抓文章列表
- `fetch_xinzhiyuan_from_web(limit)` → 从百度/AI工具集抓新智元文章
- `fetch_article_content(url)` → 抓取文章正文
- `get_articles(limit)` → 主入口，自动选择源

### Step 3: 选文
量子位选1-2篇 + 新智元选1-2篇（共2-4篇，优先选最新+最有深度的）

### Step 4: 抓取原文
web_fetch或Python抓取原文全文（qbitai.com需带UA+Referer，否则403）

### Step 5: 生成读后卡
AI分析原文，按下方模板生成读后卡

### Step 6: 发送
**`message`工具以机器人身份发送到飞书群**，每篇一条消息

⚠️ 严禁使用 `feishu_im_user_message`（用户本人身份），必须用 `message`（龙虾 bot 身份）

## 读后卡模板（必须严格遵守）

```
[读后卡] 【yy.mm】核心主题｜一句话结论

# 来源
- 标题：
- URL：（文章链接）

# 原文关键信息
（对结构化内容做精简整理，不重复啰嗦）

# 这篇文章解决的问题
1.
2.

# 我的理解（重点）
- 本质：
- 启发：
- 注意点：

# 可复用结论
-
-

# 可转Prompt/Pattern点
- （写规则/约束/话术/可复用的小架构）
-

# 名词解释（5个）
-
-

# 标签
#xxx #xxx #xxx #xxx
```

### 标题规则
1. 格式：`[读后卡] 【yy.mm】核心主题｜一句话结论`
2. 核心主题：6-12字，名词结构
3. **不使用原文标题**
4. 可复用结论优先写在"｜"后面
5. 【xx.xx】为文章年月

### 标签规则
1. 必须从标签词表中选择（不在词表可创造新标签）
2. 总数3-5个，不加空格，不写句子

**标签词表：**

技术主题（选1）：Agent / Prompt / RAG / 小龙虾 / skills / 预训练 / 强化学习 / sft / 算力 / 评测方法 / 基座模型

类型（选1）：方法论 / 策略 / 案例 / 公司 / 观点 / 框架 / 总结 / 趋势 / 新产品介绍 / 新模型介绍

场景（选2-3）：技巧 / 技术 / ai应用 / 名人观点 / ai pm工作可用 / 高质量材料

### 强约束
- 必须基于原文，不得凭空扩展
- "我的理解"必须是抽象总结，不是复述
- 内容简洁、结构清晰、干货干练
- 每个模块必须填写
- 标题必须符合规则
- **每天每个公众号发1-2篇读后卡**

## 刷新文章
- WeWe RSS自动刷新：CRON=0 8 * * *（每天08:00）
- 手动触发: `POST http://localhost:4000/trpc/feed.refreshArticles` (Authorization: dxm2026)
- 新智元page=1可能返回空，需用fetch_xzy.py手动拉取(跳过空页，连续3空页停止)

## 扫码登录（仅当 Token 真的过期时）

Token 有效期到 2036 年，正常情况不需要重新扫码。只有当 JWT exp 字段已过期时才需要：
1. 运行 `uv run python gen_qr_html.py` 生成 qr_login.html
2. `Start-Process qr_login.html` 在浏览器打开
3. 用户微信扫码确认
4. 调用 `platform.getLoginResult` 获取token
5. 调用 `account.add` 写入数据库
6. DM 通知用户扫码完成

## 自动修复 vs 扫码登录 判断逻辑

| 情况 | 处理方式 |
|------|----------|
| Token未过期 + status=0 | 自动修复（改 status=1）|
| Token未过期 + status=1 | 正常使用 |
| Token已过期 + status=0 | DM通知用户扫码 |

## 依赖工具
- `message` — 以机器人身份发飞书群消息（禁止用feishu_im_user_message）
- `web_fetch` / `exec`(Python) — 抓取文章正文
- `cron` — 定时任务
- `read` — 读取skill文件
