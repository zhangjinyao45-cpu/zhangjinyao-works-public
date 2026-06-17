/**
 * 演示模式（Demo Mode）
 *
 * 开关：backend-pipeline/.demo-mode 文件存在 → 演示模式启用
 *      文件不存在 → 真实模式（默认）
 *
 * 行为：
 * 1. POST /projects 创建项目时，从 dxm-conversation-intel 复制全部产物到新项目
 *    并把状态机重置为 stage 00 in_progress，让用户从头走完整 SPA 流程
 * 2. Stage 00 chat 走预设脚本，不调 Claude API
 * 3. 评审会 SSE 流从已复制的 review JSON 重放
 * 4. 决策点正常工作（数据已预置）
 *
 * 切换方式：
 *   双击 demo-on.bat → 创建 .demo-mode 标记文件
 *   双击 demo-off.bat → 删除 .demo-mode 标记文件
 *   切换不需要重启服务器，每次请求实时检查
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 开关标记文件位置：backend-pipeline/.demo-mode
const FLAG_FILE = path.resolve(__dirname, '../../.demo-mode');

// 演示数据源项目
export const DEMO_SOURCE_PROJECT = 'dxm-conversation-intel';

// 演示项目 meta 中的标记字段
export const DEMO_FLAG_KEY = '_demoMode';

/**
 * 实时检查演示模式是否开启（不缓存，每次请求都查）
 */
export function isDemoModeOn() {
  try {
    return fs.existsSync(FLAG_FILE);
  } catch {
    return false;
  }
}

/**
 * 检查指定项目是否是演示项目
 * 通过读 meta.json 中的 _demoMode 字段判断
 */
export async function isDemoProject(projectId) {
  try {
    const metaPath = path.join(config.workspaceRoot, projectId, 'meta.json');
    const content = await fsp.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    return meta[DEMO_FLAG_KEY] === true;
  } catch {
    return false;
  }
}

/**
 * 把演示源项目复制到目标项目目录（保留所有 stage/review/decision/data-snapshot 文件）
 * 并重置 meta.json 状态为 stage 00 in_progress
 */
export async function seedDemoProject(targetName, originalIdea) {
  const srcDir = path.join(config.workspaceRoot, DEMO_SOURCE_PROJECT);
  const dstDir = path.join(config.workspaceRoot, targetName);

  if (!fs.existsSync(srcDir)) {
    throw new Error(`演示源项目不存在：${DEMO_SOURCE_PROJECT}`);
  }

  if (fs.existsSync(dstDir)) {
    throw new Error(`项目已存在：${targetName}`);
  }

  // 递归复制目录
  await copyDirRecursive(srcDir, dstDir);

  // 重置 meta.json：保留所有产物路径与决策模板，但状态机回到 stage 00 in_progress
  const metaPath = path.join(dstDir, 'meta.json');
  const sourceMeta = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
  const now = new Date().toISOString();

  const resetMeta = {
    ...sourceMeta,
    [DEMO_FLAG_KEY]: true,
    _demoSourceProject: DEMO_SOURCE_PROJECT,
    projectId: targetName,
    name: targetName,
    idea: originalIdea || sourceMeta.idea,
    createdAt: now,
    updatedAt: now,
    currentStage: '00',
    currentState: 'in_progress',
    globalState: 'running',
    blockedReason: null,
    decisionHistory: [],
    eventLog: [
      { time: now, event: 'pipeline_started', user: 'default' },
      { time: now, event: 'stage_started', stage: '00' },
    ],
    stages: {
      '00':   { status: 'in_progress', startedAt: now, completedAt: null,
                artifactPath: 'stages/00-需求头脑风暴设计.md',
                reviewPath: null, decisions: [], needsRedo: false },
      '00.5': { status: 'pending', startedAt: null, completedAt: null,
                artifactPath: 'stages/00.5-竞品分析报告.md',
                reviewPath: null, decisions: [], needsRedo: false,
                dataSnapshots: sourceMeta.stages['00.5']?.dataSnapshots || [] },
      '01':   { status: 'pending', startedAt: null, completedAt: null,
                artifactPath: 'stages/01-增强提示词.md',
                reviewPath: null, decisions: [], needsRedo: false },
      '02':   { status: 'pending', startedAt: null, completedAt: null,
                artifactPath: 'stages/02-产品需求文档.md',
                reviewPath: null, decisions: [], needsRedo: false },
      '03':   { status: 'pending', startedAt: null, completedAt: null,
                artifactPath: 'stages/03-线框图与交互规范.md',
                reviewPath: null, decisions: [], needsRedo: false },
      '04':   { status: 'pending', startedAt: null, completedAt: null,
                artifactPath: 'stages/04-UI交互原型.html',
                reviewPath: null, decisions: [], needsRedo: false },
    },
  };

  // 决策模板路径备份（演示重放用）
  resetMeta._demoReviewPaths = {
    '00':   'reviews/00-review.json',
    '00.5': 'reviews/00.5-review.json',
    '01':   'reviews/01-review.json',
    '02':   'reviews/02-review.json',
    '03':   'reviews/03-review.json',
  };

  // 重置 inputs/decision-answers.json，演示从空开始
  await fsp.writeFile(
    path.join(dstDir, 'inputs', 'decision-answers.json'),
    JSON.stringify({ updatedAt: now, latest: null, answers: [] }, null, 2),
    'utf-8'
  );

  await fsp.writeFile(metaPath, JSON.stringify(resetMeta, null, 2), 'utf-8');

  return resetMeta;
}

