import { loadSkill } from './skill-loader.js';

const ROLE_SKILLS = [
  'aipm-zhou-ming',
  'aipm-gu-qing',
  'aipm-zhang-lei',
  'aipm-su-yu',
  'aipm-li-hang',
];

const STAGE_PLANS = {
  '00': {
    label: 'Stage 00 Requirement Brainstorming',
    source: 'skill-orchestrated-requirement-brainstorming',
    skills: ['aipm-pipeline', 'aipm-zhou-ming', 'requirement-brainstorming-zjy'],
  },
  '00.5': {
    label: 'Stage 00.5 Competitive Intelligence',
    source: 'skill-orchestrated-competitive-analysis',
    skills: ['aipm-pipeline', 'aipm-zhou-ming', 'aipm-gu-qing', 'aipm-data-rag', 'competitors-zjy'],
  },
  '01': {
    label: 'Stage 01 Prompt Enhancement',
    source: 'skill-orchestrated-enhance-prompt',
    skills: ['aipm-pipeline', 'aipm-zhou-ming', 'aipm-gu-qing', 'enhance-prompt'],
  },
  '02': {
    label: 'Stage 02 PRD',
    source: 'skill-orchestrated-prd',
    skills: ['aipm-pipeline', 'aipm-zhou-ming', 'aipm-gu-qing', 'aipm-zhang-lei', 'aipm-li-hang', 'prd'],
  },
  '03': {
    label: 'Stage 03 Wireframe and Interaction Spec',
    source: 'skill-orchestrated-wireframe',
    skills: ['aipm-pipeline', 'aipm-su-yu', 'aipm-zhang-lei', 'aipm-li-hang', 'wireframe-prototyping'],
  },
  '04': {
    label: 'Stage 04 High Fidelity HTML Prototype',
    source: 'skill-orchestrated-frontend-prototype',
    skills: ['aipm-pipeline', 'aipm-su-yu', 'aipm-li-hang', 'aipm-gu-qing', 'frontend-design'],
  },
  review: {
    label: 'AIPM Review Session',
    source: 'skill-orchestrated-review-session',
    skills: ['aipm-review-session', ...ROLE_SKILLS],
  },
};

export class StageOrchestratorService {
  getStagePlan(stage) {
    return STAGE_PLANS[stage] || null;
  }

  getAllStagePlans() {
    return STAGE_PLANS;
  }

  async loadStageSkills(stage) {
    const plan = this.getStagePlan(stage);
    if (!plan) return { stage, plan: null, skills: [] };

    const withTimeout = (promise, ms = 5000) =>
      Promise.race([promise, new Promise(resolve => setTimeout(() => resolve({ root: null, main: '' }), ms))]);

    const loaded = await Promise.all(
      plan.skills.map(async (name) => {
        const skill = await withTimeout(loadSkill(name));
        return { name, root: skill.root, main: skill.main, found: Boolean(skill.main) };
      })
    );

    return { stage, plan, skills: loaded };
  }

  async buildSystemPrompt(stage, instruction = '') {
    const { plan, skills } = await this.loadStageSkills(stage);
    if (!plan) {
      return instruction;
    }

    const loadedNames = skills.map(skill => `${skill.name}${skill.found ? '' : ' (missing)'}`).join(', ');
    const skillText = skills
      .map((skill) => [
        '---',
        `## Skill: ${skill.name}`,
        `Source: ${skill.root || 'missing'}`,
        skill.main || '[missing skill body]',
      ].join('\n'))
      .join('\n\n');

    return [
      '# AIPM Skill Orchestration',
      `Stage: ${stage}`,
      `Stage label: ${plan.label}`,
      `Loaded skills: ${loadedNames}`,
      '',
      'Use these skills as a combined operating system. Respect each role skill, the pipeline state machine, data honesty rules, review-session rules, and the stage-specific production skill. If a required external data/API source is unavailable, state the gap and continue with clearly labeled fallback data.',
      '',
      skillText,
      '',
      '---',
      '## Stage Instruction',
      instruction,
    ].join('\n');
  }
}

export const stageOrchestratorService = new StageOrchestratorService();
