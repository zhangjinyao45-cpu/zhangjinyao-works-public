/**
 * 提示增强 Service (Stage 1)
 * 严格遵循 enhance-prompt skill
 * 将产品方向 + 竞品差异化 → 精确的UI/产品生成提示词
 */

import { projectService } from './project-service.js';
import { Errors } from '../utils/errors.js';
import { config } from '../config.js';
import { callClaude } from './claude-service.js';
import { stageOrchestratorService } from './stage-orchestrator-service.js';

export class PromptService {
  async generateArtifact(projectId) {
    const meta = await projectService.getMeta(projectId);
    const stage = '01';
    const stageInfo = meta.stages[stage];

    if (!stageInfo) {
      throw Errors.invalidInput('阶段 01 不存在');
    }

    const now = new Date().toISOString();
    await projectService.updateMeta(projectId, (m) => {
      m.stages[stage].status = 'in_progress';
      m.stages[stage].startedAt = m.stages[stage].startedAt || now;
      m.currentStage = stage;
      m.currentState = 'in_progress';
      m.eventLog.push({ time: now, event: 'stage_started', stage });
      return m;
    });

    const stage0 = await this.readOptional(projectId, meta.stages['00']?.artifactPath);
    const stage05 = await this.readOptional(projectId, meta.stages['00.5']?.artifactPath);
    const decisions = meta.decisionHistory || [];
    const artifactPath = 'stages/01-增强提示词.md';
    const result = await this.buildPromptArtifact({ meta, stage0, stage05, decisions, generatedAt: now });
    const report = result.content;

    await projectService.writeFile(projectId, artifactPath, report);

    const updated = await projectService.updateMeta(projectId, (m) => {
      m.stages[stage].status = 'review_pending';
      m.stages[stage].artifactPath = artifactPath;
      m.currentStage = stage;
      m.currentState = 'review_pending';
      m.eventLog.push({
        time: new Date().toISOString(),
        event: 'artifact_generated',
        stage,
        artifactPath,
        source: result.source,
      });
      return m;
    });

    return {
      stage,
      state: updated.currentState,
      artifactPath,
      mock: result.mock,
      nextAction: {
        type: 'trigger_review',
        endpoint: `/api/projects/${projectId}/review/01`,
      },
    };
  }

  async readOptional(projectId, relativePath) {
    if (!relativePath) return '';
    try {
      return await projectService.readFile(projectId, relativePath);
    } catch {
      return '';
    }
  }

