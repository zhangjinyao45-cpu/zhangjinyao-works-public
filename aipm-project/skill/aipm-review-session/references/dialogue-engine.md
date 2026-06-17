# 对话引擎：评审会的状态机与执行流程

## 评审会状态机

```
[init] → [opening] → [main_speech] ⇄ [interrupt_check] ⇄ [interrupt_speech]
                                              ↓
                                        [next_speaker]
                                              ↓
                                  [free_discussion (optional)]
                                              ↓
                                          [closing]
                                              ↓
                                       [decision_points]
                                              ↓
                                            [done]
```

## 执行流程伪代码

```python
class ReviewSession:
    def __init__(self, stage, stage_output, project_context, user_persona='default'):
        self.stage = stage
        self.stage_output = stage_output
        self.context = project_context
        self.user_persona = user_persona
        
        # 5 个角色，按发言顺序
        self.host = 'zhou_ming'
        self.speakers = ['gu_qing', 'zhang_lei', 'su_yu', 'li_hang']
        
        # 状态
        self.transcript = []
        self.global_interrupt_budget = 3
        self.per_speaker_interrupt_count = {s: 0 for s in self.speakers}
        self.last_interrupter = None  # 防连续插话
    
    async def run(self):
        # T0: 开场
        await self.opening()
        
        # T1-T4: 主发言 + 插话循环
        for speaker_id in self.speakers:
            await self.main_speech(speaker_id)
            
            # 主发言后检查是否有人插话
            if self.global_interrupt_budget > 0:
                interrupter = await self.check_interrupts(
                    last_speaker=speaker_id,
                    last_speech=self.transcript[-1]
                )
                if interrupter:
                    await self.handle_interrupt(interrupter, speaker_id)
        
        # T5: （可选）自由讨论 — MVP 阶段先不做
        # await self.free_discussion()
        
        # T6: 周明收敛
        decision_points = await self.closing()
        
        # 输出
        await self.write_minutes()
        return decision_points
    
    async def opening(self):
        """T0：周明开场点名"""
        prompt = f"""
你是周明，AI 产品天团的 Lead PM。
当前阶段是 {self.stage}，刚刚产出 {self.stage_output}。
请按以下格式开场：
1. 用 1 句话总结本阶段产出
2. 点名顾清开始发言
3. 说明本次评审会的重点关注维度

要求：沉稳、克制、不超过 80 字。
"""
        speech = await invoke_persona(self.host, prompt)
        self.transcript.append({
            'time': 'T0',
            'speaker': self.host,
            'type': 'opening',
            'content': speech
        })
    
    async def main_speech(self, speaker_id):
        """T1-T4：主发言"""
        speaker_persona = load_persona(speaker_id)
        prompt = f"""
你是 {speaker_persona['name']}，{speaker_persona['role']}。
人设：{speaker_persona['traits']}
发言模板：{speaker_persona['speech_template']}

当前阶段：{self.stage}
评审对象：{self.stage_output}
之前的对话：
{format_transcript(self.transcript)}

请按你的角色风格做主发言。要求：
- 严格遵循发言模板
- 长度 200-400 字
- 体现人设的口头禅和风格
- 不要重复前面已经讲过的观点
"""
        speech = await invoke_persona(speaker_id, prompt)
        self.transcript.append({
            'time': f'T{self.speakers.index(speaker_id) + 1}',
            'speaker': speaker_id,
            'type': 'main_speech',
            'content': speech
        })
    
    async def check_interrupts(self, last_speaker, last_speech):
        """并行让其他 4 个角色判断是否要插话"""
        others = [s for s in self.speakers if s != last_speaker]
        
        # 排除：①已用完插话额度的角色 ②上一个插话者（防连续）
        eligible = [
            s for s in others 
            if self.per_speaker_interrupt_count[s] < 2 
            and s != self.last_interrupter
        ]
        
        if not eligible:
            return None
        
        # 并行评估
        votes = await parallel_vote(eligible, last_speech, self.transcript)
        
        # 取最强烈的，必须 ≥ 7/10
        strongest = max(votes, key=lambda v: v['urgency_score'])
        if strongest['urgency_score'] >= 7:
            return strongest['speaker']
        return None
    
    async def handle_interrupt(self, interrupter, original_speaker):
        """处理一次插话"""
        # 1. 插话者发言（短，1-3 句）
        interrupt_speech = await self.invoke_interrupt(interrupter, original_speaker)
        self.transcript.append({
            'speaker': interrupter,
            'type': 'interrupt',
            'content': interrupt_speech,
            'interrupted': original_speaker
        })
        
        # 2. 原发言者可选择回应（50% 概率，由 LLM 判断是否需要回应）
        should_respond = await judge_should_respond(original_speaker, interrupt_speech)
        if should_respond:
            response = await self.invoke_response(original_speaker, interrupt_speech)
            self.transcript.append({
                'speaker': original_speaker,
                'type': 'response_to_interrupt',
                'content': response
            })
        
        # 3. 更新预算
        self.global_interrupt_budget -= 1
        self.per_speaker_interrupt_count[interrupter] += 1
        self.last_interrupter = interrupter
    
    async def closing(self):
        """T6：周明收敛"""
        prompt = f"""
你是周明，刚刚主持完一场评审会。
完整对话记录：
{format_transcript(self.transcript)}

请按以下结构收敛：

1. ✅ 共识：列出大家都认同的 2-4 点
2. ❓ 分歧：列出有争议的点
3. ⚠️ 风险：列出李航/顾清提出的风险
4. 决策点：将分歧抽象为 2-4 个清晰的二选一/多选一

每个决策点格式：
**决策点N：[问题]**
- 选项A：[描述 + 优劣]
- 选项B：[描述 + 优劣]
- 建议：[只在明显最优时给]

最后一句必须是："你选？"
"""
        summary = await invoke_persona(self.host, prompt)
        self.transcript.append({
            'time': 'T6',
            'speaker': self.host,
            'type': 'closing',
            'content': summary
        })
        
        return parse_decision_points(summary)
    
    async def write_minutes(self):
        """输出评审会纪要"""
        minutes = render_minutes_template(self.transcript, self.stage)
        await write_file(f'{self.stage}-评审会纪要.md', minutes)
```

