/**
 * 插话决策引擎
 * 并行评估多个角色的插话意愿，选出最强烈的
 */

export class InterruptEngine {
  constructor(claudeClient) {
    this.claude = claudeClient;
    this.threshold = 7; // 插话阈值（0-10）
  }

  /**
   * 检查是否有人插话
   * @param {Array<string>} eligibleSpeakers - 有资格插话的角色 ID
   * @param {object} lastSpeech - 上一次发言
   * @param {Array} transcript - 完整对话记录
   * @returns {Promise<string|null>} - 插话者 ID 或 null
   */
  async checkInterrupts(eligibleSpeakers, lastSpeech, transcript) {
    if (eligibleSpeakers.length === 0) {
      return null;
    }

    // 并行评估（用 Haiku 节省成本）
    const votes = await Promise.all(
      eligibleSpeakers.map(speaker => this._evaluateInterruptUrgency(speaker, lastSpeech, transcript))
    );

    // 取最强烈的，必须 ≥ 阈值
    const strongest = votes.reduce((max, v) => (v.score > max.score ? v : max), votes[0]);

    if (strongest.score >= this.threshold) {
      return strongest.speaker;
    }

    return null;
  }

  /**
   * 评估某个角色的插话紧迫度
   * @returns {Promise<{speaker, score, reason}>}
   */
  async _evaluateInterruptUrgency(speaker, lastSpeech, transcript) {
    const prompt = `
你是 ${this._getSpeakerName(speaker)}。

刚才 ${lastSpeech.speakerName} 说了：
> ${lastSpeech.content}

之前的完整对话：
${transcript.slice(-3).map(t => `${t.speakerName}: ${t.content}`).join('\n\n')}

请评估：你现在要不要插话？

按以下维度打分（1-5 分）：
1. 触发匹配度（你的"插话触发条件"是否被满足）：?
2. 人设契合度（这次插话是否符合你的角色）：?
3. 信息增量（你能否提供新视角而不是重复）：?

紧迫度 = 维度1×0.4 + 维度2×0.3 + 维度3×0.3

如果紧迫度 ≥ 7，请输出"要插话"；否则输出"不插话"。

输出格式：
{
  "urgency_score": <数字 0-10>,
  "trigger_type": "<data_conflict | perspective_conflict | instinct>",
  "decision": "<要插话 或 不插话>"
}
`.trim();

    try {
      // 简化版：用 Mock 模式时返回随机评分
      if (this.claude.useMock) {
        const score = Math.random() * 10;
        return {
          speaker,
          score,
          reason: 'mock',
        };
      }

      const response = await this.claude.generate(
        '你是一个冷静的决策评估器。',
        prompt,
        { maxTokens: 200, temperature: 0.3 }
      );

      const parsed = JSON.parse(response);
      return {
        speaker,
        score: parsed.urgency_score || 0,
        reason: parsed.trigger_type || 'unknown',
      };
    } catch (err) {
      console.warn(`   ⚠️  插话评估失败（${speaker}）:`, err.message);
      return { speaker, score: 0, reason: 'error' };
    }
  }

  _getSpeakerName(speakerId) {
    const names = {
      'gu-qing': '顾清',
      'zhang-lei': '张磊',
      'su-yu': '苏予',
      'li-hang': '李航',
    };
    return names[speakerId] || speakerId;
  }
}
