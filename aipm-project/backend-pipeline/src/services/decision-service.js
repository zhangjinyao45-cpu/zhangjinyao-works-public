import { projectService } from './project-service.js';
import { config } from '../config.js';
import { Errors } from '../utils/errors.js';

const REVIEW_PERSONAS = ['gu-qing', 'zhang-lei', 'su-yu', 'li-hang', 'zhou-ming'];

export class DecisionService {
  normalizeDecisions(rawDecisions = [], transcript = [], stage) {
    const closing = transcript.find(entry => entry.type === 'closing');
    const parsed = this.parseClosingDecisions(closing?.content || '');
    const source = rawDecisions.length > 0 ? rawDecisions : parsed;

    return source
      .filter(decision => decision && decision.question && Array.isArray(decision.options))
      .map((decision, index) => this.normalizeDecision(decision, index, stage, transcript));
  }

  normalizeDecision(decision, index, stage, transcript = []) {
    const id = decision.id || `decision-${String(index + 1).padStart(3, '0')}`;
    const options = decision.options
      .filter(option => option && option.id && option.label)
      .map(option => ({
        id: String(option.id).trim().toUpperCase(),
        label: String(option.label).trim(),
        description: String(option.description || option.label).trim(),
        pros: Array.isArray(option.pros) ? option.pros : [],
        cons: Array.isArray(option.cons) ? option.cons : [],
        supporters: Array.isArray(option.supporters) ? option.supporters : [],
        opponents: Array.isArray(option.opponents) ? option.opponents : [],
      }));

    return {
      id,
      stage,
      question: String(decision.question).trim(),
      background: decision.background || this.buildBackground(transcript),
      options,
      recommendation: normalizeRecommendation(decision.recommendation),
      status: decision.status || 'pending',
      source: {
        type: 'review_closing',
        speaker: 'zhou-ming',
        personas: REVIEW_PERSONAS,
      },
    };
  }

  parseClosingDecisions(content) {
    const decisions = [];
    const headingPattern = /\*\*决策点\s*(\d+)[：:]\s*([^*]+?)\s*\*\*/g;
    const headings = [...content.matchAll(headingPattern)];

    for (let index = 0; index < headings.length; index++) {
      const heading = headings[index];
      const [, decisionNo, question] = heading;
      const bodyStart = heading.index + heading[0].length;
      const bodyEnd = headings[index + 1]?.index ?? content.length;
      const body = content.slice(bodyStart, bodyEnd);
      const options = [];
      const optionPattern = /-\s*选项\s*([A-Z])[：:]\s*([^\n]+)/g;
      let optionMatch;

      while ((optionMatch = optionPattern.exec(body)) !== null) {
        const label = optionMatch[2].trim();
        options.push({
          id: optionMatch[1].trim().toUpperCase(),
          label,
          description: label,
        });
      }

      if (options.length === 0) continue;

      const recommendationMatch = body.match(/-\s*(?:我的)?建议[：:]\s*([^\n]+)/);
      decisions.push({
        id: `decision-${String(decisionNo).padStart(3, '0')}`,
        question: question.trim(),
        options,
        recommendation: recommendationMatch ? normalizeRecommendation(recommendationMatch[1]) : null,
      });
    }

    return decisions;
  }

  async registerReviewDecisions(projectId, stage, reviewResult, reviewPath) {
    const decisions = this.normalizeDecisions(reviewResult.decisions || [], reviewResult.transcript || [], stage);
    reviewResult.decisions = decisions;

    await projectService.writeFile(projectId, reviewPath, JSON.stringify(reviewResult, null, 2));
    await projectService.writeFile(
      projectId,
      `decisions/${stage}-pending.json`,
      JSON.stringify({
        stage,
        reviewPath,
        status: 'pending',
        decisions,
        generatedAt: new Date().toISOString(),
      }, null, 2)
    );

    const now = new Date().toISOString();
    await projectService.updateMeta(projectId, (meta) => {
      meta.stages[stage].status = decisions.length > 0 ? 'decision_pending' : 'done';
      meta.stages[stage].reviewPath = reviewPath;
      meta.stages[stage].decisions = decisions.map(decision => decision.id);
      meta.currentState = decisions.length > 0 ? 'decision_pending' : 'pending';

      if (decisions.length === 0) {
        const next = getNextStage(stage);
        meta.stages[stage].completedAt = now;
        if (next) {
          meta.currentStage = next;
          meta.stages[next].status = meta.stages[next].status || 'pending';
        } else {
          meta.currentState = 'completed';
          meta.globalState = 'completed';
        }
      }

      meta.eventLog.push({
        time: now,
        event: 'review_completed',
        stage,
        decisionCount: decisions.length,
      });
      return meta;
    });

    return decisions;
  }

