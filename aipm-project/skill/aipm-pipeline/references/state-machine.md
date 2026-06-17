# 阶段状态机

## 状态定义

每个阶段有 6 种状态：

| 状态 | 含义 | 触发动作 |
|------|------|---------|
| `pending` | 待执行（前置阶段未完成） | - |
| `in_progress` | 主导角色正在执行中 | 周明/顾清/苏予 主导发言中 |
| `review` | 评审会进行中 | 调用 aipm-review-session |
| `waiting_user` | 等用户拍板决策点 | 评审会已收敛，等用户输入 |
| `done` | 用户已拍板，本阶段完成 | 写入 meta.json，进入下一阶段 |
| `needs_redo` | 上游变更导致需要重做 | 标红，等用户决定何时重做 |

## 状态转移图

```
                    ┌──── pending
                    │
                    ↓ (前置完成 或 用户启动)
                in_progress
                    │
                    ↓ (主导角色产出文档)
                  review
                    │
                    ↓ (评审会收敛)
                waiting_user
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
       done    （重写本阶段）  needs_redo
        │           │           │
        │           ↓           │
        │       in_progress     │
        │                       │
        ↓                       ↓
   下个阶段 in_progress    （等用户决定何时重做）
```

## 全局状态字段

`meta.json` 中的全局状态：

```json
{
  "global_state": "running" | "paused" | "completed" | "blocked",
  "current_stage": "00.5",
  "current_state": "waiting_user",
  "blocked_reason": null
}
```

## 进入新阶段的前置条件

```python
def can_enter_stage(target_stage):
    """检查能否进入目标阶段"""
    
    # 阶段0 永远可以进入（起点）
    if target_stage == "00":
        return True
    
    # 其他阶段：所有前置阶段必须 done
    prev_stages = get_prev_stages(target_stage)
    for prev in prev_stages:
        if meta['stages'][prev]['status'] != 'done':
            return False
    
    return True
```

## needs_redo 传播逻辑（核心机制）

当用户改了某阶段的产物（用 `/aipm-pipeline revise`），下游所有阶段自动标 needs_redo：

```python
def mark_downstream_needs_redo(changed_stage):
    """
    某阶段被修改后，下游全部标 needs_redo
    """
    DOWNSTREAM_MAP = {
        "00": ["00.5", "01", "02", "03", "04"],
        "00.5": ["01", "02", "03", "04"],
        "01": ["02", "03", "04"],
        "02": ["03", "04"],
        "03": ["04"],
        "04": []
    }
    
    for stage in DOWNSTREAM_MAP[changed_stage]:
        if meta['stages'][stage]['status'] in ['done', 'pending']:
            meta['stages'][stage]['status'] = 'needs_redo'
            meta['stages'][stage]['needs_redo_reason'] = f"上游 {changed_stage} 已修改"
            meta['stages'][stage]['needs_redo_at'] = now()
    
    save_meta()
```

## 部分重做 vs 全量重做

用户改阶段0 后，可能希望保留下游某些产物：

```bash
# 全量重做：阶段0.5 / 1 / 2 / 3 / 4 全部重跑
/aipm-pipeline redo --from stage:0.5

# 部分重做：只重跑阶段1 和 阶段2，保留 03/04
/aipm-pipeline redo --only stage:1,2

# 跳过重做：用户明确说"我知道有冲突但暂时不改"
/aipm-pipeline acknowledge-stale
```

## 冲突检测

每次进入下一阶段前，检测：

```python
def check_consistency():
    """检测阶段间一致性"""
    issues = []
    
    # 1. 是否有 needs_redo 的上游
    for stage in STAGES_BEFORE(current_stage):
        if meta['stages'][stage]['status'] == 'needs_redo':
            issues.append(f"⚠️ 上游 {stage} 标记为需要重做")
    
    # 2. 阶段产物是否真的存在
    for stage in DONE_STAGES():
        artifact_path = get_artifact_path(stage)
        if not file_exists(artifact_path):
            issues.append(f"❌ 阶段 {stage} 标记 done 但产物不存在")
    
    # 3. 决策点是否被引用
    for decision in unreferenced_decisions():
        issues.append(f"⚠️ 决策 {decision.id} 未在下游产物中体现")
    
    return issues
```

## 状态转移钩子

每次状态变更，触发钩子：

```python
ON_STAGE_DONE = [
    save_meta,                      # 持久化
    write_review_minutes,           # 写评审会纪要
    backup_data_snapshot,           # 备份真实数据快照
    notify_pipeline_progress        # 通知主控
]

ON_NEEDS_REDO = [
    save_meta,
    show_redo_warning_to_user,      # 提示用户
    log_redo_reason                 # 记录 needs_redo 原因
]

ON_ENTER_REVIEW = [
    save_meta,
    log_review_start
]
```

## 卡住状态（blocked）

某些场景会让流水线卡住：

```python
BLOCKING_REASONS = {
    "missing_data_source": "顾清需要的数据源不可用（如小红书反爬）",
    "user_indecision": "用户超过 7 天没拍板决策点",
    "tech_dependency": "李航识别的技术依赖不可解（如缺少 API Key）",
    "consistency_violation": "阶段间一致性检查失败"
}
```

进入 blocked 状态时，meta.json 记录原因，CLI 显示醒目提示。
