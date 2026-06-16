# 身份信息更新策略（identity-update-policy）

> 本文件定义 self-learning 阶段 7 在更新 `self-identity/identity.md` 时的边界、字段分类、阈值与开关。
> 脚本 `scripts/update_identity.py` 与本文件一一对应：先改本文件，再同步脚本中的常量。

## 总开关

```yaml
enabled: true              # 关掉则阶段 7 直接跳过
mode: interactive          # interactive | auto
auto_apply_max_lines: 8    # auto 模式下，diff 行数上限；超过则降级为 interactive
recent_focus_keep: 5       # recent_focus 字段保留最近 N 条
preferred_tools_keep: 10   # preferred_tools 保留最近 M 条
require_changelog: true    # 写入必须附带 identity-changelog 记录
```

> 用户说"暂时不要动我的身份" → 把 `enabled` 改为 `false`，无需删脚本。

## 字段分类

### 软字段（白名单，可受控更新）

| 字段 | 含义 | 更新规则 |
|---|---|---|
| `recent_focus` | 最近主题/工作语境 | 追加去重，保留最近 `recent_focus_keep` 条 |
| `preferred_tools` | 高频工具/库/命令 | 累计去重，按使用频次排序 |
| `working_style_notes` | 用户偏好（语气、单位、时区等） | 同一键覆盖；不同键追加 |
| `last_updated` | 最近更新时间 | 每次写入时刷新 |

软字段必须放在 `identity.md` 中显式标记块内：

```markdown
<!-- soft-block:start -->
## 动态档案
- recent_focus:
  - ...
- preferred_tools:
  - ...
- working_style_notes:
  - ...
- last_updated: YYYY-MM-DD HH:MM
<!-- soft-block:end -->
```

如果 `identity.md` 中尚不存在该标记块，阶段 7 将**追加一个空块到文件末尾**，不修改任何已有内容。

### 核心字段（黑名单，永不自动更新）

以下字段在阶段 7 中**只读**：

- `name`、`role`、`mission`、`vision`
- `principles`、`values`、`safety_rules`
- 任何在 `self-identity/references/boundaries.md` 中被引用的字段
- 任何在标记块外的 Markdown 节点

如果阶段 7 检测到提案试图改动核心字段（无论是直接还是通过覆盖标记），**立即终止**并在 `lessons.md` 记录"核心字段越权写入已拦截"。

## 触发与门槛

阶段 7 仅在以下任一条件成立时才考虑写入：

1. **用户显式要求**：在本次会话或最近指令中明确说"更新身份/自我画像/把这次偏好记到身份"。
2. **稳定性门槛**：同一 `user_preferences` 条目在最近 3 次学习的 runs/ JSON 中均出现。
3. **稳定语境**：同一 `recent_focus` 词条在最近 3 次学习中均出现。

仅有"本轮一次性出现"的偏好不写入身份，避免噪声污染长期画像。

## 写入流程的不变量

- **字节级不变量**：阶段 7 前后，`identity.md` 中**软字段块以外**的字节序列必须完全相同（脚本以 SHA-256 校验）。
- **脱敏闸门**：每条提案值落盘前必须通过 `scripts/desensitize.py --check-only`。
- **变更日志**：每次写入必须在 `self-identity/references/identity-changelog.md` 追加一条记录：
  ```
  ### YYYY-MM-DD HH:MM · run=<run_id>
  - 字段：<field>
  - 修改前：<old>
  - 修改后：<new>
  - 触发条件：user_explicit / stable_preference / stable_context
  ```
- **原子写入**：先写 `identity.md.tmp` → 校验通过 → `os.replace` 原子替换；中间任何一步失败都保留原文件。

## 回滚

- 若用户事后说"撤销最近一次身份更新"：根据 `identity-changelog.md` 最新条目反向操作，软字段块回退到上一个状态，并在 changelog 追加 `### 回滚` 条目。
- 历史 changelog 永不删除，便于审计。

## 与其他阶段的关系

- 阶段 7 **不替代** capabilities.md 的写入。能力点仍然走阶段 5；阶段 7 只更新"我是谁/我现在在做什么/我偏好怎么做"这类档案性内容。
- 阶段 7 与阶段 4（边界校验）共享 `boundaries.md`：boundaries 命中的提案在阶段 4 已被丢弃，阶段 7 不会再次看到。

## 何时应当主动**不**改身份

- 单次会话产生的临时偏好（"今天先用 vim 试试"）。
- 仅在某一具体客户/项目下成立的偏好。
- 任何含敏感信息且脱敏后语义不再完整的条目。
- 用户语气不确定（"也许"、"看情况"）时的偏好声明。
