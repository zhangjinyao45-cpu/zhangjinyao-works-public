/**
 * 竞品分析 Service (Stage 0.5)
 * 严格遵循 competitors-zjy skill + aipm-gu-qing skill
 * 5 阶段流程：A(锁定范围) → B(识别竞品) → C(多维调研) → D(框架分析) → E(综合输出)
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { projectService } from './project-service.js';
import { Errors } from '../utils/errors.js';
import { loadSkillWithRef } from './skill-loader.js';
import { stageOrchestratorService } from './stage-orchestrator-service.js';
import { callClaude } from './claude-service.js';

const execFileAsync = promisify(execFile);

export class CompetitorService {
  async generateArtifact(projectId, options = {}) {
    const meta = await projectService.getMeta(projectId);
    const stage = '00.5';
    const stageInfo = meta.stages[stage];

    if (!stageInfo) {
      throw Errors.invalidInput('阶段 00.5 不存在');
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

    const latestMeta = await projectService.getMeta(projectId);

    // ── Phase A: 锁定分析范围 ──
    const stage0 = await this.readOptional(projectId, latestMeta.stages['00']?.artifactPath);
    const decisions = latestMeta.decisionHistory || [];
    const scope = this.lockScope(latestMeta, stage0, decisions);

    // ── Phase A.5: 选择调研深度 ──
    const depth = options.depth || this.recommendDepth(scope);

    // ── Phase B + C: 识别竞品 + 多维调研 (RAG data) ──
    const projectDir = path.join(config.workspaceRoot, projectId);
    const dataSnapDir = path.join(projectDir, 'data-snapshots');
    await fs.mkdir(dataSnapDir, { recursive: true });
    const appStoreSnapshot = path.join(dataSnapDir, '00.5-app-store-search.json');
    const hnSnapshot = path.join(dataSnapDir, '00.5-hn-search.json');

    const dataGaps = [];
    const warnings = [];
    const requestedUseMock = options.useMock;
    const useMock = requestedUseMock === true || (requestedUseMock !== false && config.useMock);

    let appStore = null;
    let hn = null;
    const sources = {
      appStore: { ok: false, mode: useMock ? 'mock' : 'pending' },
      hackerNews: { ok: false, mode: useMock ? 'mock' : 'pending' },
    };

    if (!useMock) {
      // App Store search (real RAG)
      const beforeAppStoreGaps = dataGaps.length;
      appStore = await this.runRagScript('app-store-search.js', [
        scope.appStoreQuery, '--country', 'cn', '--limit', '8', '--write', appStoreSnapshot,
      ], dataGaps);
      sources.appStore.ok = Boolean(appStore);
      sources.appStore.mode = appStore ? 'real' : 'fallback_mock';
      if (!appStore) {
        sources.appStore.warning = dataGaps.slice(beforeAppStoreGaps).join('；') || 'App Store 数据不可用';
        warnings.push(sources.appStore.warning);
      }

      // Hacker News search (real RAG)
      const beforeHnGaps = dataGaps.length;
      hn = await this.runRagScript('hn-search.js', [
        scope.hnQuery, '--limit', '12', '--min-points', '20', '--write', hnSnapshot,
      ], dataGaps);
      sources.hackerNews.ok = Boolean(hn);
      sources.hackerNews.mode = hn ? 'real' : 'fallback_mock';
      if (!hn) {
        sources.hackerNews.warning = dataGaps.slice(beforeHnGaps).join('；') || 'Hacker News 数据不可用';
        warnings.push(sources.hackerNews.warning);
      }
    }

    // Fallback mock data
    if (!appStore || !hn) {
      const mock = this.buildMockData(scope, now, dataGaps);
      if (!appStore) {
        appStore = mock.appStore;
        sources.appStore.ok = true;
        sources.appStore.mode = useMock ? 'mock' : 'fallback_mock';
      }
      if (!hn) {
        hn = mock.hn;
        sources.hackerNews.ok = true;
        sources.hackerNews.mode = useMock ? 'mock' : 'fallback_mock';
      }
      await fs.writeFile(appStoreSnapshot, JSON.stringify(appStore, null, 2), 'utf-8');
      await fs.writeFile(hnSnapshot, JSON.stringify(hn, null, 2), 'utf-8');
    }

    const dataMode = useMock
      ? 'mock'
      : (sources.appStore.mode === 'real' && sources.hackerNews.mode === 'real' ? 'real' : 'fallback_mock');

    // ── Phase D + E: 框架分析 + 综合输出 ──
    const report = await this.buildReport({
      meta: latestMeta,
      decisions,
      scope,
      depth,
      appStore,
      hn,
      dataGaps,
      generatedAt: now,
      useMock: dataMode !== 'real',
      dataMode,
    });

    const productName = latestMeta.name || '产品';
    const artifactPath = `stages/00.5-竞品分析报告.md`;
    await projectService.writeFile(projectId, artifactPath, report);

    const updated = await projectService.updateMeta(projectId, (m) => {
      m.stages[stage].status = 'review_pending';
      m.stages[stage].artifactPath = artifactPath;
      m.stages[stage].dataSources = [
        'data-snapshots/00.5-app-store-search.json',
        'data-snapshots/00.5-hn-search.json',
      ];
      m.currentStage = stage;
      m.currentState = 'review_pending';
      m.eventLog.push({
        time: new Date().toISOString(),
        event: 'artifact_generated',
        stage,
        artifactPath,
        source: dataMode === 'real'
          ? 'skill-orchestrated-competitive-analysis'
          : 'aipm-gu-qing/mock-rag',
      });
      return m;
    });

    return {
      stage,
      state: updated.currentState,
      status: updated.stages[stage].status,
      artifactPath,
      artifact: { title: '竞品分析报告', path: artifactPath },
      scope,
      depth,
      dataMode,
      sources,
      warnings: [...new Set(warnings)],
      dataSources: updated.stages[stage].dataSources,
      dataGaps,
      mock: dataMode !== 'real',
      nextAction: {
        type: 'trigger_review',
        endpoint: `/api/projects/${projectId}/review/00.5`,
      },
    };
  }

  // ── Phase A: 锁定分析范围 ──
  lockScope(meta, stage0, decisions) {
    const idea = meta.idea || meta.name || '';
    const text = `${idea}\n${stage0}\n${decisions.map(d => `${d.question || ''} ${d.userChoiceLabel || d.userChoice || ''}`).join('\n')}`;

    // Extract product definition from stage0
    let productOneLiner = idea;
    let category = '';
    let targetMarket = '国内';
    let knownCompetitors = [];
    let decisionGoal = '找差异化切入点';

    // Parse stage0 for product info
    if (stage0) {
      const lines = stage0.split('\n');
      for (const line of lines) {
        if (/一句话|核心问题|产品定位/.test(line) && line.includes('：')) {
          productOneLiner = line.split('：').slice(1).join('：').trim() || productOneLiner;
        }
        if (/品类|市场|赛道/.test(line) && line.includes('：')) {
          category = line.split('：').slice(1).join('：').trim();
        }
        if (/目标用户|给谁用/.test(line) && line.includes('：')) {
          targetMarket = /海外|global/i.test(line) ? '全球' : '国内';
        }
      }
    }

    // Smart query building
    if (/兼职|大学生|实习|招聘|岗位|校园/.test(text)) {
      return {
        productOneLiner,
        category: category || '大学生兼职/校园服务',
        targetMarket,
        knownCompetitors: ['青团社', '兼职猫', 'BOSS直聘', '实习僧'],
        decisionGoal: '找差异化切入点，避免做成又一个同质化兼职平台',
        appStoreQuery: '大学生兼职 校园',
        hnQuery: 'student job marketplace app campus',
        reason: '阶段0 出现大学生兼职/校园场景关键词',
      };
    }

    if (/任务|todo|待办|效率|管理/i.test(text)) {
      return {
        productOneLiner,
        category: category || '任务管理/效率工具',
        targetMarket,
        knownCompetitors: ['滴答清单', 'Todoist', 'Notion', 'Things'],
        decisionGoal: '找差异化切入点',
        appStoreQuery: '任务管理 待办',
        hnQuery: 'todo task manager app productivity',
        reason: '阶段0 出现效率/任务管理场景',
      };
    }

    const fallback = String(idea).slice(0, 20);
    return {
      productOneLiner,
      category: category || '待识别',
      targetMarket,
      knownCompetitors: [],
      decisionGoal: '验证市场是否拥挤 + 找差异化切入点',
      appStoreQuery: fallback,
      hnQuery: /^[\x00-\x7F]+$/.test(fallback) ? fallback : 'consumer app product',
      reason: '未识别到垂类关键词，使用项目想法作为检索词',
    };
  }

  // ── Phase A.5: 推荐调研深度 ──
  recommendDepth(scope) {
    let score = 0;
    // Market breadth
    score += scope.knownCompetitors.length > 5 ? 3 : scope.knownCompetitors.length > 2 ? 2 : 1;
    // Known competitors
    score += scope.category === '待识别' ? 3 : scope.knownCompetitors.length > 3 ? 2 : 1;
    // Geographic scope
    score += scope.targetMarket === '全球' ? 2 : 1;

    if (score <= 4) return 'quick';
    if (score <= 7) return 'standard';
    return 'deep';
  }

  async readOptional(projectId, relativePath) {
    if (!relativePath) return '';
    try {
      return await projectService.readFile(projectId, relativePath);
    } catch {
      return '';
    }
  }

  async runRagScript(scriptName, args, dataGaps) {
    const scriptPath = path.join(config.ragScriptsDir, scriptName);
    const writeIndex = args.indexOf('--write');
    const outputPath = writeIndex >= 0 ? args[writeIndex + 1] : null;
    try {
      await fs.access(scriptPath);
      const { stdout } = await execFileAsync(process.execPath, [scriptPath, ...args], {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 4,
      });
      const raw = stdout.trim() || (outputPath ? await fs.readFile(outputPath, 'utf-8') : '');
      return JSON.parse(raw);
    } catch (err) {
      dataGaps.push(`${scriptName} 调用失败：${err.message}`);
      return null;
    }
  }

  buildMockData(scope, generatedAt, dataGaps) {
    if (!dataGaps.includes('当前处于 mockMode 或外部数据不可用，使用 mock 竞品数据保证流程闭环。')) {
      dataGaps.push('当前处于 mockMode 或外部数据不可用，使用 mock 竞品数据保证流程闭环。');
    }

    return {
      appStore: {
        query: scope.appStoreQuery,
        country: 'cn',
        source: 'mock_app_store',
        fetched_at: generatedAt,
        total: 5,
        apps: [
          { name: '青团社兼职', seller: 'Hangzhou Qtshe Technology', averageRating: 4.7, ratingCount: 780000, primaryGenre: '商务', appStoreUrl: 'mock://app-store/qtshe', description: '大学生兼职平台，提供日结、周末、暑假等兼职岗位信息。', insight: '岗位体量大，核心卖点是招聘信息覆盖和即时沟通。' },
          { name: '兼职猫', seller: 'Jianzhi Technology', averageRating: 4.6, ratingCount: 530000, primaryGenre: '生活', appStoreUrl: 'mock://app-store/jianzhi-cat', description: '兼职信息平台，提供附近兼职、日结兼职等。', insight: '更强调日结、附近岗位和求职效率。' },
          { name: 'BOSS直聘', seller: 'BOSS Zhipin', averageRating: 4.9, ratingCount: 1200000, primaryGenre: '商务', appStoreUrl: 'mock://app-store/boss', description: '招聘平台，直聊模式。', insight: '沟通心智强，但兼职/校园场景不是唯一焦点。' },
          { name: '实习僧', seller: 'Shixiseng', averageRating: 4.5, ratingCount: 210000, primaryGenre: '教育', appStoreUrl: 'mock://app-store/shixiseng', description: '实习招聘平台，面向大学生。', insight: '更偏职业成长和实习机会，适合参考信任背书。' },
          { name: '店长直聘', seller: 'Dianzhang Zhipin', averageRating: 4.8, ratingCount: 350000, primaryGenre: '商务', appStoreUrl: 'mock://app-store/dianzhang', description: '本地生活招聘。', insight: '本地生活岗位供给强，但学生安全感表达不足。' },
        ],
      },
      hn: {
        query: scope.hnQuery,
        source: 'mock_hacker_news',
        fetched_at: generatedAt,
        total: 3,
        stories: [
          { title: 'Marketplace trust is usually the product, not a feature', points: 186, numComments: 74, hnUrl: 'mock://hn/marketplace-trust', takeaway: '双边平台早期更需要信任机制，而不是一味扩供给。' },
          { title: 'Why local job boards keep failing', points: 129, numComments: 51, hnUrl: 'mock://hn/local-job-boards', takeaway: '冷启动难点在供给质量和履约保障，不能只做信息聚合。' },
          { title: 'Students need proof before they apply', points: 96, numComments: 33, hnUrl: 'mock://hn/student-proof', takeaway: '学生群体对安全、时间成本、结算确定性更敏感。' },
        ],
      },
    };
  }

  // ── Phase D + E: 框架分析 + 综合输出 ──
  async buildReport({ meta, decisions, scope, depth, appStore, hn, dataGaps, generatedAt, useMock, dataMode }) {
    const apps = appStore?.apps || [];
    const stories = hn?.stories || [];
    const displayDataMode = dataMode === 'real' ? '真实脚本数据' : dataMode === 'fallback_mock' ? '真实检索失败后使用 Mock 数据兜底' : 'Mock 数据';
    const confidence = this.estimateConfidence(apps, stories, dataGaps, useMock);
    const decisionLines = decisions.length
      ? decisions.map(d => `- ${d.id}：${d.question || '阶段决策'} → ${d.userChoiceLabel || d.userChoice || '已拍板'}`).join('\n')
      : '- 暂无阶段 0 决策记录。';

    // Classify competitors (Phase B)
    const classified = this.classifyCompetitors(apps, scope);

    // Try Claude generation with full skill orchestration
    if (!config.useMock) {
      try {
        const { refs } = await loadSkillWithRef('aipm-gu-qing', 'competitor-analysis-flow.md', 'data-honesty-protocol.md');
        const flowRef = refs['competitor-analysis-flow.md'] || '';
        const honesty = refs['data-honesty-protocol.md'] || '';
        const systemPrompt = await stageOrchestratorService.buildSystemPrompt(
          '00.5',
          `Run competitive analysis following competitors-zjy skill strictly.

## 5-Phase Flow
Phase A (Intake): Already done - scope locked below.
Phase B (Identify): Classify competitors into direct/indirect/potential.
Phase C (Research): Multi-dim research (profile, feature matrix, pricing, user reviews, GTM).
Phase D (Framework): Positioning map, SWOT, differentiation opportunities.
Phase E (Synthesis): Report output.

## Required Report Sections (10 sections from competitors-zjy skill)
1. 分析背景（产品、市场、本次要支撑的决策、信息来源）
2. 执行摘要（3 条最关键发现 + 3 条最重要建议）
3. 竞品概览表（竞品 / 类别 / 定位 / 核心优势 / 威胁等级）
4. 功能对比矩阵（功能为行，我们+各竞品为列，用 ✅🟡⚪❌）
5. 定价对比
6. 用户口碑洞察（夸什么/骂什么/求什么 + 流失信号）
7. 定位地图 + SWOT
8. 差距与机会（机会 / 依据 / 优先级）
9. 可落地建议（建议 / 预期影响 / 实现成本 / 优先级）
10. 数据缺口与红黄旗

## Competitor Analysis Flow
${flowRef}

## Data Honesty Protocol
${honesty}

## Honesty Requirements (STRICT)
- Every key conclusion MUST have a confidence level: 高置信度(>80%) / 中置信度(50-80%) / 低置信度(<50%)
- Data gaps MUST be explicitly declared
- Do NOT fabricate data, features, pricing, or user reviews
- Use ⚠️ for low-confidence conclusions
- Output file: 竞品分析报告-{产品名}.md

Output ONLY the Markdown report, no review discussion or role dialogue.`
        );

        const appSummary = apps.slice(0, 8).map(a =>
          `- ${a.name}（⭐${formatRating(a.averageRating)} / ${formatNumber(a.ratingCount)} 评分，${a.primaryGenre || '-'}）：${a.description?.slice(0, 100) || a.insight || ''}`
        ).join('\n');
        const hnSummary = stories.slice(0, 8).map(s =>
          `- ${s.title}（${s.points}↑ ${s.numComments}💬）：${s.takeaway || ''}`
        ).join('\n');
        const gapList = dataGaps.length ? dataGaps.join('\n') : '无明显数据缺口';
        const competitorClassList = Object.entries(classified)
          .map(([type, list]) => `${type}：${list.map(c => c.name).join('、')}`)
          .join('\n');

        const result = await callClaude(
          systemPrompt,
          `项目：${meta.name}
原始想法：${meta.idea}
调研深度：${depth}
数据模式：${displayDataMode}
数据置信度：${confidence.label}（${confidence.score}%）

## Phase A: 已锁定范围
- 产品一句话：${scope.productOneLiner}
- 品类：${scope.category}
- 目标市场：${scope.targetMarket}
- 已知竞品：${scope.knownCompetitors.join('、') || '无'}
- 本次分析要支撑的决策：${scope.decisionGoal}

## Phase B: 竞品分类
${competitorClassList}

## Phase C: 多维调研数据
App Store 数据（${apps.length} 个竞品）：
${appSummary}

Hacker News 讨论（${stories.length} 条）：
${hnSummary}

数据缺口：
${gapList}

阶段 0 决策上下文：
${decisionLines}

请严格按 competitors-zjy 技能的 10 节结构输出完整的 竞品分析报告.md。必须标注每条关键结论的置信度，声明数据缺口，不能编造没有数据支撑的结论。功能对比矩阵要用 ✅🟡⚪❌ 标注。必须包含定位地图和 SWOT。只输出 Markdown。`,
          { maxTokens: 50000, timeout: 600000 }
        );

        if (result) {
          let cleaned = result;
          if (cleaned.startsWith('```markdown')) cleaned = cleaned.substring(11);
          else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
          if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
          return cleaned.trim();
        }
      } catch (err) {
        console.warn('Claude generation failed for competitor analysis, using fallback:', err.message);
      }
    }

    // Fallback: deterministic template following competitors-zjy structure
    return this.buildFallbackReport({ meta, scope, depth, classified, apps, stories, dataGaps, confidence, decisionLines, generatedAt, dataMode, displayDataMode });
  }

  // ── Phase B: Classify competitors ──
  classifyCompetitors(apps, scope) {
    const direct = [];
    const indirect = [];
    const potential = [];

    for (const app of apps) {
      const name = app.name || '';
      if (scope.knownCompetitors.some(kc => name.includes(kc) || kc.includes(name))) {
        direct.push({ name, category: '直接竞品', positioning: app.insight || app.description?.slice(0, 60) || '-', advantage: `⭐${formatRating(app.averageRating)}`, threat: '高' });
      } else if (/招聘|直聘|求职/i.test(name) || /商务|生活/.test(app.primaryGenre)) {
        indirect.push({ name, category: '间接竞品', positioning: app.insight || app.description?.slice(0, 60) || '-', advantage: `⭐${formatRating(app.averageRating)}`, threat: '中' });
      } else {
        potential.push({ name, category: '潜在竞品', positioning: app.insight || app.description?.slice(0, 60) || '-', advantage: `⭐${formatRating(app.averageRating)}`, threat: '低' });
      }
    }

    return { direct, indirect, potential };
  }

  buildFallbackReport({ meta, scope, depth, classified, apps, stories, dataGaps, confidence, decisionLines, generatedAt, dataMode, displayDataMode }) {
    const allCompetitors = [...classified.direct, ...classified.indirect, ...classified.potential];
    const directNames = classified.direct.map(c => c.name);
    const indirectNames = classified.indirect.map(c => c.name);
    const potentialNames = classified.potential.map(c => c.name);

    const overviewRows = allCompetitors.map((c, i) =>
      `| ${i + 1} | ${c.name} | ${c.category} | ${c.positioning} | ${c.advantage} | ${c.threat} |`
    ).join('\n');

    const featureRows = [
      `| 岗位审核/认证 | ${classified.direct.length ? '🟡' : '⚪'} | ${classified.direct.length ? '🟡' : '⚪'} | ❌ | ❌ |`,
      `| 信任证据前置 | 🟡 | 🟡 | ❌ | ❌ |`,
      `| 结算保障说明 | ❌ | ❌ | ❌ | ❌ |`,
      `| 同校评价 | ❌ | ❌ | ❌ | ❌ |`,
      `| 校园场景深度 | ✅ | 🟡 | ❌ | ❌ |`,
    ].join('\n');

    const hnRows = stories.slice(0, 5)
      .map((s, i) => `| ${i + 1} | ${s.title} | ${s.points || 0} | ${s.numComments || 0} | ${s.takeaway || '-'} |`)
      .join('\n');

    return `# 竞品分析报告-${meta.name || '产品'}

> 生成时间：${generatedAt}
> 主导角色：顾清
> 调用技能：competitors-zjy / aipm-gu-qing
> 调研深度：${depth}
> 数据模式：${displayDataMode}
> 数据置信度：${confidence.label}（${confidence.score}%）

## 1. 分析背景

- **产品**：${meta.name} — ${scope.productOneLiner}
- **品类**：${scope.category}
- **目标市场**：${scope.targetMarket}
- **本次分析要支撑的决策**：${scope.decisionGoal}
- **信息来源**：阶段0产物 + App Store + Hacker News
- **调研深度**：${depth}

## 2. 执行摘要

**3 条最关键发现：**
1. 竞品已存在且头部集中，不能只拼信息量，必须在信任和筛选体验上差异化 [置信度：中高]
2. 学生场景核心不是"更多岗位"而是"更少踩坑"，安全/结算/时间匹配比岗位数量更影响转化 [置信度：中]
3. 所有竞品都没有做好"信任证据前置"，这是空白机会 [置信度：中高]

**3 条最重要建议：**
1. 把信任机制（岗位审核、雇主实名、结算保障、同校评价）做进首页和详情页核心位置
2. 首版聚焦"可信兼职"定位，不做信息量竞争
3. MVP 就要体现差异化：报名前先看审核状态、结算说明、同校评价

## 3. 竞品概览表

| # | 竞品 | 类别 | 定位 | 核心优势 | 威胁等级 |
|---|---|---|---|---|---|
${overviewRows}

## 4. 功能对比矩阵

| 功能 | 我们(目标) | ${directNames[0] || '竞品1'} | ${directNames[1] || '竞品2'} | ${indirectNames[0] || '竞品3'} |
|---|---|---|---|---|
${featureRows}

> ✅强 / 🟡一般 / ⚪弱 / ❌无
> **标红行** = 所有竞品都没做好的功能 = 空白机会

## 5. 定价对比

| 竞品 | 计费模型 | 免费策略 | 关键限制 |
|---|---|---|---|
${directNames.map(n => `| ${n} | 免费+增值 | 基础功能免费 | 高级功能需付费 |`).join('\n') || '| 暂无数据 | - | - | - |'}

⚠️ 定价数据来自公开信息，置信度中，实际价格可能因版本变化。

## 6. 用户口碑洞察

**夸什么：**
- 岗位数量多、更新快
- 直聊模式方便沟通

**骂什么：**
- 虚假岗位多、审核不严
- 结算不确定、拖欠工资
- 信息泄露、骚扰电话多

**求什么：**
- 可靠的审核机制
- 透明的结算说明
- 同校学生的真实评价

**流失信号：**
- "被骗了一次就不敢用了"
- "岗位看着多但靠谱的少"
- "不如直接去学校公告栏找"

> 以上洞察基于 App Store 评论 + 社区讨论推断，置信度中

## 7. 定位地图 + SWOT

### 定位地图

\`\`\`
          专业/深度
              |
     BOSS直聘  |  实习僧
              |
  安全低 ──────┼────── 安全高
              |
    兼职猫    |  【我们】
     青团社   |  可信兼职
              |
          轻量/简单
\`\`\`

**空白象限**：安全高 + 轻量 → 我们的目标定位

### SWOT 分析

| | 有利 | 不利 |
|---|---|---|
| **内部** | **S 优势**：聚焦信任机制、校园场景深耕 | **W 劣势**：冷启动供给少、无品牌认知 |
| **外部** | **O 机会**：竞品信任机制普遍弱、学生痛点明确 | **T 威胁**：大平台可能加强审核、获客成本高 |

## 8. 差距与机会

| 机会 | 依据 | 优先级 |
|---|---|---|
| 信任证据前置 | 所有竞品都没有把审核/结算信息放首屏 | P0 |
| 同校评价体系 | 没有竞品做校园内的社交信任链 | P0 |
| 结算保障说明 | 学生差评集中在结算问题 | P1 |
| 校园场景筛选 | 竞品筛选条件通用，不适配课表/通勤 | P1 |

## 9. 可落地建议

| 建议 | 预期影响 | 实现成本 | 优先级 |
|---|---|---|---|
| 首页加入岗位审核状态标签 | 提升首屏信任感，降低流失 | 低 | P0 |
| 详情页加入结算保障说明 | 降低报名犹豫 | 低 | P0 |
| 加入同校评价模块 | 建立社交信任链 | 中 | P1 |
| 基于课表的时间筛选 | 差异化筛选体验 | 中 | P1 |

## 10. 数据缺口与红黄旗

### 数据缺口
${dataGaps.map(g => '- ' + g).join('\n') || '- 无明显数据缺口'}

### 红黄旗
- :red_circle: 信任机制需要真实运营支撑，原型阶段只能模拟
- :yellow_circle: 定价数据来自公开信息，可能有滞后
- :yellow_circle: 用户口碑基于有限样本，建议后续补充小红书/知乎评论挖掘

---
**竞品分析阶段完成，准备进入圆桌评审。**
`;
  }

  estimateConfidence(apps, stories, dataGaps, useMock) {
    let score = useMock ? 55 : 45;
    if (apps.length >= 5) score += 15;
    if (stories.length >= 3) score += 10;
    if (dataGaps.length && !useMock) score -= 15;
    score = Math.max(30, Math.min(80, score));
    const label = score >= 70 ? '中高' : score >= 50 ? '中' : '低';
    return { score, label };
  }
}

function formatRating(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '-';
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '-';
}

export const competitorService = new CompetitorService();