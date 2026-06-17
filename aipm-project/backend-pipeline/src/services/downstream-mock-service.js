/**
 * 下游阶段 Service (Stage 02/03/04)
 * Stage 02 → prd skill: 严格 PRD Schema
 * Stage 03 → wireframe-prototyping skill: 信息架构 + 页面线框 + 交互规范
 * Stage 04 → designPM-ZJY skill: 高保真可交互 HTML 原型
 */

import { projectService } from './project-service.js';
import { Errors } from '../utils/errors.js';
import { config } from '../config.js';
import { callClaude } from './claude-service.js';
import { stageOrchestratorService } from './stage-orchestrator-service.js';
import { searchProductImages, searchPexels } from './pexels-service.js';

const STAGE_CONFIG = {
  '02': { artifactPath: 'stages/02-产品需求文档.md', source: 'skill-orchestrated-prd' },
  '03': { artifactPath: 'stages/03-线框图与交互规范.md', source: 'skill-orchestrated-wireframe' },
  '04': { artifactPath: 'stages/04-UI交互原型.html', source: 'skill-orchestrated-frontend-design' },
};

// ─── Skill-specific system prompts ───

const STAGE_INSTRUCTIONS = {
  '02': `You are executing AIPM stage 2: PRD generation, following the prd skill strictly.

## PRD Strict Schema (MUST follow exactly):

### 1. Executive Summary
- Problem Statement: 1-2 sentences on the pain point
- Proposed Solution: 1-2 sentences on the fix
- Success Criteria: 3-5 measurable KPIs

### 2. User Experience & Functionality
- User Personas: Who is this for?
- User Stories: As a [user], I want to [action] so that [benefit]
- Acceptance Criteria: Bulleted "Done" definitions for each story
- Non-Goals: What are we NOT building?

### 3. AI System Requirements (If Applicable)
- Tool Requirements, Evaluation Strategy

### 4. Technical Specifications
- Architecture Overview, Integration Points, Security & Privacy

### 5. Risks & Roadmap
- Phased Rollout: MVP -> v1.1 -> v2.0
- Technical Risks: Latency, cost, or dependency failures

## Quality Standards:
- Use concrete, measurable criteria. Avoid "fast", "easy", "intuitive"
- Define testing for AI systems
- Do NOT hallucinate constraints - label as TBD if unspecified

Output ONLY Markdown, no review discussion or role dialogue. All content in Chinese.`,

  '03': `You are executing AIPM stage 3: Wireframe and Interaction Specification, following the wireframe-prototyping skill strictly.

## Required Output Structure:

### 1. 全局设计原则
- Core commitment, visual direction, differentiation constraint, user decisions

### 2. 信息架构 (Information Architecture)
- Navigation structure, page hierarchy, data flow between pages

### 3. 页面清单与线框 (Page Inventory with ASCII Wireframes)
- For EACH page: name, purpose, ASCII wireframe, key components
- Must cover: Home, List/Search, Detail, Form, Success/Records

### 4. 组件状态表 (Component State Table)
- Component | States | Rules for state transitions

### 5. 交互规则 (Interaction Rules)
- Click/tap behaviors, navigation flows, form validation
- User action → System response → UI update → Next state

### 6. 页面状态 (Page States)
- Empty state, Loading state, Error state, Success state for each page

### 7. 响应式行为 (Responsive Behavior)
- Desktop/tablet/mobile adaptations

### 8. 给 Stage 4 的实现约束 (Constraints for Stage 4)
- Must implement as single HTML file
- Must have real clickable interactions
- Must use mock data, no lorem ipsum
- All interactions from this spec must be implemented

## Wireframe Principles:
- Start with medium fidelity
- Include edge cases (empty states, errors)
- Document interaction flows precisely
- Mobile-first wireframes

Output ONLY Markdown, no review discussion or role dialogue. All content in Chinese.`,

  '04': `You are executing AIPM stage 4: High-fidelity Interactive HTML Prototype, following the frontend-design skill strictly.

## Design Thinking (MANDATORY — do this before writing any code)

Before coding, you MUST commit to a BOLD aesthetic direction:
- **Purpose**: Read from the project context provided in the user message
- **Tone**: Choose an extreme aesthetic direction that fits this product. NOT generic. Be specific. Examples: editorial/magazine, organic/natural, playful/toy-like, warm/bookish, brutalist/raw, art deco/geometric, soft/pastel, luxury/refined
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

## Frontend Aesthetics Guidelines (MUST follow):

1. **Typography**: Choose distinctive, beautiful fonts. NEVER use generic fonts like Arial, Inter, Roboto, or system-ui. Use Google Fonts CDN. Pair a distinctive display font with a refined body font.
2. **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables. Dominant colors with sharp accents. NO timid evenly-distributed palettes. NO cliched purple gradients on white.
3. **Motion**: Add animations and micro-interactions. CSS-only solutions preferred. Page load with staggered reveals. Hover states that surprise. Smooth transitions.
4. **Spatial Composition**: Unexpected layouts. Asymmetry where appropriate. Overlap. Grid-breaking elements. Generous negative space OR controlled density.
5. **Backgrounds & Visual Details**: Create atmosphere and depth. Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, grain overlays. NEVER default to solid backgrounds.

## CRITICAL Anti-Pattern Rules:
- NEVER use generic AI aesthetics (Inter/Roboto/Arial, purple gradients on white, predictable layouts)
- NEVER converge on common choices like Space Grotesk
- NEVER produce cookie-cutter design that lacks context-specific character

## Technical Requirements:
1. SINGLE self-contained HTML file with ALL CSS in <style> and ALL JS in <script>
2. Google Fonts CDN allowed for typography
3. Pexels images provided in context — USE THEM for hero images, item cards, trust sections
4. Every button clickable, every form functional, all states visualized
5. Real mock data, Chinese UI, bottom navigation
6. Demo-quality: smooth animations, professional polish
7. Must implement all interactions from Stage 3 wireframe spec

## Must-have interactions:
- Bottom navigation (首页/列表/我的)
- Card click → detail view with Pexels images
- Filter/search functionality
- Form submission with validation
- Success feedback after action
- Empty/loading states with visual polish

Output ONLY the HTML file, no explanations. Start with <!DOCTYPE html>.`,
};

