/**
 * 评审会编排器（核心）
 * 实现 T0-T6 的完整流程：开场 → 主发言 → 插话 → 收敛
 */

import { ClaudeClient } from './claude-client.js';
import { PersonaLoader } from './persona-loader.js';
import { InterruptEngine } from './interrupt-engine.js';

export class ReviewSession {
  constructor(options = {}) {
    this.claude = new ClaudeClient(options);
    this.personaLoader = new PersonaLoader(options.skillsDir);
    this.interruptEngine = new InterruptEngine(this.claude);

    this.speakers = ['gu-qing', 'zhang-lei', 'su-yu', 'li-hang'];
    this.host = 'zhou-ming';

    this.transcript = [];
    this.globalInterruptBudget = options.interruptBudget || 3;
    this.perSpeakerInterruptCount = {};
    this.lastInterrupter = null;
  }

  /**
   * 运行完整评审会
   * @param {string} stage - 阶段编号（如 '00'）
   * @param {string} artifactPath - 阶段产物文件路径
   * @returns {Promise<object>} - 评审会结果（transcript + decisions）
   */
  async run(stage, artifactPath) {
    this.startTime = Date.now();

    console.log(`\n🎭 评审会开始：阶段 ${stage}`);
    console.log(`📄 评审对象：${artifactPath}\n`);

    const artifact = await this._loadArtifact(artifactPath);

    // T0: 周明开场
    await this._opening(stage, artifact);

    // T1-T4: 主发言 + 插话循环
    for (const speaker of this.speakers) {
      await this._mainSpeech(speaker, stage, artifact);

      // 插话判断
      if (this.globalInterruptBudget > 0) {
        const interrupter = await this._checkInterrupts(speaker);
        if (interrupter) {
          await this._handleInterrupt(interrupter, speaker, stage, artifact);
        }
      }
    }

    // T6: 周明收敛
    const decisions = await this._closing(stage, artifact);

    console.log(`\n✅ 评审会结束，生成 ${decisions.length} 个决策点\n`);

    return {
      stage,
      artifact: artifactPath,
      transcript: this.transcript,
      decisions,
      metadata: {
        totalSpeaks: this.transcript.length,
        interrupts: 3 - this.globalInterruptBudget,
        duration: Date.now() - this.startTime,
      }
    };
  }

  /**
   * T0: 周明开场
   */
  async _opening(stage, artifact) {
    console.log('⏰ T0: 周明开场...');

    const prompt = this.personaLoader.buildReviewPrompt(this.host, {
      stage,
      artifact: artifact.summary,
      transcript: [],
    });

    const speech = await this.claude.generate(
      prompt.systemPrompt,
      prompt.userMessage + '\n\n请做开场致辞，1-2 句话总结本阶段产出，然后点名顾清开始发言。'
    );

    this.transcript.push({
      time: 'T0',
      speaker: this.host,
      speakerName: '周明',
      type: 'opening',
      content: speech,
    });

    console.log(`💬 周明: ${speech.slice(0, 80)}...\n`);
  }

  /**
   * T1-T4: 主发言
   */
  async _mainSpeech(speakerId, stage, artifact) {
    const timeSlot = `T${this.speakers.indexOf(speakerId) + 1}`;
    console.log(`⏰ ${timeSlot}: ${this._getSpeakerName(speakerId)} 主发言...`);

    const prompt = this.personaLoader.buildReviewPrompt(speakerId, {
      stage,
      artifact: artifact.content,
      transcript: this.transcript,
    });

    const speech = await this.claude.generate(
      prompt.systemPrompt,
      prompt.userMessage + '\n\n请按你的角色风格做主发言（200-400 字）。'
    );

    this.transcript.push({
      time: timeSlot,
      speaker: speakerId,
      speakerName: this._getSpeakerName(speakerId),
      type: 'main_speech',
      content: speech,
    });

    console.log(`💬 ${this._getSpeakerName(speakerId)}: ${speech.slice(0, 80)}...\n`);
  }

  /**
   * 检查是否有人插话
   */
  async _checkInterrupts(lastSpeaker) {
    const others = this.speakers.filter(s => s !== lastSpeaker);

    // 排除：①已用完插话额度 ②上一个插话者
    const eligible = others.filter(
      s => (this.perSpeakerInterruptCount[s] || 0) < 2 && s !== this.lastInterrupter
    );

    if (eligible.length === 0) {
      return null;
    }

    console.log(`   🔍 检查插话（候选：${eligible.map(this._getSpeakerName.bind(this)).join(', ')}）...`);

    const interrupter = await this.interruptEngine.checkInterrupts(
      eligible,
      this.transcript[this.transcript.length - 1],
      this.transcript
    );

    return interrupter;
  }

