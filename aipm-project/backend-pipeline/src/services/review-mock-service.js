import { projectService } from './project-service.js';
import { config } from '../config.js';
import { callClaude } from './claude-service.js';
import { stageOrchestratorService } from './stage-orchestrator-service.js';

const SPEAKER_IDS = ['gu-qing', 'zhang-lei', 'su-yu', 'li-hang'];
const SPEAKER_NAMES = {
  'zhou-ming': '周明',
  'gu-qing': '顾清',
  'zhang-lei': '张磊',
  'su-yu': '苏予',
  'li-hang': '李航',
};

export class ReviewMockService {
  async run(projectId, stage, artifactPath, onEntry = null) {
    const meta = await projectService.getMeta(projectId);
    const artifact = await projectService.readFile(projectId, artifactPath);

    if (!config.useMock) {
      try {
        return await this._runWithClaude(meta, stage, artifact, onEntry);
      } catch (err) {
        console.warn(`评审会 Claude 调用失败，降级到 mock：${err.message}`);
      }
    }

    // mock 路径
    const result = this._runMock(meta, stage, artifact);
    if (onEntry) {
      for (const entry of result.transcript) {
        onEntry(entry);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return result;
  }

  async _runWithClaude(meta, stage, artifact, onEntry = null) {
    // 通过 orchestrator 加载评审会所有 skill
    const { skills: loadedSkills } = await stageOrchestratorService.loadStageSkills('review');
    const skills = {};
    for (const s of loadedSkills) {
      skills[s.name] = s.main;
    }
    const skillOf = (roleId) => skills[`aipm-${roleId}`] || skills[roleId] || '';

    const stageNames = { '00': '需求头脑风暴', '00.5': '竞品分析', '01': '提示增强', '02': 'PRD', '03': '线框图与交互规范', '04': '高保真 HTML 原型' };
    const stageName = stageNames[stage] || stage;

    // 把文档内容完整传入（截取前 3000 字，足够覆盖核心内容）
    const artifactContent = artifact.slice(0, 3000);

    const transcript = [];

    // 构造上下文：包含完整文档内容
    const context = `项目：${meta.name}\n原始想法：${meta.idea}\n当前阶段：${stage}（${stageName}）\n\n=== 阶段产物完整内容 ===\n${artifactContent}\n=== 产物内容结束 ===`;

    // T0 周明开场
    const openingText = await callClaude(
      `${skillOf('zhou-ming')}\n\n你是周明，AIPM团队Lead PM，正在主持阶段${stage}的评审会。开场要：1句话概括本阶段产物的核心结论；点名顾清开始发言。不超过60字。`,
      context,
      { maxTokens: 200, timeout: 120000 }
    );
    const openingEntry = { time: 'T0', speaker: 'zhou-ming', speakerName: '周明', type: 'opening', content: openingText || `评审阶段 ${stage}「${stageName}」，顾清先说。` };
    transcript.push(openingEntry);
    if (onEntry) onEntry(openingEntry);

    // T1-T4 四人主发言，每人只说一次
    for (let i = 0; i < SPEAKER_IDS.length; i++) {
      const speakerId = SPEAKER_IDS[i];
      // 只传入之前的发言记录，让每个人基于前面内容接力
      const prevTranscript = transcript.map(e => `${e.speakerName}：${e.content}`).join('\n\n');

      const speech = await callClaude(
        `${skillOf(speakerId)}\n\n你正在参加阶段${stage}「${stageName}」的产品评审会。请基于上面的阶段产物内容，从你的角色视角发表观点。150-250字。要求：1.必须引用产物中的具体内容 2.指出一个明确的问题或亮点 3.给出一个可执行的建议`,
        `${context}\n\n之前的发言：\n${prevTranscript}\n\n现在轮到你（${SPEAKER_NAMES[speakerId]}）发言，请直接说，不要重复别人说过的：`,
        { maxTokens: 500, timeout: 300000 }
      );

      const speechContent = speech || `${SPEAKER_NAMES[speakerId]}基于产物内容发表观点。`;
      const speechEntry = { time: `T${i + 1}`, speaker: speakerId, speakerName: SPEAKER_NAMES[speakerId], type: 'main_speech', content: speechContent };
      transcript.push(speechEntry);
      if (onEntry) onEntry(speechEntry);
    }

    // T5 周明收尾
    const fullTranscript = transcript.map(e => `${e.speakerName}：${e.content}`).join('\n\n');
    const closingText = await callClaude(
      `${skillOf('zhou-ming')}\n\n评审会结束，你需要收敛。格式：✅共识 / ❌分歧 / ⚠️风险 / 决策点（格式：**决策点N：[问题]** - 选项A：[描述] - 选项B：[描述] - 建议：[选A/B]）。最后一句：你选？`,
      `${context}\n\n完整评审记录：\n${fullTranscript}`,
      { maxTokens: 800, timeout: 180000 }
    );
    const closingEntry = { time: 'T5', speaker: 'zhou-ming', speakerName: '周明', type: 'closing', content: closingText || '评审结束，请拍板。' };
    transcript.push(closingEntry);
    // closing 不通过 onEntry 推送，由 route 层附带 decisions 后再推

    const decisions = this._buildDecisionsFromStage(stage, meta);
    return {
      stage,
      artifact: artifact,
      transcript,
      decisions,
      metadata: { source: 'claude_skill_review', totalSpeaks: transcript.length, duration: 0 },
    };
  }

  async readOptional(projectId, relativePath) {
    if (!relativePath) return '';
    try { return await projectService.readFile(projectId, relativePath); } catch { return ''; }
  }

  _runMock(meta, stage, artifact) {
    const isStudentJob = /大学生|兼职|岗位|靠谱|结算|雇主|同校/.test(`${meta.idea}\n${artifact}`);
    const c = isStudentJob
      ? { productName: '靠谱校园兼职平台', user: '需要安全、透明、时间匹配的大学生', coreProblem: '兼职信息真假难辨、结算不确定', differentiator: '把岗位可信度、雇主实名、结算说明前置', primaryRisk: '信任承诺如果超过真实履约能力，会反噬平台信用', mvpTradeoff: '先做信任闭环，还是先扩大岗位供给' }
      : { productName: meta.name || '新产品', user: '首批目标用户', coreProblem: meta.idea || '当前替代方案不够顺畅', differentiator: '更清晰的首屏价值和核心行动路径', primaryRisk: '需求假设还需要继续验证', mvpTradeoff: '先做完整体验，还是先验证最小闭环' };

    const stageNameOf = s => ({ '00': '需求头脑风暴', '00.5': '竞品分析', '01': '提示增强', '02': 'PRD', '03': '线框图与交互规范', '04': '高保真 HTML 原型' }[s] || s);
    const sn = stageNameOf(stage);
    const transcript = [
      { time: 'T0', speaker: 'zhou-ming', speakerName: '周明', type: 'opening', content: `评审阶段 ${stage}「${sn}」。顾清先说。` },
      { time: 'T1', speaker: 'gu-qing', speakerName: '顾清', type: 'main_speech', content: `我看到的是：当前产物围绕「${c.productName}」生成，目标用户是「${c.user}」。差异化方向「${c.differentiator}」，置信度 70%（mock 数据）。` },
      { time: 'T2', speaker: 'zhang-lei', speakerName: '张磊', type: 'main_speech', content: `我的第一反应：如果这是解决「${c.coreProblem}」的产品，我最怕的是进去之后发现说得好听但根本没用。30 秒内要让我看到为什么靠谱。` },
      { time: 'T3', speaker: 'su-yu', speakerName: '苏予', type: 'main_speech', content: '从设计看，方向对了。但我卡两件事：信任证据不能像营销口号，要变成可扫描的标签和数字；CTA 必须清晰，详情页找不到报名入口是设计失败。' },
      { time: 'T4', speaker: 'li-hang', speakerName: '李航', type: 'main_speech', content: `先泼冷水：所有保障机制一起做，MVP 会失控。建议先做可解释的「审核状态 + 结算说明 + 投诉入口」，不要一开始承诺资金托管。2-3 周能闭环。` },
    ];
    const decisions = this._buildDecisionsFromStage(stage, c);
    const decisionText = decisions.map((d, i) => `**决策点${i + 1}：${d.question}**\n${d.options.map(o => `- 选项${o.id}：${o.label}。${o.description}`).join('\n')}\n- 建议：${d.recommendation || '不预设'}`).join('\n\n');
    transcript.push({ time: 'T5', speaker: 'zhou-ming', speakerName: '周明', type: 'closing', content: `好，评审会结束。\n\n✅ 共识：差异化方向「${c.differentiator}」是最有价值的，MVP 不要贪心。\n❌ 分歧：${c.mvpTradeoff}。\n⚠️ 风险：${c.primaryRisk}。\n\n现在有 ${decisions.length} 个决策点需要你拍板：\n\n${decisionText}\n\n你选？` });
    return { stage, artifact, transcript, decisions, metadata: { source: 'dynamic_mock_review', totalSpeaks: transcript.length, duration: 0 } };
  }

  _buildDecisionsFromStage(stage, c) {
    const isObj = typeof c === 'object' && c.mvpTradeoff;
    const common = {
      '00': [
        { id: 'decision-001', stage, question: '需求方向是否确认？', background: '来自需求头脑风暴评审。', options: [{ id: 'A', label: '确认，进入竞品分析', description: '需求假设足够清晰，可以继续。' }, { id: 'B', label: '需要补充', description: '某些维度还不够明确，回到头脑风暴。' }], recommendation: 'A', status: 'pending' },
      ],
      '00.5': [
        { id: 'decision-001', stage, question: '竞品分析后，差异化优先打哪一点？', background: '来自本轮评审的核心分歧。', options: [{ id: 'A', label: '差异化优先', description: '基于竞品空白切入。' }, { id: 'B', label: '供给优先', description: '先扩大核心供给量。' }], recommendation: 'A', status: 'pending' },
      ],
      '01': [{ id: 'decision-001', stage, question: '增强提示词的主叙事偏哪边？', background: '来自本轮评审。', options: [{ id: 'A', label: '核心价值优先', description: '围绕核心差异化展开。' }, { id: 'B', label: '功能丰富度', description: '更强调完整体验。' }], recommendation: 'A', status: 'pending' }],
      '02': [
        { id: 'decision-001', stage, question: 'MVP 范围是否确认？', background: '来自PRD评审。', options: [{ id: 'A', label: '确认PRD', description: 'MVP范围明确，可以进入线框图。' }, { id: 'B', label: '需要调整', description: '功能范围还需收敛。' }], recommendation: 'A', status: 'pending' },
        { id: 'decision-002', stage, question: '首批目标范围？', background: '来自PRD评审。', options: [{ id: 'A', label: '小范围验证', description: '便于控制质量。' }, { id: 'B', label: '大范围铺开', description: '增长空间大但运营压力高。' }], recommendation: 'A', status: 'pending' },
      ],
      '03': [{ id: 'decision-001', stage, question: '线框图方向是否确认？', background: '来自本轮评审。', options: [{ id: 'A', label: '确认', description: '进入高保真原型。' }, { id: 'B', label: '需调整', description: '信息架构还需修改。' }], recommendation: 'A', status: 'pending' }],
      '04': [{ id: 'decision-001', stage, question: '原型是否可以作为方向冻结？', background: '来自本轮评审。', options: [{ id: 'A', label: '可以冻结', description: '进入后续工程拆解。' }, { id: 'B', label: '需要重做首页', description: '继续调整首屏信息层级。' }], recommendation: 'A', status: 'pending' }],
    };
    return common[stage] || [{ id: 'decision-001', stage, question: '当前阶段是否通过？', background: '来自本轮评审。', options: [{ id: 'A', label: '通过', description: '进入下一阶段。' }, { id: 'B', label: '不通过', description: '回到本阶段继续修改。' }], recommendation: 'A', status: 'pending' }];
  }
}

export const reviewMockService = new ReviewMockService();