  async buildPromptArtifact({ meta, stage0, stage05, decisions, generatedAt }) {
    const decisionText = decisions.length
      ? decisions.map(d => `- ${d.stage || '-'}/${d.id}：${d.question || ''} → ${d.userChoiceLabel || d.userChoice || '已拍板'}`).join('\n')
      : '- 暂无拍板记录';

    // Extract differentiation from stage 0.5
    const diffOpps = extractSection(stage05, '差距与机会');
    const actionableAdvice = extractSection(stage05, '可落地建议');
    const competitorConclusions = extractSection(stage05, '执行摘要');

    if (!config.useMock) {
      const plan = stageOrchestratorService.getStagePlan('01');
      const systemPrompt = await stageOrchestratorService.buildSystemPrompt(
        '01',
        `You are a Stitch Prompt Engineer executing AIPM stage 01: prompt enhancement.

## enhance-prompt Skill Pipeline

### Step 1: Assess the Input
Evaluate what's missing from the product direction:
- Platform (web/mobile/desktop)?
- Page types needed?
- Visual style/direction?
- Color scheme?
- Key UI components?

### Step 2: Apply Enhancements
- Add specific UI/UX keywords (replace vague terms with proper component names)
- Amplify the vibe with descriptive adjectives
- Structure the page with numbered sections
- Format colors properly with hex codes
- Include competitive differentiation constraints

### Step 3: Format the Output
Structure as a design system + page structure document:

1. One-line description of the product purpose and vibe
2. DESIGN SYSTEM (REQUIRED): platform, theme, background, primary accent, text colors, additional design tokens
3. Page Structure: numbered sections with descriptions
4. Competitive Differentiation Constraints (from stage 0.5)
5. Downstream Stage Constraints (for PRD, wireframe, prototype)

## Key Requirements
- Must combine brainstorming direction + competitor differentiation into precise UI generation prompts
- Highlight how the product differs from competitors (NOT just another me-too product)
- All content in Chinese
- Output as clean Markdown document

Output ONLY the Markdown document, no review discussion or role dialogue.`
      );

      const result = await callClaude(
        systemPrompt,
        `项目：${meta.name}\n原始想法：${meta.idea}\n\n用户决策历史：\n${decisionText}\n\n阶段 0 产物全文：\n${stage0.slice(0, 3000)}\n\n阶段 0.5 竞品报告全文：\n${stage05.slice(0, 3000)}\n\n竞品差异化机会：\n${diffOpps.slice(0, 1000)}\n\n可落地建议：\n${actionableAdvice.slice(0, 800)}\n\n请按 enhance-prompt 技能的格式输出完整的 01-增强提示词.md，包含：上游输入摘要、用户拍板约束矩阵、竞品差异化结论、产品定位提示词（含设计系统定义）、给 PRD 的约束、给线框图的约束、给原型的约束、暂不做事项。所有内容用中文。只输出 Markdown。`,
        { maxTokens: 50000, timeout: 600000 }
      );
      if (result) {
        let cleaned = result;
        if (cleaned.startsWith('```markdown')) cleaned = cleaned.substring(11);
        else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
        if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
        cleaned = cleaned.trim();
        return { content: cleaned, source: plan?.source || 'skill-orchestrated-enhance-prompt', mock: false };
      }
    }

    // Fallback: deterministic prompt following enhance-prompt structure
    const isStudentJob = /大学生|兼职|岗位|结算|靠谱|信任|校园/.test(`${meta.idea}\n${stage0}\n${stage05}`);
    const positioning = isStudentJob
      ? '面向大学生的可信兼职匹配产品：不是拼岗位数量，而是先证明岗位真实、结算透明、时间可匹配，再让学生报名。'
      : `围绕「${meta.idea}」的首个高频场景，先把目标用户、可信价值和核心行动路径压缩到一个可验证 MVP。`;
    const primaryFlow = isStudentJob
      ? '理解可信度 → 筛选合适岗位 → 查看岗位与雇主证据 → 快速报名 → 获得明确反馈'
      : '理解产品价值 → 查看核心信息 → 完成首个行动 → 获得明确反馈';
    const visualTone = isStudentJob ? '年轻、清爽、可信、不过度社交化' : '清晰、克制、便于快速理解';

    const decisionLines = decisions.length
      ? decisions.map(d => `| ${d.stage || '-'} | ${d.id} | ${d.question || '阶段决策'} | ${d.userChoiceLabel || d.userChoice || '已拍板'} | ${(d.affectsStages || []).join(', ') || '01-04'} |`).join('\n')
      : '| - | - | 暂无用户拍板记录 | 按阶段 0 与 0.5 的默认结论推进 | 01-04 |';

    return {
      content: `# 01-增强提示词
> 生成时间：${generatedAt}
> 主导角色：周明
> 调用技能：enhance-prompt

## 一、上游输入摘要

- **项目**：${meta.name}
- **原始想法**：${meta.idea}
- **阶段 0 产物长度**：${stage0.length} 字符
- **阶段 0.5 竞品报告长度**：${stage05.length} 字符

${stage0 ? `### 阶段 0 核心内容\n${stage0.split('\\n').slice(0, 15).join('\\n')}` : '阶段 0 产物暂不可用。'}

## 二、用户拍板约束矩阵

| 阶段 | 决策 ID | 问题 | 用户选择 | 影响阶段 |
|---|---|---|---|---|
${decisionLines}

## 三、竞品差异化结论

${competitorConclusions ? competitorConclusions.split('\\n').slice(0, 10).join('\\n') : '暂无可解析竞品结论。'}

**差异化机会**：
${diffOpps ? diffOpps.split('\\n').slice(0, 8).join('\\n') : '暂无可解析差异化机会。'}

**可落地建议**：
${actionableAdvice ? actionableAdvice.split('\\n').slice(0, 6).join('\\n') : '暂无可解析建议。'}

## 四、产品定位提示词

请将产品定位为：

> ${positioning}

核心路径必须保持为：

> ${primaryFlow}

**DESIGN SYSTEM (REQUIRED):**
- Platform: Mobile, Mobile-first
- Theme: Light, ${visualTone}
- Background: Clean White (#ffffff)
- Surface: Soft Gray (#f9fafb) for cards
- Primary Accent: ${isStudentJob ? 'Trust Blue' : 'Brand Blue'} (#2563eb) for primary buttons and links
- Secondary Accent: ${isStudentJob ? 'Success Green (#22c55e) for trust indicators' : 'Neutral Gray (#6b7280) for secondary text'}
- Text Primary: Near Black (#111827) for headings
- Text Secondary: Medium Gray (#6b7280) for labels
- Buttons: Subtly rounded (8px), full-width on mobile
- Cards: Gently rounded (12px), soft shadow for elevation
${isStudentJob ? '- Trust Badge: Verified Green (#22c55e) with check icon' : ''}

生成后续产物时，不要泛泛罗列功能；每个页面、功能和交互都必须服务于这条路径。

## 五、给阶段 2 PRD 的生成约束

- 必须写清目标用户、首个高频场景、核心痛点和首版边界
- 必须引用阶段 0.5 的竞品缺口，把它转成产品原则
- 必须把用户拍板写成「约束」，不能被后续阶段覆盖
- 必须区分 P0 / P1 / Non-goals，避免功能堆叠
- PRD 必须包含：Executive Summary、User Stories（As a... I want... so that...）、Acceptance Criteria、非功能需求、风险分析
- 必须列出可评审争议点，方便五人圆桌继续挑战

## 六、给阶段 3 线框图的生成约束

- 页面结构必须覆盖：首页 / 列表或搜索 / 详情 / 表单 / 成功或记录页
- 每个关键页面必须写清空态、加载、错误、成功态
- 首屏必须表达差异化理由，不能只放功能入口
- 如果涉及信任、安全、审核、结算或评价，这些信息必须前置到首页和详情页
- 线框图必须包含：信息架构图、页面清单（含核心页面线框）、组件状态表、交互规则
- 必须实现所有导航路径和状态转场

## 七、给阶段 4 高保真原型的生成约束

- 必须输出单个 HTML 文件，CSS 在 \`<style>\`，JS 在 \`<script>\`
- 必须有真实可点击交互：筛选、打开详情、提交表单、成功反馈
- 必须有真实感 mock 数据，不使用 lorem ipsum
- 必须能在浏览器直接打开，不依赖构建工具
- 原型要体现阶段 0.5 的差异化结论和用户拍板
- 必须遵循线框图规范，不偏离指定的用户流程
- 全中文界面

## 八、暂不做事项

- 不为了显得完整而扩展复杂后台、复杂 IM、支付闭环或多角色管理
- 不承诺当前原型无法履约的保障能力
- 不把评审会分歧静默吞掉；关键不可逆选择继续交给用户拍板
- 不做"又一个同质化产品"——每个设计决策必须体现差异化
`,
      source: 'deterministic-enhance-prompt',
      mock: true,
    };
  }
}

function extractSection(content, heading) {
  if (!content) return '';
  const start = content.indexOf(`## ${heading}`);
  if (start < 0) {
    // Try without ##
    const altStart = content.indexOf(heading);
    if (altStart < 0) return '';
    return content.slice(altStart);
  }
  const next = content.indexOf('\n## ', start + 4);
  return content.slice(start, next > start ? next : content.length);
}

export const promptService = new PromptService();