export class DownstreamMockService {
  async generateArtifact(projectId, stage) {
    const stageCfg = STAGE_CONFIG[stage];
    if (!stageCfg) throw Errors.invalidInput(`阶段 ${stage} 暂不支持执行`);

    const meta = await projectService.getMeta(projectId);
    if (!meta.stages[stage]) throw Errors.invalidInput(`阶段 ${stage} 不存在`);

    const now = new Date().toISOString();
    await projectService.updateMeta(projectId, (m) => {
      m.stages[stage].status = 'in_progress';
      m.stages[stage].startedAt = m.stages[stage].startedAt || now;
      m.currentStage = stage;
      m.currentState = 'in_progress';
      m.eventLog.push({ time: now, event: 'stage_started', stage });
      return m;
    });

    const latest = await projectService.getMeta(projectId);
    const context = await this.buildContext(projectId, latest);
    const result = await this.renderStageWithClaude(stage, latest, context, now, projectId);
    const content = result.content;

    await projectService.writeFile(projectId, stageCfg.artifactPath, content);
    const updated = await projectService.updateMeta(projectId, (m) => {
      m.stages[stage].status = 'review_pending';
      m.stages[stage].artifactPath = stageCfg.artifactPath;
      m.currentStage = stage;
      m.currentState = 'review_pending';
      m.eventLog.push({
        time: new Date().toISOString(),
        event: 'artifact_generated',
        stage,
        artifactPath: stageCfg.artifactPath,
        source: result.source,
      });
      return m;
    });

    return {
      stage,
      state: updated.currentState,
      artifactPath: stageCfg.artifactPath,
      mock: result.mock,
      deterministic: result.deterministic,
      nextAction: {
        type: 'trigger_review',
        endpoint: `/api/projects/${projectId}/review/${stage}`,
      },
    };
  }

