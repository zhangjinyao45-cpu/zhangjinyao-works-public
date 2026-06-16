# 敏感数据脱敏规则

> 本文件由 `self-learning` 在阶段 1.5（脱敏）和阶段 5（写入前复检）共同读取。
> 脚本 `scripts/desensitize.py` 应保持与本文件一致：先改本文件，再同步脚本中的正则常量。

## 设计原则

- **宁可误伤，不可漏伤**。这些数据一旦明文落盘就难以追回，多脱一次代价远小于泄漏一次。
- **占位符要类型化**：用 `<REDACTED:类别>`，方便后续审计和回溯，但**不保留任何原值片段**（包括尾号、前缀、哈希）。
- **不得保留可还原信息**。例如 "13812345678" 不应替换为 "138****5678"，而应替换为 `<REDACTED:PHONE>`。
- **白名单极小**：默认不允许部分保留；如确有审计需要部分保留，必须在本文件显式列出该类别并说明理由。

## 类别清单

| 代号 | 类别 | 触发说明 | 替换为 |
|---|---|---|---|
| `PHONE` | 手机号 | 中国大陆 11 位手机号 | `<REDACTED:PHONE>` |
| `ID_CARD` | 身份证号 | 18 位（含末位 X）或 15 位 | `<REDACTED:ID_CARD>` |
| `BANK_CARD` | 银行卡号 | 13–19 位连续数字（按 Luhn 校验或上下文关键字） | `<REDACTED:BANK_CARD>` |
| `EMAIL` | 邮箱 | 标准邮箱格式 | `<REDACTED:EMAIL>` |
| `IP` | 内网/公网 IP | IPv4 / IPv6 | `<REDACTED:IP>` |
| `URL_TOKEN` | 含密参的 URL | URL query 中含 `token=`、`access_token=`、`api_key=`、`sig=`、`signature=` | 保留 host+path，query 改为 `<REDACTED:QUERY>` |
| `TOKEN` | 通用密钥/令牌 | `sk-...`、`AKID...`、`AKIA...`、`ghp_...`、JWT（三段 base64 用 `.` 连接）、形如 `[A-Za-z0-9_\-]{32,}` 且上下文出现 `token/secret/key/password` | `<REDACTED:TOKEN>` |
| `PASSWORD` | 密码字段 | 行内出现 `password`/`passwd`/`pwd` 紧跟分隔符与值 | `<REDACTED:PASSWORD>` |
| `PRIVATE_KEY` | 私钥块 | `-----BEGIN ... PRIVATE KEY-----` 至 `-----END ... PRIVATE KEY-----` | `<REDACTED:PRIVATE_KEY>` |
| `NAME_ADDR` | 姓名+地址组合 | 中文姓名（2–4 汉字）后紧跟 "省/市/区/路/号" 等地址成分 | `<REDACTED:NAME_ADDR>` |
| `INTERNAL_ID` | 内部工单/客户号 | 形如 `TICKET-\d+`、`CUS\d{6,}`、`UID\d{8,}`，或上下文出现 "工单/客户号/UID" | `<REDACTED:INTERNAL_ID>` |
| `INTERNAL_HOST` | 内网域名/主机名 | `*.intra.*`、`*.corp.*`、`*.internal`、`*.local`，或私网 IP | `<REDACTED:INTERNAL_HOST>` |

## 推荐正则（与脚本同步）

> 这些正则是"够用即可"的基线，目的是保证默认即安全；脚本 `desensitize.py` 在此基础上做上下文关键字加权。

```text
PHONE         (?<!\d)1[3-9]\d{9}(?!\d)
ID_CARD       (?<!\d)(\d{17}[\dXx]|\d{15})(?!\d)
BANK_CARD     (?<!\d)\d{13,19}(?!\d)            # 命中后再做 Luhn 校验或关键字校验
EMAIL         [A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}
IPV4          (?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)
URL_TOKEN     https?://[^\s]+?[?&](?:token|access_token|api_key|sig|signature)=[^\s&#]+
TOKEN_SK      \bsk-[A-Za-z0-9]{20,}\b
TOKEN_AWS     \b(?:AKIA|ASIA)[0-9A-Z]{16}\b
TOKEN_GH      \bghp_[A-Za-z0-9]{30,}\b
JWT           \b[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b
PASSWORD_KV   (?i)\b(password|passwd|pwd)\s*[:=]\s*\S+
PRIVATE_KEY   -----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----
INTERNAL_ID   \b(?:TICKET|UID|CUS|EMP)[-_]?\d{4,}\b
```

## 落盘前的强制校验清单

在任何 `Write` 之前（无论是 raw/、runs/、capabilities.md、lessons.md），逐条核对：

- [ ] 文件不含上表任一正则的命中。
- [ ] 文件不含 `password`、`secret`、`token=`、`Authorization:` 等关键字行的明文取值。
- [ ] 来源 URL 的 query 已被 `<REDACTED:QUERY>` 替换。
- [ ] 没有把"工单 ID + 客户姓名 + 手机号"等组合保留下来用于"上下文还原"。
- [ ] 报告 JSON（`desensitize-report.json`）的 `samples` 字段为空数组（不留样本原值，仅留命中类别和位置区间）。

任一项不通过即停止写入，并在 `lessons.md` 追加一条记录。

## 例外与白名单

默认无白名单。**如确需新增白名单**，必须在本文件追加一节，包含：理由、生效范围、复核人、生效日期。例如：

```
### 白名单：公开 demo 邮箱
- 理由：用于产品 demo，已在公开文档披露
- 范围：仅 example@duxiaoman.com 一项
- 复核人：<姓名占位>
- 生效日期：YYYY-MM-DD
```

未在白名单显式登记的，一律按敏感处理。