## 在 Claude Code 中的实际实现路径

D2-D5 阶段不会真去搭后端，而是在 Claude 内部模拟这个流程：

```
1. 用 TaskCreate 创建 6 个任务（T0-T6），跟踪评审会进度
2. 主发言：调用 Agent 工具，传入对应角色的 SKILL.md 作为 prompt 内容
3. 插话判断：一次响应里并行调用 4 个 Agent，每个轻量判断（用 Haiku）
4. 周明收敛：调用 Agent，传入完整 transcript
5. 用 Write 输出评审会纪要
```

## Token 成本估算（单场评审会）

| 环节 | 模型 | 调用次数 | 估算 token | 成本（USD） |
|------|------|---------|-----------|------------|
| 周明开场 | Sonnet | 1 | 1k input + 0.3k output | $0.008 |
| 4 人主发言 | Sonnet | 4 | 8k input + 4k output | $0.084 |
| 插话判断 | Haiku | 4-12 | 0.5k each | $0.005 |
| 实际插话（0-3 次） | Sonnet | 0-3 | 0-6k tokens | $0-$0.04 |
| 周明收敛 | Sonnet | 1 | 4k input + 1.5k output | $0.034 |
| **合计** | | | **15k-22k tokens** | **$0.13-$0.17** |

**6 阶段全跑评审会：约 $0.8-$1.0 / 项目**，token 管够，成本完全可承受。

## 性能优化点

1. **插话判断用 Haiku**：节省 80% 成本
2. **并行插话判断**：4 个并行而不是顺序
3. **transcript 压缩**：超过 5k tokens 时压缩前 3 轮发言
4. **缓存角色 prompt**：5 个角色的 SKILL 复用 prompt cache