/**
 * Stage 00 演示聊天脚本
 * 基于 dxm-conversation-intel 的 inputs/00-conversation.json 提取主持人发言
 * 按用户回复轮次返回对应的下一句
 */
export async function getDemoChatReply(meta, userTurnIndex) {
  // 这套脚本不依赖文件，直接内联，确保即使文件被改也稳定
  const HOST_SCRIPT = [
    // 第 1 轮回复（用户已说"做一个度小满..."这种产品想法）
    '好的，我理解了——这是一个度小满内部使用的客服对话智能分析系统，核心是帮助员工快速分类、理解用户，并生成个性化的 AI 客服策略。\n\n这是一个典型的 B2B 内部工具，我们需要聚焦效率和准确性。\n\n现在确认产品定位：这个系统是 A.客服质检工具 / B.用户运营工具 / C.AI 客服训练平台 / D.综合工作台？还有，目标用户是度小满内部哪些人？最痛的痛点是什么？',
    // 第 2 轮（对应用户答 1ABC 2AD 3BD）
    '好的——产品定位：用户运营 + AI 客服训练；主力用户：人工客服 + AI 产品团队；核心痛点：AI 太标准化 + 缺乏精细化理解。\n\n继续，用户场景与任务流——人工客服的典型工作流是哪三种？AI 产品团队怎么用？高净值用户如何识别？',
    // 第 3 轮
    '理解了——三场景全覆盖，北极星指标是"打造更好的 AI 客服"，AI 团队走 HITL 流程，高净值自动识别。\n\n现在到功能范围收敛——我列了 10 个功能，你帮我标 P0 / P1：对话列表、详情、AI 分类、画像生成、Prompt 生成审核、人工修正、投诉告警、数据看板、Prompt 版本管理、多客服协同备注。分类颗粒度 4 类够了吗？画像页字段范围？',
    // 第 4 轮
    '好，功能边界清晰——8 个 P0、F7 投诉告警和 F10 协同备注降为 P1、4 类分类、画像基础信息+AI 总结全要。\n\n页面架构上有几个问题：8 个核心页面是否合并？员工的核心导航路径是什么？画像页可编辑性？Prompt 审核流程是单人还是双人？',
    // 第 5 轮
    '页面架构定型——Prompt 审核与版本管理合并、对话驱动型主路径、画像 AI 生成+客服可补充备注、单人审核。\n\n来到交互与视觉——视觉风格倾向？信息密度？AI 分类标签展示？对话详情页布局？',
    // 第 6 轮
    '视觉锁定——数据密集型深色终端风、高密度、彩色徽章、三栏布局。\n\n最后一组确认收敛：MVP 范围？成功指标？硬约束/底线要求？还有评审会要重点挑战哪个方面？',
    // 第 7 轮（用户回答最后一组）
    'Stage 00 信息齐了。我重要修正一下：AI 客服是 APP 内文字对话场景，不是电话客服。\n\n我现在去生成《00-需求头脑风暴设计.md》，然后召集五人评审会挑战这个需求。【信息收集完毕，可以生成文档了】',
  ];

  return HOST_SCRIPT[Math.min(userTurnIndex, HOST_SCRIPT.length - 1)];
}

