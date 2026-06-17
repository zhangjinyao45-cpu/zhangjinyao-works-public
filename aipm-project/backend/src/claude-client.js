/**
 * Claude API 客户端封装
 * 支持真实 API 和 Mock 模式（开发期无需 API Key）
 */

import Anthropic from '@anthropic-ai/sdk';

export class ClaudeClient {
  constructor(options = {}) {
    this.useMock = options.useMock || process.env.USE_MOCK === 'true';

    if (!this.useMock) {
      const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required. Set USE_MOCK=true for development.');
      }
      this.client = new Anthropic({ apiKey });
    }

    this.model = options.model || 'claude-sonnet-4-6';
  }

  /**
   * 调用 Claude API（或 Mock）
   * @param {string} systemPrompt - 系统提示（角色人设）
   * @param {string} userMessage - 用户消息
   * @param {object} options - 额外选项
   * @returns {Promise<string>} - Claude 的回复
   */
  async generate(systemPrompt, userMessage, options = {}) {
    if (this.useMock) {
      return this._mockGenerate(systemPrompt, userMessage, options);
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    return response.content[0].text;
  }

  /**
   * Mock 模式（开发期用，快速验证流程）
   */
  _mockGenerate(systemPrompt, userMessage, options) {
    // 从 userMessage 提取角色名（buildReviewPrompt 里有"你是 周明，"）
    const speakerMatch = userMessage.match(/你是\s*(\S+?)[，,]/);
    const speaker = speakerMatch ? speakerMatch[1] : 'Unknown';

    // 检测是开场/主发言/插话/收敛
    const isOpening = userMessage.includes('开场致辞') || userMessage.includes('点名顾清');
    const isInterrupt = userMessage.includes('请插话') || userMessage.includes('1-3 句话');
    const isClosing = userMessage.includes('请按以下结构收敛') || userMessage.includes('决策点');
    const isResponse = userMessage.includes('请回应');

    // 简单的 Mock 回复（基于角色 + 场景）
    const mockReplies = {
      '周明': {
        opening: '好，阶段0 的头脑风暴产出了基础定义——这是一个面向大学生的兼职信息 App。我们用一轮评审会挑战一下。**顾清，先从市场和数据说起。**',
        closing: `好，评审会结束。我听到了几个关键点——

✅ **共识**：信任是这个赛道核心问题；MVP 不做资金托管。
❓ **分歧**：首页第一屏放什么？大一/大二 vs 全体大学生？
⚠️ **风险**：用户评价系统易被刷；社交背书有隐私合规风险。

现在有 3 个决策点需要你拍板：

**决策点1：目标用户是否收窄到大一/大二？**
- 选项A：收窄
- 选项B：扩大到全体大学生
- 建议：选 B

**决策点2：首页第一屏放什么？**
- 选项A：已结算订单数 + 评分
- 选项B：社交背书
- 选项C：本校使用人数

**决策点3：用户评价做到什么程度？**
- 选项A：完整评价系统
- 选项B：仅评分

你选？`,
        default: '我听到了几个声音，让我们继续往下走。',
      },
      '顾清': {
        main: '我看到的是这样的——基于 App Store CN 实时数据：青团社 ⭐3.7（8446 评分），兼职猫 ⭐3.9（7151 评分），远低于综合招聘 App（58同城 ⭐4.6）。⚠️ 数据缺口：评论 RSS 已失效，本次无法拿到差评原文。基于评分推断，"信任"是核心问题——置信度 60%。',
        interrupt: '等等，这个判断我有补充——HN 数据显示海外类似产品也没跑通（NoCV 项目 1↑ 0💬），这个赛道全球都难。',
        response: '好问题，我修正置信度——对大一/大二的市场验证，仅 50% 置信度。',
      },
      '张磊': {
        main: '我说我的第一反应——我大一找兼职靠学姐推荐、闲鱼、店里直接问。装你的 App 我得先卸一个别的。30 秒测试：你 App 第一眼如果不是"我认识的学姐也在用"，我大概率 30 秒内卸载。',
        interrupt: '啊？这个我不会用啊——数字对我没用，我要看到具体的人。',
        response: '行吧，那"本校 XX 人用过"我可能能信。',
      },
      '苏予': {
        main: '基于顾清的数据和张磊的体感，我从设计层说几点——✅ 把"靠谱"作为关键词方向正确。❌ 首页信息架构有问题，"已结算订单数"对大学生太抽象，建议改成社交背书。⚠️ 想讨论：你选了橙色系，这要和青团社（也是橙色）正面刚，差异化不明显，要不要换色？',
        interrupt: '这就是我说的"分类逻辑"问题——信息密度过载会劝退。',
      },
      '李航': {
        main: '苏予提的社交背书，我说一下技术成本——10-20 天工时 + PIPL 隐私合规风险。建议 MVP 改成"本校已有 XX 人用过"，3 天能上。整体 MVP 工时：乐观 35 天 / 中位 50 天 / 悲观 70 天。建议砍掉 AI 智能推荐和积分体系。',
        interrupt: '我得说一下——评价系统反作弊成本不低，前 100 条要人工审核。',
      },
    };

    const speakerReplies = mockReplies[speaker];
    if (!speakerReplies) {
      return Promise.resolve(`[Mock-${speaker}] 模拟发言内容`);
    }

    let reply;
    if (isOpening && speakerReplies.opening) reply = speakerReplies.opening;
    else if (isClosing && speakerReplies.closing) reply = speakerReplies.closing;
    else if (isInterrupt && speakerReplies.interrupt) reply = speakerReplies.interrupt;
    else if (isResponse && speakerReplies.response) reply = speakerReplies.response;
    else reply = speakerReplies.main || speakerReplies.default || `[Mock] ${speaker} 主发言内容`;

    return Promise.resolve(reply);
  }

  /**
   * 批量并行调用（用于插话判断）
   * @param {Array} prompts - [{systemPrompt, userMessage}, ...]
   * @returns {Promise<Array<string>>} - 所有回复
   */
  async batchGenerate(prompts, options = {}) {
    return Promise.all(
      prompts.map(p => this.generate(p.systemPrompt, p.userMessage, options))
    );
  }
}