  async listDecisions(projectId, status = 'pending') {
    const meta = await projectService.getMeta(projectId);
    const pendingStage = Object.entries(meta.stages).find(([, stageInfo]) => {
      return stageInfo.status === 'decision_pending';
    });

    if (!pendingStage) return [];

    const [stage, stageInfo] = pendingStage;
    const decisions = await this.readStageDecisions(projectId, stage, stageInfo);
    const decided = new Set(
      meta.decisionHistory.map(decision => `${decision.stage}:${decision.id}`)
    );

    if (status === 'pending') {
      return decisions.filter(decision => !decided.has(`${stage}:${decision.id}`));
    }

    return decisions;
  }

  async submitDecision(projectId, decisionId, choice, rationale = null) {
    if (!choice) throw Errors.invalidInput('choice 必填');

    const meta = await projectService.getMeta(projectId);
    const found = await this.findDecision(projectId, decisionId, meta);
    if (!found) throw Errors.invalidInput(`决策 ${decisionId} 不存在`);

    if (meta.decisionHistory.some(decision => decision.id === decisionId && decision.stage === found.stage)) {
      throw Errors.invalidInput(`决策 ${decisionId} 已拍板`);
    }

    const normalizedChoice = String(choice).trim().toUpperCase();
    const selectedOption = found.decision.options.find(option => option.id === normalizedChoice);
    if (!selectedOption) {
      throw Errors.invalidInput(`选项 ${choice} 不存在`, {
        decisionId,
        validOptions: found.decision.options.map(option => option.id),
      });
    }

    const decidedAt = new Date().toISOString();
    await this.writeDecisionTrace(projectId, found.stage, found.decision, selectedOption, rationale, decidedAt);

    await projectService.updateMeta(projectId, (m) => {
      m.decisionHistory.push({
        id: decisionId,
        stage: found.stage,
        question: found.decision.question,
        userChoice: normalizedChoice,
        userChoiceLabel: selectedOption.label,
        rationale: rationale || null,
        decidedAt,
        affectsStages: getDownstreamStages(found.stage),
      });
      m.eventLog.push({
        time: decidedAt,
        event: 'decision_made',
        stage: found.stage,
        decisionId,
        choice: normalizedChoice,
      });
      return m;
    });

    const metaAfterDecision = await projectService.getMeta(projectId);
    const allDecidedInStage = await this.areAllDecisionsResolved(projectId, found.stage, metaAfterDecision);
    let nextStage = null;
    let pipelineCompleted = false;

    if (allDecidedInStage) {
      const advancement = await this.advanceAfterStage(projectId, found.stage);
      nextStage = advancement.nextStage;
      pipelineCompleted = advancement.completed;
    }

    return {
      decisionId,
      choice: normalizedChoice,
      selectedOption,
      decidedAt,
      stage: found.stage,
      allDecidedInStage,
      nextAction: nextStage
        ? { type: 'advance_to_stage', stage: nextStage, endpoint: `/api/projects/${projectId}/status` }
        : (pipelineCompleted
            ? { type: 'pipeline_completed' }
            : { type: 'next_decision', endpoint: `/api/projects/${projectId}/decisions?status=pending` }),
    };
  }

  async findDecision(projectId, decisionId, meta) {
    const stageEntries = Object.entries(meta.stages);
    const orderedEntries = [
      ...stageEntries.filter(([, stageInfo]) => stageInfo.status === 'decision_pending'),
      ...stageEntries.filter(([, stageInfo]) => stageInfo.status !== 'decision_pending'),
    ];

    for (const [stage, stageInfo] of orderedEntries) {
      if (!stageInfo.reviewPath && !stageInfo.decisions?.length) continue;
      const decisions = await this.readStageDecisions(projectId, stage, stageInfo);
      const decision = decisions.find(item => item.id === decisionId);
      if (decision) return { stage, decision };
    }
    return null;
  }

  async readStageDecisions(projectId, stage, stageInfo) {
    try {
      const pending = JSON.parse(await projectService.readFile(projectId, `decisions/${stage}-pending.json`));
      if (Array.isArray(pending.decisions)) return pending.decisions;
    } catch {}

    if (!stageInfo.reviewPath) return [];

    const review = JSON.parse(await projectService.readFile(projectId, stageInfo.reviewPath));
    const decisions = this.normalizeDecisions(review.decisions || [], review.transcript || [], stage);
    if (decisions.length > 0) {
      await projectService.writeFile(
        projectId,
        `decisions/${stage}-pending.json`,
        JSON.stringify({
          stage,
          reviewPath: stageInfo.reviewPath,
          status: 'pending',
          decisions,
          generatedAt: new Date().toISOString(),
        }, null, 2)
      );
    }
    return decisions;
  }