  /**
   * 处理插话
   */
  async _handleInterrupt(interrupter, originalSpeaker, stage, artifact) {
    console.log(`   ⚡ ${this._getSpeakerName(interrupter)} 插话！`);

    const prompt = this.personaLoader.buildReviewPrompt(interrupter, {
      stage,
      artifact: artifact.content,
      transcript: this.transcript,
    });

    const speech = await this.claude.generate(
      prompt.systemPrompt,
      prompt.userMessage + `\n\n请插话（针对 ${this._getSpeakerName(originalSpeaker)} 刚才的发言），1-3 句话。`
    );

    this.transcript.push({
      speaker: interrupter,
      speakerName: this._getSpeakerName(interrupter),
      type: 'interrupt',
      content: speech,
      interrupted: originalSpeaker,
    });

    console.log(`   💬 ${this._getSpeakerName(interrupter)}: ${speech.slice(0, 60)}...\n`);

    // 更新预算
    this.globalInterruptBudget--;
    this.perSpeakerInterruptCount[interrupter] = (this.perSpeakerInterruptCount[interrupter] || 0) + 1;
    this.lastInterrupter = interrupter;

    // 原发言者可选择回应（简化版：50%概率）
    if (Math.random() < 0.5) {
      console.log(`   ↩️  ${this._getSpeakerName(originalSpeaker)} 回应...`);
      const responsePrompt = this.personaLoader.buildReviewPrompt(originalSpeaker, {
        stage,
        artifact: artifact.content,
        transcript: this.transcript,
      });

      const response = await this.claude.generate(
        responsePrompt.systemPrompt,
        responsePrompt.userMessage + `\n\n请回应 ${this._getSpeakerName(interrupter)} 的插话，1-2 句话。`
      );

      this.transcript.push({
        speaker: originalSpeaker,
        speakerName: this._getSpeakerName(originalSpeaker),
        type: 'response_to_interrupt',
        content: response,
      });

      console.log(`   💬 ${this._getSpeakerName(originalSpeaker)}: ${response.slice(0, 60)}...\n`);
    }
  }

  /**
   * T6: 周明收敛
   */
  async _closing(stage, artifact) {
    console.log('⏰ T6: 周明收敛决策点...');

    const prompt = this.personaLoader.buildReviewPrompt(this.host, {
      stage,
      artifact: artifact.content,
      transcript: this.transcript,
    });

    const speech = await this.claude.generate(
      prompt.systemPrompt,
      prompt.userMessage + `\n\n请按以下结构收敛：
1. ✅ 共识：列出大家都认同的 2-4 点
2. ❓ 分歧：列出有争议的点
3. ⚠️ 风险：列出李航/顾清提出的风险
4. 决策点：将分歧抽象为 2-4 个清晰的二选一/多选一

每个决策点格式：
**决策点N：[问题]**
- 选项A：[描述 + 优劣]
- 选项B：[描述 + 优劣]
- 建议：[只在明显最优时给]

最后一句必须是："你选？"`
    );

    this.transcript.push({
      time: 'T6',
      speaker: this.host,
      speakerName: '周明',
      type: 'closing',
      content: speech,
    });

    console.log(`💬 周明: ${speech.slice(0, 80)}...\n`);

    // 解析决策点（简化版）
    const decisions = this._parseDecisions(speech);
    return decisions;
  }

  /**
   * 辅助方法
   */
  async _loadArtifact(filePath) {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      content,
      summary: content.split('\n').slice(0, 10).join('\n') + '...',
    };
  }

  _getSpeakerName(speakerId) {
    const names = {
      'zhou-ming': '周明',
      'gu-qing': '顾清',
      'zhang-lei': '张磊',
      'su-yu': '苏予',
      'li-hang': '李航',
    };
    return names[speakerId] || speakerId;
  }

  _parseDecisions(closingSpeech) {
    const headingPattern = /\*\*决策点\s*(\d+)[：:]\s*([^*]+?)\s*\*\*/g;
    const headings = [...closingSpeech.matchAll(headingPattern)];
    const decisions = [];

    for (let index = 0; index < headings.length; index++) {
      const heading = headings[index];
      const [, decisionNo, question] = heading;
      const bodyStart = heading.index + heading[0].length;
      const bodyEnd = headings[index + 1]?.index ?? closingSpeech.length;
      const body = closingSpeech.slice(bodyStart, bodyEnd);
      const options = [];
      const optionPattern = /-\s*选项\s*([A-Z])[：:]\s*([^\n]+)/g;
      let optionMatch;

      while ((optionMatch = optionPattern.exec(body)) !== null) {
        options.push({
          id: optionMatch[1].trim().toUpperCase(),
          label: optionMatch[2].trim(),
          description: optionMatch[2].trim(),
        });
      }

      if (options.length === 0) continue;

      const recommendationMatch = body.match(/-\s*(?:我的)?建议[：:]\s*([^\n]+)/);
      const recommendation = recommendationMatch
        ? recommendationMatch[1].trim().match(/(?:选|建议)?\s*([A-Z])\b/i)?.[1]?.toUpperCase() || recommendationMatch[1].trim()
        : null;

      decisions.push({
        id: `decision-${String(decisionNo).padStart(3, '0')}`,
        question: question.trim(),
        options,
        recommendation,
      });
    }

    return decisions;
  }
}
