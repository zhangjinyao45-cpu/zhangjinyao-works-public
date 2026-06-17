# 错误恢复与重做策略

## 故障场景全景

```
1. 中途中断
   ├─ 用户主动暂停（Ctrl+C / 关闭 Claude Code）
   ├─ 网络断开（API 调用失败）
   ├─ 上下文超长（context overflow）
   └─ Claude 异常崩溃

2. 调用失败
   ├─ aipm-data-rag 调用失败（爬虫被反爬 / API key 错）
   ├─ Pexels API 配额耗尽
   └─ 子角色 skill 加载失败

3. 数据不一致
   ├─ meta.json 损坏（手动改坏）
   ├─ 产物文件丢失（用户手动删了）
   └─ 决策引用失效（decision 文件被删）

4. 用户行为
   ├─ 改上游导致下游冲突
   ├─ 跳阶段（强行从阶段3 开始）
   └─ 想回退但下游已开始
```

## 中断恢复机制

### 持久化时机

每次状态变更都立即写 meta.json，做到"任何时候挂掉，下次都能从最近一步继续"：

```python
PERSIST_TRIGGERS = [
    "user_message_received",        # 用户每次输入
    "stage_status_changed",         # 阶段状态变更
    "review_phase_changed",         # 评审会时段变更（T0-T6）
    "decision_made",                # 用户拍板
    "artifact_written",             # 产物文件写入完成
    "needs_redo_propagated"         # 重做标记传播
]
```

### 恢复流程

```bash
/aipm-pipeline continue
```

```python
def resume_pipeline():
    meta = load_meta()
    state = meta['current_state']
    stage = meta['current_stage']
    
    # 显示进度
    print(f"项目「{meta['project_name']}」上次进度：")
    print(f"  当前阶段：{stage}")
    print(f"  当前状态：{state}")
    print(f"  最后更新：{meta['updated_at']}")
    
    # 根据状态决定恢复策略
    if state == 'in_progress':
        ask("阶段 {stage} 未完成。要 (a) 从头重跑这个阶段 (b) 从上次中断处继续？")
    elif state == 'review':
        ask("评审会未完成。要 (a) 重跑评审会 (b) 用现有发言直接到收敛环节？")
    elif state == 'waiting_user':
        # 直接显示决策点，等用户拍板
        show_decision_points()
    elif state == 'done':
        # 进入下一阶段
        next_stage = get_next_stage(stage)
        start_stage(next_stage)
```

## 子调用失败处理

### aipm-data-rag 失败

```python
try:
    data = await call_rag(query='大学生兼职 App 评论', sources=['app_store', 'zhihu'])
except RagError as e:
    # 优雅降级
    if e.reason == 'rate_limit':
        print("⚠️ App Store 限流，已切换到知乎单源数据")
        data = await call_rag(query=..., sources=['zhihu'])
    elif e.reason == 'all_sources_failed':
        print("❌ 所有数据源失败。建议：")
        print("  (a) 等待 30 分钟后重试")
        print("  (b) 用户手动提供观察样本")
        print("  (c) 跳过数据 RAG，让顾清基于先验知识做分析（标低置信度）")
        ask("选哪个？")
```

### Pexels 失败

```python
try:
    images = await pexels_search(query='moody coffee shop interior')
except PexelsError:
    # 回退到渐变背景
    print("⚠️ Pexels 不可用，本次使用 SVG 渐变占位图")
    print("⚠️ 关键视觉位（首页 Hero / 列表封面 / 详情头图）将用占位")
    log_data_gap("阶段4 缺少真实图片", impact='medium')
```

### 子角色 skill 加载失败

```python
try:
    su_yu = load_skill('aipm-su-yu')
except SkillLoadError:
    print("❌ 苏予 skill 加载失败。可能原因：")
    print("  - skill 文件损坏")
    print("  - Claude Code 版本不兼容")
    print("建议：检查 .claude/skills/aipm-su-yu/SKILL.md 是否存在")
    abort_pipeline(reason='skill_load_failed')
```

## 数据一致性校验

每次启动时跑一遍：

```python
def consistency_check():
    """启动时跑一遍，发现问题就提示"""
    issues = []
    
    # 1. meta.json 是否合法
    if not is_valid_meta(meta):
        issues.append("❌ meta.json 损坏")
    
    # 2. 产物文件是否齐全
    for stage, info in meta['stages'].items():
        if info['status'] == 'done':
            if not file_exists(info['artifact']):
                issues.append(f"⚠️ 阶段 {stage} 标记 done 但产物丢失")
    
    # 3. 决策文件是否齐全
    for decision_meta in meta['decision_history']:
        if not file_exists(f"decisions/{decision_meta['id']}.md"):
            issues.append(f"⚠️ 决策 {decision_meta['id']} 文件丢失")
    
    # 4. 评审会纪要是否齐全
    for stage, info in meta['stages'].items():
        if info['status'] in ['done', 'review_complete']:
            if not file_exists(info.get('review_minutes')):
                issues.append(f"⚠️ 阶段 {stage} 评审会纪要丢失")
    
    return issues
```

## 重做策略

### 单阶段重做

```bash
/aipm-pipeline redo stage:0.5
```

行为：
1. 备份当前产物为 `00.5-竞品分析报告.v1.md`
2. 重置阶段 0.5 状态为 pending
3. 调用顾清重新执行
4. 完成后产出 `00.5-竞品分析报告.md`（v2）
5. 标记下游为 needs_redo

### 部分重做

```bash
/aipm-pipeline redo --only stage:1,2
```

只重做指定阶段，跳过其他阶段。**警告：可能产生不一致**，需要用户明确知道在做什么。

### 全量重做

```bash
/aipm-pipeline redo --from stage:0.5
```

从 0.5 开始，下游全部重跑（保留阶段0 不动）。

## 强制操作 vs 安全操作

```bash
# 安全操作：会做一致性检查 + 提示用户
/aipm-pipeline goto stage:3

# 强制操作：跳过检查，用户自己负责
/aipm-pipeline goto stage:3 --force
```

强制操作会在 meta.json 中留痕：`{"force_skip": true, "at": "..."}`，方便后续追溯问题。

## 救命操作

### 还原到上一个稳定状态

```bash
/aipm-pipeline rollback
```

行为：
1. 读取 meta.json 中的 `last_stable_snapshot`
2. 还原所有产物到那个时间点的版本
3. 当前修改备份到 `intermediate/rollback-{时间}/`

### 重置项目

```bash
/aipm-pipeline reset --keep-stage-0
```

清除 0.5 之后的所有产物，回到刚做完阶段0 的状态。**有不可逆警告**。

### 完全删除

```bash
/aipm-pipeline delete [项目名]
```

二次确认 + 移到 `_archive/_deleted/`，30 天后自动清理（不直接 rm -rf，给后悔时间）。

## 日志记录

所有恢复/重做操作记录到 `meta.json` 的 `event_log`：

```json
{
  "event_log": [
    {
      "time": "2026-06-05T14:30:00",
      "event": "pipeline_started",
      "user": "default"
    },
    {
      "time": "2026-06-05T15:30:00",
      "event": "stage_done",
      "stage": "00"
    },
    {
      "time": "2026-06-06T09:00:00",
      "event": "resumed_after_break",
      "duration_paused": "17h"
    },
    {
      "time": "2026-06-06T10:00:00",
      "event": "redo_triggered",
      "stage": "00",
      "reason": "user_revised_target_user"
    }
  ]
}
```

这是后续 Demo 的素材：让评委看"这个产品的每个动作都有迹可循"。