  async areAllDecisionsResolved(projectId, stage, meta) {
    const stageInfo = meta.stages[stage];
    const decisions = await this.readStageDecisions(projectId, stage, stageInfo);
    if (decisions.length === 0) return false;

    const decidedIds = new Set(meta.decisionHistory.filter(decision => decision.stage === stage).map(decision => decision.id));
    return decisions.every(decision => decidedIds.has(decision.id));
  }

  async advanceAfterStage(projectId, stage) {
    const now = new Date().toISOString();
    const nextStage = getNextStage(stage);

    if (!nextStage) {
      await projectService.updateMeta(projectId, (meta) => {
        meta.stages[stage].status = 'done';
        meta.stages[stage].completedAt = now;
        meta.currentState = 'completed';
        meta.globalState = 'completed';
        meta.eventLog.push({ time: now, event: 'pipeline_completed' });
        return meta;
      });
      return { nextStage: null, completed: true };
    }

    await projectService.updateMeta(projectId, (meta) => {
      meta.stages[stage].status = 'done';
      meta.stages[stage].completedAt = now;
      meta.stages[nextStage].status = 'pending';
      meta.stages[nextStage].startedAt = null;
      meta.currentStage = nextStage;
      meta.currentState = 'pending';
      meta.eventLog.push({ time: now, event: 'stage_done', stage });
      meta.eventLog.push({ time: now, event: 'stage_ready', stage: nextStage });
      return meta;
    });

    return { nextStage, completed: false };
  }

  async writeDecisionTrace(projectId, stage, decision, selectedOption, rationale, decidedAt) {
    const optionsMd = decision.options.map(option => {
      const marker = option.id === selectedOption.id ? ' ← 用户选择' : '';
      return `- **${option.id}. ${option.label}**：${option.description || option.label}${marker}`;
    }).join('\n');

    const markdown = `# ${decision.id}: ${decision.question}

- **阶段：** ${stage}
- **决策时间：** ${decidedAt}
- **来源：** ${stage}-review.json

## 背景
${decision.background || '来自本轮评审会收敛。'}

## 选项
${optionsMd}

## 系统建议
${decision.recommendation || '无明确建议'}

## 用户决策
**用户选择：${selectedOption.id}. ${selectedOption.label}**

${rationale ? `## 决策依据\n${rationale}\n` : ''}
## 影响下游
${getDownstreamStages(stage).map(item => `- 阶段 ${item}：沿用本决策约束`).join('\n') || '- 已是最后阶段'}
`;

    await projectService.writeFile(projectId, `decisions/${stage}-${decision.id}.md`, markdown);
    const previousAnswers = await this.readDecisionAnswers(projectId);
    const answers = [
      ...previousAnswers.answers.filter(answer => !(answer.stage === stage && answer.decisionId === decision.id)),
      {
        decisionId: decision.id,
        stage,
        question: decision.question,
        choice: selectedOption.id,
        choiceLabel: selectedOption.label,
        rationale: rationale || null,
        decidedAt,
      },
    ];

    await projectService.writeFile(
      projectId,
      'inputs/decision-answers.json',
      JSON.stringify({
        updatedAt: decidedAt,
        latest: answers[answers.length - 1],
        answers,
      }, null, 2)
    );
  }

  async readDecisionAnswers(projectId) {
    try {
      const data = JSON.parse(await projectService.readFile(projectId, 'inputs/decision-answers.json'));
      return {
        answers: Array.isArray(data.answers) ? data.answers : [],
      };
    } catch {
      return { answers: [] };
    }
  }

  buildBackground(transcript = []) {
    const speakers = transcript
      .filter(entry => entry.type === 'main_speech' || entry.type === 'interrupt')
      .map(entry => entry.speakerName)
      .filter(Boolean);
    const uniqueSpeakers = [...new Set(speakers)].slice(0, 4);
    return uniqueSpeakers.length > 0
      ? `评审会上 ${uniqueSpeakers.join('、')} 提出了不同视角，周明将分歧收敛为这个拍板点。`
      : '来自本轮评审会收敛。';
  }
}

function normalizeRecommendation(value) {
  if (!value) return null;
  const text = String(value).trim();
  const optionMatch = text.match(/(?:选|建议)?\s*([A-Z])\b/i);
  return optionMatch ? optionMatch[1].toUpperCase() : text;
}

function getNextStage(stage) {
  const idx = config.stages.indexOf(stage);
  if (idx === -1) return null;
  return config.stages[idx + 1] || null;
}

function getDownstreamStages(stage) {
  const idx = config.stages.indexOf(stage);
  if (idx === -1) return [];
  return config.stages.slice(idx + 1);
}

export const decisionService = new DecisionService();