  async buildContext(projectId, meta) {
    const read = async (stage) => this.readOptional(projectId, meta.stages[stage]?.artifactPath);
    const stage0 = await read('00');
    const stage05 = await read('00.5');
    const stage01 = await read('01');
    const stage02 = await read('02');
    const stage03 = await read('03');
    const product = this.inferProduct(meta, `${meta.idea}\n${stage0}\n${stage05}\n${stage01}`);
    const decisionConstraints = this.buildDecisionConstraints(meta.decisionHistory || []);
    const competitorSignals = this.extractCompetitorSignals(stage05);
    const stage1Blueprint = this.extractStage1Blueprint(stage01);

    // Pexels image search for Stage 04
    let pexelsContext = '';
    try {
      const images = await searchProductImages(product);
      const formatImages = (arr, label) => arr.length
        ? `${label}:\n${arr.map(img => `  - ${img.src} (alt: ${img.alt}, photographer: ${img.photographer})`).join('\n')}`
        : `${label}: (无结果)`;
      pexelsContext = [
        formatImages(images.hero || [], 'Hero/首页大图'),
        formatImages(images.items || [], '内容卡片图'),
        formatImages(images.trust || [], '信任/证据区图'),
        formatImages(images.empty || [], '空态图'),
      ].join('\n\n');

      // Save data snapshot
      await projectService.writeFile(
        projectId,
        'data-snapshots/04-pexels-results.json',
        JSON.stringify({ images, searchedAt: new Date().toISOString() }, null, 2)
      );
    } catch (err) {
      console.warn('Pexels search failed:', err.message);
      pexelsContext = '（Pexels 图片搜索失败，请用 CSS 渐变、SVG 图案和 emoji 代替）';
    }

    return {
      stage0, stage05, stage01, stage02, stage03,
      product, decisions: meta.decisionHistory || [],
      decisionConstraints, competitorSignals, stage1Blueprint,
      pexelsContext,
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

  inferProduct(meta, text) {
    const isStudentJob = /大学生|校园|兼职|岗位|结算|靠谱|信任|雇主|报名|二手书|教材|交换/.test(text);
    if (isStudentJob) {
      const isBookExchange = /二手书|教材|交换|买卖书/.test(text);
      if (isBookExchange) {
        return {
          name: '校园二手书交换平台',
          oneLiner: '让大学生方便地买卖二手教材和课外读物，比闲鱼更懂校园场景。',
          user: '需要买卖二手教材的大学生',
          scenario: '开学买教材太贵、期末卖书没人要，想在同校快速完成交易',
          problem: '教材价格高、闲鱼/转转不够校园化、同校交易不方便',
          differentiator: '聚焦校园场景：同校面交、专业匹配推荐、课程关联',
          promise: '同校同学之间方便地买卖二手教材',
          primaryFlow: '浏览/搜索教材 → 查看书籍详情和卖家信息 → 发布/购买 → 线下交接',
          trustFeatures: ['同校实名认证', '专业课程关联', '书籍真实照片', '交易评价'],
          mvpScope: ['教材首页', '搜索筛选', '书籍详情', '发布卖书', '购买/留言', '我的书架'],
          nonGoals: ['支付闭环', '跨校物流', '电子书', '复杂IM聊天'],
          visualTone: '年轻、清爽、书卷气、信任感',
        };
      }
      return {
        name: '靠谱校园兼职平台',
        oneLiner: '帮大学生先确认岗位靠谱，再快速找到适合课表的兼职机会。',
        user: '需要安全、透明、时间匹配的大学生',
        scenario: '课余时间想找日结/周末兼职，但担心虚假岗位、结算不透明和通勤浪费时间',
        problem: '兼职信息真假难辨、结算不确定、通勤和时间成本不可控',
        differentiator: '把岗位审核、雇主实名、结算说明和同校评价前置为报名前的信任证据',
        promise: '先证明岗位靠谱，再让学生报名',
        primaryFlow: '理解可信度 → 筛选合适岗位 → 查看岗位与雇主证据 → 快速报名 → 获得明确反馈',
        trustFeatures: ['岗位五重审核', '雇主实名与评分', '结算保障说明', '同校学生评价'],
        mvpScope: ['可信岗位首页', '岗位筛选', '岗位详情', '快速报名', '报名成功反馈', '报名记录'],
        nonGoals: ['复杂 IM 聊天', '资金托管闭环', '面向全社会招聘', '雇主后台全量管理'],
        visualTone: '年轻、清爽、可信、不过度社交化',
      };
    }

    return {
      name: meta.name || '新产品',
      oneLiner: meta.idea || '围绕首个高频场景的新产品',
      user: '首批目标用户',
      scenario: '用户遇到当前替代方案体验不完整的场景',
      problem: meta.idea || '当前替代方案体验不完整',
      differentiator: '用更清晰的核心路径和更少的操作完成首个关键任务',
      promise: '让用户更快理解价值并完成核心行动',
      primaryFlow: '进入首页 → 理解价值 → 查看核心信息 → 完成首个行动 → 获得反馈',
      trustFeatures: ['核心价值说明', '成功案例', '风险提示', '明确行动入口'],
      mvpScope: ['首页', '核心列表', '详情页', '行动表单', '成功反馈'],
      nonGoals: ['复杂后台', '多角色权限', '支付闭环', '过度个性化'],
      visualTone: '清晰、克制、便于快速理解',
    };
  }

  buildDecisionConstraints(decisions) {
    if (!decisions.length) {
      return ['暂无用户拍板记录；按阶段 0 与 0.5 的默认结论推进。'];
    }
    return decisions.map((d) => {
      const choice = d.userChoiceLabel || d.userChoice || '已拍板';
      const affects = (d.affectsStages || []).length ? `；影响阶段：${d.affectsStages.join('、')}` : '';
      return `${d.stage || '-'} / ${d.id}：${d.question || '阶段决策'} → ${choice}${affects}`;
    });
  }

  extractCompetitorSignals(stage05) {
    const conclusions = extractNumberedSection(stage05, '执行摘要')
      .map(line => line.replace(/^\d+\.\s*/, ''));
    const competitors = extractTableRows(stage05, '竞品概览表')
      .slice(0, 4)
      .map(row => `${row[1] || '竞品'}：${row[4] || row[2] || '需要后续转化为差异化约束'}`);
    const gaps = extractBullets(stage05, '数据缺口').slice(0, 4);
    return {
      conclusions: conclusions.length ? conclusions : ['竞品结论不可解析。'],
      competitors: competitors.length ? competitors : ['暂无可解析竞品表格。'],
      gaps: gaps.length ? gaps : ['暂无明确数据缺口。'],
    };
  }

  extractStage1Blueprint(stage01) {
    return {
      positioning: extractSection(stage01, '产品定位提示词').trim(),
      prdConstraints: extractBullets(stage01, '给阶段 2 PRD 的生成约束'),
      wireframeConstraints: extractBullets(stage01, '给阶段 3 线框图的生成约束'),
      prototypeConstraints: extractBullets(stage01, '给阶段 4 高保真原型的生成约束'),
      nonGoals: extractBullets(stage01, '暂不做事项'),
    };
  }

  async renderStageWithClaude(stage, meta, context, generatedAt, projectId) {
    const { product, decisionConstraints, competitorSignals, stage01, stage02, stage0, stage05, pexelsContext } = context;
    const instruction = STAGE_INSTRUCTIONS[stage];

    // Build context-aware user message per stage
    const userMessages = {
      '02': `项目：${meta.name}\n想法：${meta.idea}\n\n决策约束：\n${decisionConstraints.join('\n')}\n\n竞品结论：\n${competitorSignals.conclusions.join('\n')}\n\n增强提示词全文：\n${stage01.slice(0, 4000)}\n\n阶段 0 产物：\n${stage0.slice(0, 2000)}\n\n请严格按照 prd 技能的 PRD Schema 输出完整的产品需求文档。必须包含：Executive Summary、User Experience & Functionality（含 User Stories 和 Acceptance Criteria）、Technical Specifications、Risks & Roadmap。所有内容用中文。只输出 Markdown。`,

      '03': `项目：${meta.name}\n想法：${meta.idea}\n产品一句话：${product.oneLiner}\n核心路径：${product.primaryFlow}\n信任特性：${product.trustFeatures.join('、')}\n视觉方向：${product.visualTone}\n\n增强提示词全文：\n${stage01.slice(0, 4000)}\n\nPRD 全文：\n${stage02.slice(0, 4000)}\n\n决策约束：\n${decisionConstraints.join('\n')}\n\n请严格按照 wireframe-prototyping 技能输出完整的线框图与交互规范。必须包含：信息架构、页面清单（含 ASCII 线框）、组件状态表、交互规则、页面状态、响应式行为、Stage 4 实现约束。所有内容用中文。只输出 Markdown。`,

      '04': `项目：${meta.name}\n产品一句话：${product.oneLiner}\n核心路径：${product.primaryFlow}\n信任特性：${product.trustFeatures.join('、')}\n视觉方向：${product.visualTone}\nMVP 功能：${product.mvpScope.join('、')}\n\n增强提示词：\n${stage01.slice(0, 2000)}\n\nPRD 全文：\n${stage02.slice(0, 3000)}\n\nPexels 图片资源（务必在原型中使用这些真实图片 URL）：\n${context.pexelsContext || '（未获取到 Pexels 图片，请用 CSS 渐变和 SVG 代替）'}\n\n请严格按照 frontend-design 技能输出高保真可交互 HTML 原型。要求：选择大胆独特的美学方向、使用真实 Pexels 图片、独特字体（Google Fonts CDN）、精心设计的动画、非通用布局、全中文界面。只输出 HTML，不要任何解释。`,
    };

    if (!config.useMock && instruction) {
      try {
        const systemPrompt = await stageOrchestratorService.buildSystemPrompt(stage, instruction);
        const maxTokens = stage === '04' ? 65000 : 50000;
        const timeout = stage === '04' ? 900000 : 600000;

        const result = await callClaude(
          systemPrompt,
          userMessages[stage],
          { maxTokens, timeout }
        );

        if (result) {
          let cleaned = result;
          if (cleaned.startsWith('```html')) cleaned = cleaned.substring(7);
          else if (cleaned.startsWith('```HTML')) cleaned = cleaned.substring(7);
          else if (cleaned.startsWith('```markdown')) cleaned = cleaned.substring(12);
          else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
          if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
          cleaned = cleaned.trim();

          // For stage 04, ensure it starts with <!DOCTYPE html>
          if (stage === '04' && !cleaned.startsWith('<!DOCTYPE')) {
            const htmlIdx = cleaned.indexOf('<!DOCTYPE');
            if (htmlIdx >= 0) cleaned = cleaned.slice(htmlIdx);
          }

          return {
            content: cleaned,
            source: STAGE_CONFIG[stage].source,
            mock: false,
            deterministic: false,
          };
        }
      } catch (err) {
        console.warn(`Claude generation failed for stage ${stage} (attempt 1), retrying...:`, err.message);
        // Retry up to 2 more times
        for (let attempt = 2; attempt <= 3; attempt++) {
          try {
            const systemPrompt = await stageOrchestratorService.buildSystemPrompt(stage, instruction);
            const maxTokens = stage === '04' ? 65000 : 50000;
            const timeout = stage === '04' ? 900000 : 600000;
            const retryResult = await callClaude(systemPrompt, userMessages[stage], { maxTokens, timeout });
            if (retryResult) {
              let cleaned = retryResult;
              if (cleaned.startsWith('```html')) cleaned = cleaned.substring(7);
              else if (cleaned.startsWith('```HTML')) cleaned = cleaned.substring(7);
              else if (cleaned.startsWith('```markdown')) cleaned = cleaned.substring(12);
              else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
              if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
              cleaned = cleaned.trim();
              if (stage === '04' && !cleaned.startsWith('<!DOCTYPE')) {
                const htmlIdx = cleaned.indexOf('<!DOCTYPE');
                if (htmlIdx >= 0) cleaned = cleaned.slice(htmlIdx);
              }
              console.log(`Stage ${stage} retry attempt ${attempt} succeeded`);
              return { content: cleaned, source: STAGE_CONFIG[stage].source, mock: false, deterministic: false };
            }
          } catch (retryErr) {
            console.warn(`Claude generation failed for stage ${stage} (attempt ${attempt}):`, retryErr.message);
          }
        }
        throw new Error(`Stage ${stage} generation failed after 3 attempts: ${err.message}`);
      }
    }

    // Mock mode or no instruction: deterministic fallback
    const pexelsImages = context.pexelsContext ? await this.loadPexelsFromSnapshot(projectId) : null;
    return {
      content: await this.renderFallback(stage, meta, { ...context, pexelsImages }, generatedAt),
      source: `deterministic-${stage === '02' ? 'prd' : stage === '03' ? 'wireframe' : 'prototype'}`,
      mock: true,
      deterministic: true,
    };
  }

  async loadPexelsFromSnapshot(projectId) {
    try {
      const content = await projectService.readFile(projectId, 'data-snapshots/04-pexels-results.json');
      const data = JSON.parse(content);
      return data.images || null;
    } catch {
      return null;
    }
  }

  async renderFallback(stage, meta, context, generatedAt) {
    if (stage === '02') return this.renderPrdFallback(meta, context, generatedAt);
    if (stage === '03') return this.renderWireframeFallback(meta, context, generatedAt);
    return await this.renderPrototypeFallback(meta, context, generatedAt);
  }

  renderPrdFallback(meta, context, generatedAt) {
    const { product, decisionConstraints, competitorSignals, stage1Blueprint } = context;
    return `# 02-产品需求文档
> 生成时间：${generatedAt}
> 调用技能：prd

## 1. Executive Summary

**Problem Statement**: ${product.problem}
**Proposed Solution**: ${product.differentiator}
**Success Criteria**:
- 首版 DAU 达到 500+
- 首屏 30 秒内用户能理解核心价值
- 核心流程完成率 >= 40%
- 用户满意度 >= 4.0/5.0

## 2. User Experience & Functionality

### User Personas
- **主要用户**：${product.user}
- **核心场景**：${product.scenario}

### User Stories

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-01 | As a ${product.user}, I want to 浏览/搜索核心内容 so that I can 快速找到我需要的 | P0 | 搜索结果 200ms 内返回；列表可滚动加载 |
| US-02 | As a ${product.user}, I want to 查看详情信息 so that I can 做出决策 | P0 | 详情页包含所有决策必需信息 |
| US-03 | As a ${product.user}, I want to 完成核心行动 so that I can 获得结果 | P0 | 表单 60 秒内可提交，有校验 |
| US-04 | As a ${product.user}, I want to 查看行动记录 so that I can 追踪状态 | P1 | 记录页展示历史和状态 |

### Non-Goals
${toBulletList(product.nonGoals)}

## 3. 竞品缺口与产品机会

${toBulletList(competitorSignals.conclusions)}

## 4. 功能需求

### P0 MVP
${toBulletList(product.mvpScope)}

### P1 可延后
- 更完整的评价体系
- 消息中心与提醒
- 个性化推荐
- 运营后台

### Non-goals
${toBulletList(product.nonGoals)}

## 5. 技术规格

- **前端**：移动端优先，响应式设计
- **数据**：首版使用 mock 数据，接口预留
- **安全**：最小化个人信息采集，明确用途说明

## 6. 风险与路线图

### Phased Rollout
- **MVP (v0.1)**：核心浏览→详情→行动流程
- **v1.1**：评价体系、消息通知
- **v2.0**：个性化推荐、运营工具

### Technical Risks
- 冷启动供给不足 → 首版使用精选内容
- 信任机制运营成本 → 先做展示层，后做真实审核
`;
  }

  renderWireframeFallback(meta, context, generatedAt) {
    const { product, decisionConstraints } = context;
    return `# 03-线框图与交互规范
> 生成时间：${generatedAt}
> 调用技能：wireframe-prototyping

## 1. 全局设计原则

- **核心承诺**：${product.promise}
- **视觉方向**：${product.visualTone}
- **差异化约束**：${product.differentiator}

## 2. 信息架构

主导航：首页 / 列表 / 我的

页面层级：
- 首页（Hero + 推荐 + 筛选入口）
  - 列表页（筛选 + 卡片列表）
    - 详情页（信息 + 证据 + CTA）
      - 表单页（行动 + 校验）
        - 成功页（反馈 + 记录入口）
- 我的（记录 + 设置）

## 3. 首页线框

\`\`\`
┌──────────────────────────┐
│ 定位/上下文 + 搜索入口    │
├──────────────────────────┤
│ Hero: ${product.promise}  │
│ 信任证据区 (3 个标签)     │
├──────────────────────────┤
│ 筛选 Chips                │
├──────────────────────────┤
│ 卡片 1: 标题 + 元信息     │
│ 卡片 2: 标题 + 元信息     │
│ 卡片 3: 标题 + 元信息     │
└──────────────────────────┘
│ 底部导航: 首页/列表/我的  │
\`\`\`

## 4. 详情页线框

\`\`\`
┌──────────────────────────┐
│ 返回 + 标题              │
├──────────────────────────┤
│ 核心信息区               │
│ 元信息 (价格/距离/时间)  │
├──────────────────────────┤
│ 信任/证明区              │
│ ✅ 审核状态              │
│ 🛡 保障说明              │
├──────────────────────────┤
│ 详情说明 + 风险边界      │
├──────────────────────────┤
│ [固定底部 CTA]           │
\`\`\`

## 5. 组件状态表

| 组件 | 状态 | 规则 |
|---|---|---|
| 筛选 Chip | 默认/选中 | 选中后列表内容更新 |
| 内容卡片 | 默认/点击 | 点击打开详情 |
| 固定 CTA | 默认/禁用/提交中 | 表单校验决定状态 |
| 成功反馈 | 成功 | 明确下一步 |

## 6. 交互规则

1. 首页卡片点击 → 展开详情面板
2. 详情面板 CTA 点击 → 显示表单
3. 表单提交 → 校验 → 成功反馈
4. 成功反馈 → 可返回首页或查看记录
5. 底部导航切换页面视图

## 7. 页面状态

| 页面 | 空态 | 加载态 | 错误态 |
|---|---|---|---|
| 列表 | "暂无内容，试试调整筛选" | 骨架屏 | "加载失败，点击重试" |
| 详情 | - | 骨架屏 | "内容不可用" |
| 表单 | - | - | 保留输入，提示错误 |
| 记录 | "还没有记录" | 骨架屏 | "加载失败" |

## 8. 给 Stage 4 的实现约束

- 单 HTML 文件，内联 CSS 和 JS
- 必须实现所有交互流程
- 必须有真实 mock 数据
- 全中文界面
- 底部 3 tab 导航
`;
  }

  async renderPrototypeFallback(meta, context, generatedAt) {
    const { product, decisionConstraints, pexelsImages } = context;
    const isBookExchange = /二手书|教材|交换|买卖书/.test(meta.idea || '');
    const heroImg = (pexelsImages && pexelsImages.hero && pexelsImages.hero.length > 0)
      ? pexelsImages.hero[0].src : '';
    const itemImgs = (pexelsImages && pexelsImages.items)
      ? pexelsImages.items.slice(0, 3).map(img => img.src) : [];

    const items = isBookExchange
      ? [
          { id: 'book1', title: '高等数学（同济七版）上册', price: '15元', distance: '同校', time: '九成新', tag: '卖家实名 · 真实照片', detail: '大一高数课本，有少量笔记和划线，不影响阅读。', risk: '同校面交，可验货后付款', img: itemImgs[0] || '' },
          { id: 'book2', title: '大学英语综合教程4', price: '12元', distance: '东区宿舍', time: '八成新', tag: '同专业 5 人推荐', detail: '四级必备教材，含练习册。', risk: '当面交易，可翻阅确认', img: itemImgs[1] || '' },
          { id: 'book3', title: '数据结构与算法分析', price: '20元', distance: '南区', time: '全新未拆', tag: '课程关联推荐', detail: '计算机专业核心课教材，买错版本所以全新出。', risk: '全新未拆封，可当面拆验', img: itemImgs[2] || '' },
        ]
      : [
          { id: 'job1', title: '图书馆活动协助', price: '120元/天', distance: '1.2km', time: '周六 4h', tag: '雇主实名 · 结算完整', detail: '协助入场签到、资料整理。', risk: '现场负责人已完成平台实名。', img: itemImgs[0] || '' },
          { id: 'job2', title: '校园咖啡推广', price: '25元/时', distance: '校内', time: '可选班次', tag: '同校 18 条评价', detail: '在校园活动点位进行试饮引导。', risk: '校内工作，评价集中在"结算准时"。', img: itemImgs[1] || '' },
          { id: 'job3', title: '展会签到协助', price: '180元/天', distance: '地铁直达', time: '次日结算', tag: '平台审核通过', detail: '负责展会观众签到和基础引导。', risk: '通勤约 35 分钟，需确认课程时间。', img: itemImgs[2] || '' },
        ];

    const serializedItems = JSON.stringify(items).replace(/</g, '\\u003c');
    const appTitle = isBookExchange ? '校园二手书' : product.name;
    const heroTitle = isBookExchange ? '同校同学间买卖二手教材' : product.promise;
    const heroSubtitle = isBookExchange ? '比闲鱼更懂校园场景' : product.oneLiner;
    const filterAll = isBookExchange ? '全部教材' : '全部靠谱';
    const filter1 = isBookExchange ? '专业课' : '近距离';
    const filter2 = isBookExchange ? '低价优先' : '日结';
    const filter3 = isBookExchange ? '九成新+' : '周末';
    const ctaText = isBookExchange ? '我想买' : '我要报名';
    const successMsg = isBookExchange ? '联系成功！已通知卖家，请留意消息。' : '报名成功！已加入报名记录，等待雇主联系。';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${appTitle} - 交互原型</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Noto Sans SC",system-ui,sans-serif;background:#efe9dd;color:#1f2933}
.page{min-height:100vh;display:grid;place-items:center;padding:16px}
.app{width:min(430px,100%);min-height:780px;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 28px 80px rgba(39,29,17,.22);position:relative}
.hero{padding:24px 20px 18px;background:linear-gradient(145deg,#163d35,#245447);color:#fff;position:relative;overflow:hidden}
.hero-bg{position:absolute;inset:0;opacity:.25;background-size:cover;background-position:center;filter:blur(2px)}
.location{font-size:13px;opacity:.78}
.hero h1{font-size:26px;line-height:1.18;margin:10px 0 8px}
.hero p{opacity:.86;line-height:1.6;font-size:15px}
.proof{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.proof div{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:9px;font-size:12px}
.proof b{display:block;font-size:15px;margin-top:3px}
.filters{display:flex;gap:8px;overflow:auto;padding:13px 16px}
.chip{border:0;border-radius:999px;padding:9px 12px;font-weight:700;white-space:nowrap;cursor:pointer;background:#efe6d1;color:#594b34}
.chip.active{background:#d8a63d;color:#1f1608}
.list{padding:0 16px 92px}
.card{border:1px solid #e5ddcd;border-radius:16px;padding:15px;margin-bottom:12px;background:#fff;box-shadow:0 8px 18px rgba(31,41,51,.06);cursor:pointer;transition:transform .15s;display:flex;gap:12px}
.card:hover{transform:translateY(-2px)}
.card-img{width:72px;height:72px;border-radius:10px;object-fit:cover;flex-shrink:0}
.card-img-placeholder{width:72px;height:72px;border-radius:10px;background:linear-gradient(135deg,#e8e0d0,#d4cbb8);flex-shrink:0;display:grid;place-items:center;font-size:28px}
.card-body{flex:1;min-width:0}
.card h3{margin:0 0 8px;font-size:17px}
.meta{display:flex;gap:8px;flex-wrap:wrap;color:#606f7b;font-size:13px}
.badge{margin-top:10px;display:inline-block;background:#e8f4ee;color:#176044;padding:5px 9px;border-radius:8px;font-size:12px;font-weight:800}
.bottom{position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #eee;display:grid;grid-template-columns:repeat(3,1fr);padding:10px 8px}
.bottom button{border:0;background:transparent;padding:8px;color:#607080;font-weight:800;cursor:pointer;font-size:14px}
.bottom button.active{color:#1d6b51}
.panel{position:absolute;inset:auto 0 0 0;max-height:78%;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.22);padding:20px;transform:translateY(110%);transition:.28s ease;overflow:auto;z-index:10}
.panel.show{transform:translateY(0)}
.panel h2{margin:0 0 8px;font-size:20px}
.x{float:right;border:0;background:#f0eee8;border-radius:999px;width:34px;height:34px;font-size:18px;cursor:pointer}
.trust{display:grid;gap:8px;margin:14px 0}
.trust div{border:1px solid #e5ddcd;background:#fbf8f0;border-radius:12px;padding:11px;font-size:14px}
.primary{width:100%;border:0;border-radius:14px;background:#d8a63d;color:#211608;padding:14px 16px;font-size:16px;font-weight:900;cursor:pointer;margin-top:8px}
.primary:hover{opacity:.92}
.form{display:none;margin-top:14px}.form.show{display:grid;gap:10px}
.form input,.form select{width:100%;border:1px solid #d9d2c4;border-radius:12px;padding:12px;font-size:15px;outline:none}
.form input:focus,.form select:focus{border-color:#d8a63d}
.success{display:none;text-align:center;padding:18px;background:#e8f4ee;border-radius:14px;color:#176044;font-weight:900;margin-top:10px}
.success.show{display:block}
.empty{padding:42px 20px;text-align:center;color:#697886}
.publish-btn{position:fixed;right:20px;bottom:80px;background:#1d6b51;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 20px rgba(29,107,81,.4)}
</style>
</head>
<body>
<main class="page">
<section class="app">
<header class="hero">
${heroImg ? '<div class="hero-bg" style="background-image:url(\''+heroImg+'\')"></div>' : ''}
<div class="location">${isBookExchange ? '校园 · 同校面交 · Demo Prototype' : '杭州 · 3km 内 · Demo Prototype'}</div>
<h1>${heroTitle}</h1>
<p>${heroSubtitle}</p>
<section class="proof">
${product.trustFeatures.slice(0, 3).map(f => `<div>${f}<b>已前置</b></div>`).join('')}
</section>
</header>
<nav class="filters" id="filters">
<button class="chip active" data-filter="all">${filterAll}</button>
<button class="chip" data-filter="f1">${filter1}</button>
<button class="chip" data-filter="f2">${filter2}</button>
<button class="chip" data-filter="f3">${filter3}</button>
</nav>
<section class="list" id="list"></section>
<nav class="bottom">
<button class="active" onclick="switchTab('home',this)">首页</button>
<button onclick="switchTab('records',this)">${isBookExchange ? '书架' : '报名'}</button>
<button onclick="switchTab('mine',this)">我的</button>
</nav>
<aside class="panel" id="panel">
<button class="x" onclick="closePanel()">×</button>
<div id="panelContent"></div>
</aside>
</section>
</main>
<script>
const items=${serializedItems};
const list=document.getElementById('list');
const panel=document.getElementById('panel');
function renderJobs(filter='all'){
const filtered=filter==='all'?items:items.filter((_,i)=>i%3===['f1','f2','f3'].indexOf(filter));
if(!filtered.length){list.innerHTML='<div class="empty">暂无符合条件的内容，试试调整筛选。</div>';return}
list.innerHTML=filtered.map(it=>'<article class="card" data-id="'+it.id+'">'+(it.img?'<img class="card-img" src="'+it.img+'" alt="'+it.title+'" loading="lazy">':'<div class="card-img-placeholder">📚</div>')+'<div class="card-body"><h3>'+it.title+'</h3><div class="meta"><span>'+it.price+'</span><span>'+it.distance+'</span><span>'+it.time+'</span></div><span class="badge">'+it.tag+'</span></div></article>').join('');
document.querySelectorAll('.card[data-id]').forEach(c=>c.addEventListener('click',()=>openDetail(c.dataset.id)));
}
document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderJobs(btn.dataset.filter)}));
function openDetail(id){
const it=items.find(j=>j.id===id)||items[0];
panel.classList.add('show');
document.getElementById('panelContent').innerHTML='<h2>'+it.title+'</h2>'+(it.img?'<img src="'+it.img+'" style="width:100%;border-radius:12px;margin:10px 0" alt="'+it.title+'" loading="lazy">':'')+'<div class="meta"><span>'+it.price+'</span><span>'+it.distance+'</span><span>'+it.time+'</span></div><p style="margin:12px 0">'+it.detail+'</p><div class="trust"><div>✅ '+it.tag+'</div><div>🛡 '+it.risk+'</div></div><button class="primary" onclick="showForm()">${ctaText}</button><div class="form" id="form"><input id="name" placeholder="你的姓名"><input id="contact" placeholder="联系方式"><button class="primary" onclick="submitForm()">确认提交</button></div><div class="success" id="success">${successMsg}</div>';
}
function showForm(){document.getElementById('form').classList.add('show')}
function submitForm(){const n=document.getElementById('name').value.trim();const c=document.getElementById('contact').value.trim();if(!n||!c){alert('请填写姓名和联系方式');return}document.getElementById('success').classList.add('show')}
function closePanel(){panel.classList.remove('show')}
function switchTab(tab,el){document.querySelectorAll('.bottom button').forEach(b=>b.classList.remove('active'));el.classList.add('active');if(tab==='records'){list.innerHTML='<div class="empty">暂无记录。</div>'}else if(tab==='mine'){list.innerHTML='<div class="empty">我的页面：认证、设置将在正式版展开。</div>'}else{renderJobs()}}
renderJobs();
</script>
</body>
</html>`;
  }
}

function toBulletList(items) {
  const safeItems = (items || []).filter(Boolean);
  return (safeItems.length ? safeItems : ['暂无可展示内容。'])
    .map(item => `- ${item}`)
    .join('\n');
}

function extractNumberedSection(content, heading) {
  return extractSection(content, heading)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\d+\.\s+/.test(line));
}

function extractBullets(content, heading) {
  return extractSection(content, heading)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2));
}

function extractTableRows(content, heading) {
  return extractSection(content, heading)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && !line.includes('---'))
    .slice(1)
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
}

function extractSection(content, heading) {
  if (!content) return '';
  const start = content.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const next = content.indexOf('\n## ', start + 4);
  return content.slice(start, next > start ? next : content.length);
}

export const downstreamMockService = new DownstreamMockService();