/**
 * 检查 Stage 00 chat 是否到了"可以生成文档"的轮次
 */
export function shouldDemoChatFinish(userTurnIndex) {
  return userTurnIndex >= 6; // 第 7 轮回复（index=6）会出现【信息收集完毕】
}

// ============== 渐进式选择题演示数据 ==============

/**
 * 度小满项目演示用的 12 道结构化选择题
 * 严格按照 brainstorming-service 的 6 维度框架，每维 2 题
 * 选项内容紧贴度小满高净值客户对话智能分析平台
 */
export const DEMO_BRAINSTORMING_QUESTIONS = [
  // 维度 A 产品定位
  {
    id: 'A1', dimId: 'A', dimName: '产品定位', type: 'single_choice',
    question: '如果用一句话描述，这个产品是什么？最核心解决什么问题？',
    options: [
      { id: 'A1a', label: '客服质检工具', description: '检查客服表现、合规性' },
      { id: 'A1b', label: '用户运营工具', description: '理解用户、提升转化/留存' },
      { id: 'A1c', label: 'AI客服训练平台', description: '优化AI客服回复质量' },
      { id: 'A1d', label: '用户运营+AI客服训练', description: '画像分析+per-user prompt' },
    ],
  },
  {
    id: 'A2', dimId: 'A', dimName: '产品定位', type: 'multi_choice',
    question: '主要给度小满内部哪些角色用？',
    options: [
      { id: 'A2a', label: '人工客服团队', description: '一线客服人员，需要快速响应' },
      { id: 'A2b', label: '客服质检/培训团队', description: '需要分析对话质量' },
      { id: 'A2c', label: '用户运营/风控团队', description: '需要理解用户画像' },
      { id: 'A2d', label: 'AI 产品团队', description: '需要优化 AI 客服 prompt' },
    ],
  },
  // 维度 B 用户与场景
  {
    id: 'B1', dimId: 'B', dimName: '用户与场景', type: 'multi_choice',
    question: '人工客服的典型工作流是哪几种？',
    options: [
      { id: 'B1a', label: '接入对话前查画像', description: '快速看用户历史和分类' },
      { id: 'B1b', label: '对话结束后自动分类', description: '系统识别投诉/不满' },
      { id: 'B1c', label: '主管按类别筛选对话', description: '发现共性问题' },
      { id: 'B1d', label: '同时全部', description: '三种工作流都要支持' },
    ],
  },
  {
    id: 'B2', dimId: 'B', dimName: '用户与场景', type: 'single_choice',
    question: 'AI 产品团队使用这个系统的核心场景？',
    options: [
      { id: 'B2a', label: '每周批量调 prompt', description: '人工选用户后调模板' },
      { id: 'B2b', label: '系统检测后审核生成的 prompt', description: '实时 HITL 流程' },
      { id: 'B2c', label: '投诉触发后临时查询', description: '只有问题用户才看' },
    ],
  },
  // 维度 C 功能范围
  {
    id: 'C1', dimId: 'C', dimName: '功能范围', type: 'single_choice',
    question: '第一版只能做好一个功能，最想先做哪个？',
    options: [
      { id: 'C1a', label: 'AI 自动分类', description: '4类对话自动归类' },
      { id: 'C1b', label: '用户画像生成', description: '基础信息+AI总结' },
      { id: 'C1c', label: '个性化 Prompt 生成审核', description: 'per-user prompt闭环' },
      { id: 'C1d', label: '三件套一起做', description: '分类+画像+Prompt一体' },
    ],
  },
  {
    id: 'C2', dimId: 'C', dimName: '功能范围', type: 'multi_choice',
    question: '首版还必须有哪些 P0 功能？',
    options: [
      { id: 'C2a', label: '对话列表 + 详情页', description: '基础查看' },
      { id: 'C2b', label: '人工修正分类', description: '错了能改' },
      { id: 'C2c', label: 'Prompt 版本管理', description: '可对比/回滚' },
      { id: 'C2d', label: '数据看板', description: '准确率/通过率监控' },
      { id: 'C2e', label: '投诉自动告警工单', description: '降为 P1' },
      { id: 'C2f', label: '多客服协同备注', description: '降为 P1' },
    ],
  },
  // 维度 D 页面与信息架构
  {
    id: 'D1', dimId: 'D', dimName: '页面与信息架构', type: 'multi_choice',
    question: '至少需要哪些核心页面？',
    options: [
      { id: 'D1a', label: '工作台首页（KPI+待办）', description: '员工首屏' },
      { id: 'D1b', label: '对话列表 + 对话详情', description: '主入口' },
      { id: 'D1c', label: '用户画像页', description: '完整画像' },
      { id: 'D1d', label: 'Prompt 中心（审核+版本管理）', description: '合并为一个' },
      { id: 'D1e', label: '数据看板', description: '分析趋势' },
    ],
  },
  {
    id: 'D2', dimId: 'D', dimName: '页面与信息架构', type: 'single_choice',
    question: '员工最常走的核心导航路径？',
    options: [
      { id: 'D2a', label: '对话驱动型', description: '从对话进入，看画像和prompt' },
      { id: 'D2b', label: '用户驱动型', description: '从用户搜索进入，看历史对话' },
      { id: 'D2c', label: '任务驱动型', description: '从待审核prompt一站式处理' },
    ],
  },
  // 维度 E 交互与视觉
  {
    id: 'E1', dimId: 'E', dimName: '交互与视觉', type: 'single_choice',
    question: '整体视觉风格倾向？',
    options: [
      { id: 'E1a', label: '度小满官方风格', description: '白底+品牌蓝+金融严谨感' },
      { id: 'E1b', label: '极简专业风格', description: '类似 Linear/Notion' },
      { id: 'E1c', label: '数据密集型工具风', description: '深色+高密度，类似交易终端' },
      { id: 'E1d', label: '卡片式现代风格', description: '类似飞书/钉钉后台' },
    ],
  },
  {
    id: 'E2', dimId: 'E', dimName: '交互与视觉', type: 'multi_choice',
    question: '对话详情页布局和分类标签展示？',
    options: [
      { id: 'E2a', label: '三栏布局（列表/详情/侧栏）', description: '黄金布局' },
      { id: 'E2b', label: '彩色徽章分类（4 类）', description: '蓝/紫/绿/红' },
      { id: 'E2c', label: '高密度信息（30+条/屏）', description: '员工8小时使用' },
      { id: 'E2d', label: '键盘快捷键支持', description: 'J/K/L/R 切换' },
    ],
  },
  // 维度 F 确认收敛
  {
    id: 'F1', dimId: 'F', dimName: '确认收敛', type: 'text',
    question: '还有什么硬性要求或特别看重的？（如合规、模型选型、集成约束等）',
    options: [],
  },
  {
    id: 'F2', dimId: 'F', dimName: '确认收敛', type: 'multi_choice',
    question: '第一版上线 1 个月内最希望验证什么？',
    options: [
      { id: 'F2a', label: '分类准确率 ≥ 80%', description: '基础能力达标' },
      { id: 'F2b', label: 'Prompt 通过率 ≥ 70%', description: 'AI生成质量' },
      { id: 'F2c', label: '客服效率提升', description: '处理时长缩短' },
      { id: 'F2d', label: '高净值用户满意度 +10%', description: '业务价值验证' },
    ],
  },
];

/**
 * 演示模式下，对应索引返回某一题
 */
export function getDemoQuestionByIndex(index) {
  if (index < 0 || index >= DEMO_BRAINSTORMING_QUESTIONS.length) return null;
  return DEMO_BRAINSTORMING_QUESTIONS[index];
}

export const DEMO_TOTAL_QUESTIONS = DEMO_BRAINSTORMING_QUESTIONS.length;

// ============== 辅助 ==============

async function copyDirRecursive(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, dstPath);
    }
  }
}
