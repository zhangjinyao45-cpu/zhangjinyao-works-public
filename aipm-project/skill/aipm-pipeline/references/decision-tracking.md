# 决策点追溯机制

## 为什么要做决策追溯

PM 工作的核心痛点之一：**3 个月后没人记得这个功能为什么这么做**。

aipm-pipeline 把每个用户拍板的决策都结构化记录，做到：
- 任何一个产品决策都能追溯到"哪个阶段、哪些角色支持/反对、用户最终选了什么、为什么选"
- 后续上游变更时，能快速识别"这个改动会影响哪些已经做过的决策"
- 比赛 Demo 时，"决策可追溯性"是核心差异化（Lovable 没有这个）

## decision 文件结构

每个决策一个文件 `decisions/decision-{NNN}.md`，编号全局递增：

```markdown
# decision-001: 首页第一屏放什么？

## 元数据
- **阶段：** 阶段0 头脑风暴
- **决策时间：** 2026-06-05 14:55:00
- **来源评审会：** 00-评审会纪要.md
- **影响下游：** 01, 02, 03, 04

## 背景
[1-2 段说明这个决策点是怎么来的：哪些角色提出、为什么有分歧]

## 选项
### A. 信任证据
- 描述：首屏 Hero 放"已结算订单数 + 企业评分 + 投诉率"
- 优势：解决核心痛点（顾清数据支撑），张磊作为用户说"会信"
- 劣势：商业转化可能比传统列表低 20-30%
- 工时：3 天（李航估）

### B. 今日热门 + 信任标识
- 描述：首屏放热门兼职列表 + 小信任图标
- 优势：符合用户习惯，转化率有保证
- 劣势：差异化不明显，重蹈竞品覆辙
- 工时：2 天（李航估）

## 评审会立场
| 角色 | 立场 | 理由 |
|------|------|------|
| 顾清 | 倾向 A | 引用 832 条评论，38% 差评在"信任" |
| 张磊 | 倾向 A | "我会信，至少能让我留 30 秒" |
| 苏予 | 强烈 A | "差异化必须前置，不前置就是同质化" |
| 李航 | 中立 | "两个方案技术成本相近" |
| 周明 | 不发表立场 | 主持收敛 |

## 用户决策
**选择：A. 信任证据**

## 用户决策依据
> 我同意大家的判断。这个赛道核心问题就是信任，
> 商业转化可以后期再优化。

（来自用户对话原文）

## 影响下游
- **阶段1（提示增强）**：提示词需突出"信任前置"，不能写成"功能丰富"
- **阶段2（PRD）**：信任体系列为 P0，"已结算订单数"为必做指标
- **阶段3（线框图）**：首屏 Hero 区设计为信任数据展示
- **阶段4（原型）**：HTML 原型首页第一屏必须呈现信任数据

## 反向追溯（自动维护）
> 当下游产物中出现"信任体系"相关内容时，要标注 `[依据 decision-001]`
```

## meta.json 中的索引

```json
{
  "decision_history": [
    {
      "id": "decision-001",
      "stage": "00",
      "title": "首页第一屏放什么？",
      "user_choice": "A",
      "made_at": "2026-06-05T14:55:00",
      "affects_stages": ["01", "02", "03", "04"]
    },
    {
      "id": "decision-002",
      "stage": "00",
      "title": "MVP 是否包含资金托管",
      "user_choice": "B",
      "made_at": "2026-06-05T15:00:00",
      "affects_stages": ["02", "03", "04"]
    }
  ]
}
```

## 反向追溯：在产物中标记决策依据

下游产物的关键内容旁，自动加追溯标记：

**示例（阶段2 PRD 中）：**
```markdown
## 三、功能清单

### P0 功能
- **信任体系（轻量版）** [依据 decision-001]
  - 展示已结算订单数
  - 展示企业评分
  - 展示用户投诉率

### 不做的功能
- ~~资金托管~~ [依据 decision-002，MVP 阶段不做]
```

## 决策冲突检测

用户改某个决策后，自动检测下游冲突：

```python
def check_decision_conflicts(changed_decision_id):
    """
    某决策被修改后，检查下游产物是否有冲突
    """
    decision = load_decision(changed_decision_id)
    affected_stages = decision['affects_stages']
    
    conflicts = []
    for stage in affected_stages:
        artifact = load_stage_artifact(stage)
        # 找到所有 [依据 decision-XXX] 标记
        references = extract_decision_refs(artifact)
        for ref in references:
            if ref == changed_decision_id:
                conflicts.append({
                    'stage': stage,
                    'location': ref.location,
                    'old_choice': decision.previous_choice,
                    'new_choice': decision.current_choice
                })
    
    return conflicts
```

## 决策修改的提示

```bash
/aipm-pipeline modify-decision decision-001 --new-choice B

# 系统响应：
> 决策 decision-001 即将修改：
>   原选择：A. 信任证据
>   新选择：B. 今日热门 + 信任标识
>
> 这会影响以下产物：
>   ⚠️ 01-增强提示词.md（需要更新"信任前置"相关描述）
>   ⚠️ 02-产品需求文档.md（信任体系优先级要调整）
>   ⚠️ 03-线框图与交互规范.md（首屏布局重做）
>   ⚠️ 04-UI交互原型.html（首页 HTML 重做）
>
> 确认修改？[Y/N]
> 
> [Y] → 修改 decision-001 + 标记下游 needs_redo
> [N] → 取消
```

## 全局决策报告（导出时附带）

```bash
/aipm-pipeline export 大学生兼职App
```

导出包中会有 `完整决策追溯.md`，按时间顺序列出所有决策：

```markdown
# 大学生兼职App - 完整决策追溯

> 共 12 个决策点，跨越 6 个阶段
> 时间范围：2026-06-05 至 2026-06-08

## 决策时间线

### 阶段0 头脑风暴（4 个决策）
- [decision-001](./decisions/decision-001.md) 首页第一屏放什么？→ A. 信任证据
- [decision-002](./decisions/decision-002.md) MVP 是否含资金托管？→ B. 不含
- ...

### 阶段0.5 竞品分析（2 个决策）
- ...

[全部展开]
```

这份报告是**Demo 时的杀手级展示**——评委一看："哦，这个产品的每个决策都有出处。"
