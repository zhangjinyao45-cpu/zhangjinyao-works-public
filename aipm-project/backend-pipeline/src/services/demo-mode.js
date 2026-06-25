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
 * 度小满项目演示用的 21 道结构化选择题
 * 按 6 个头脑风暴维度组织，内容来自当前演示项目的完整问答脚本
 */
export const DEMO_BRAINSTORMING_QUESTIONS = [
  // 第一维度：产品意图校准
  {
    id: 'Q1', dimId: 'A', dimName: '产品意图校准', type: 'single_choice',
    question: '先确认产品定位。这个系统是什么？',
    options: [
      { id: 'Q1a', label: '客服质检工具', description: '重点检查客服表现与合规性' },
      { id: 'Q1b', label: '用户运营工具', description: '重点理解用户并提升转化、留存' },
      { id: 'Q1c', label: 'AI 客服训练平台', description: '重点优化 AI 客服回复质量' },
      { id: 'Q1d', label: '综合客服工作台', description: '兼顾质检、运营与 AI 客服训练' },
    ],
  },
  {
    id: 'Q2', dimId: 'A', dimName: '产品意图校准', type: 'multi_choice',
    question: '目标用户是度小满内部的哪些角色？',
    options: [
      { id: 'Q2a', label: '人工客服团队', description: '一线客服人员，需要快速理解并响应用户' },
      { id: 'Q2b', label: '客服质检/培训团队', description: '需要分析对话质量与培训机会' },
      { id: 'Q2c', label: '用户运营/风控团队', description: '需要理解用户画像与风险信号' },
      { id: 'Q2d', label: 'AI 产品团队', description: '需要优化 AI 客服 Prompt' },
      { id: 'Q2e', label: '以上都是', description: '同时服务多个团队' },
    ],
  },
  {
    id: 'Q3', dimId: 'A', dimName: '产品意图校准', type: 'multi_choice',
    question: '系统上线后，最希望解决哪些核心痛点？',
    options: [
      { id: 'Q3a', label: '快速筛选重点对话', description: '对话量太大，人工客服看不过来' },
      { id: 'Q3b', label: '改善标准化回复', description: 'AI 客服对高净值用户不够个性化' },
      { id: 'Q3c', label: '及时发现投诉与不满', description: '避免问题用户被遗漏' },
      { id: 'Q3d', label: '精细理解高净值用户', description: '形成更完整的个人画像与服务策略' },
      { id: 'Q3e', label: '其他痛点', description: '还有未被覆盖的核心问题' },
    ],
  },

  // 第二维度：用户场景与任务流
  {
    id: 'Q4', dimId: 'B', dimName: '用户场景与任务流', type: 'multi_choice',
    question: '哪些使用场景需要被系统覆盖？',
    options: [
      { id: 'Q4a', label: '每周批量分析', description: '查看某类用户画像与对话，手动调整 Prompt 模板' },
      { id: 'Q4b', label: '实时/准实时优化', description: '检测高净值用户后生成个性化 Prompt 并人工审核' },
      { id: 'Q4c', label: '投诉后按需查询', description: '临时查看用户画像和历史对话，生成针对性 Prompt' },
    ],
  },
  {
    id: 'Q5', dimId: 'B', dimName: '用户场景与任务流', type: 'single_choice',
    question: 'AI 产品团队最核心的工作流是什么？',
    options: [
      { id: 'Q5a', label: '每周批量调 Prompt', description: '人工选择用户后调整模板' },
      { id: 'Q5b', label: '检测、生成、审核、启用', description: '系统实时检测并通过 HITL 流程启用 Prompt' },
      { id: 'Q5c', label: '投诉触发后临时处理', description: '针对单个问题用户临时生成 Prompt' },
    ],
  },
  {
    id: 'Q6', dimId: 'B', dimName: '用户场景与任务流', type: 'single_choice',
    question: '高净值用户应该如何定义？',
    options: [
      { id: 'Q6a', label: '系统自动识别', description: '基于借贷额度、历史还款等规则与数据判断' },
      { id: 'Q6b', label: '人工标记', description: '由客服或运营手动打标签' },
      { id: 'Q6c', label: '外部系统同步', description: '从现有用户分层系统导入' },
      { id: 'Q6d', label: '暂不区分', description: '所有用户使用相同处理逻辑' },
    ],
  },

  // 第三维度：功能范围收敛
  {
    id: 'Q7', dimId: 'C', dimName: '功能范围收敛', type: 'multi_choice',
    question: '请选择应降为 P1 的功能；未选择的功能默认归为 P0。',
    options: [
      { id: 'Q7a', label: 'F1 对话列表页', description: '按用户、分类筛选对话' },
      { id: 'Q7b', label: 'F2 对话详情页', description: '查看完整对话' },
      { id: 'Q7c', label: 'F3 AI 自动分类', description: '额度、利率、还款、投诉四类' },
      { id: 'Q7d', label: 'F4 用户画像生成页', description: '基础信息、性格特征、诉求总结' },
      { id: 'Q7e', label: 'F5 个性化 AI Prompt', description: '生成与审核' },
      { id: 'Q7f', label: 'F6 分类标签人工修正', description: '员工可修正 AI 分类结果' },
      { id: 'Q7g', label: 'F7 投诉自动告警/工单', description: '投诉触发处理流程' },
      { id: 'Q7h', label: 'F8 数据看板', description: '分类统计与热点问题' },
      { id: 'Q7i', label: 'F9 Prompt 版本管理', description: '历史版本对比与回滚' },
      { id: 'Q7j', label: 'F10 多客服协同备注', description: '记录该用户的服务建议' },
    ],
  },
  {
    id: 'Q8', dimId: 'C', dimName: '功能范围收敛', type: 'multi_choice',
    question: 'AI 对话分类需要做到什么颗粒度？',
    options: [
      { id: 'Q8a', label: '保留 4 类', description: '借贷额度、利率不满、还款方式、投诉' },
      { id: 'Q8b', label: '增加二级分类', description: '在四类下继续细分具体原因' },
      { id: 'Q8c', label: '支持多标签', description: '一通对话可同时属于多个类别' },
      { id: 'Q8d', label: '允许管理员配置', description: '后续可自行增加或调整类别' },
    ],
  },
  {
    id: 'Q9', dimId: 'C', dimName: '功能范围收敛', type: 'multi_choice',
    question: '用户画像页需要展示哪些信息？',
    options: [
      { id: 'Q9a', label: '身份与会员信息', description: '姓名、手机号、会员等级，脱敏展示' },
      { id: 'Q9b', label: '借贷额度', description: '当前额度与相关金融信息' },
      { id: 'Q9c', label: '历史对话统计', description: '对话总数与分类分布' },
      { id: 'Q9d', label: '最近对话', description: '最近一次对话时间与分类' },
      { id: 'Q9e', label: '性格特征', description: '情绪敏感、理性决策、价格敏感等' },
      { id: 'Q9f', label: '核心诉求', description: '用户最关心的问题与目标' },
      { id: 'Q9g', label: '沟通偏好', description: '回复长度、解释深度等偏好' },
      { id: 'Q9h', label: '风险标签', description: '流失风险、投诉倾向等' },
      { id: 'Q9i', label: '专属服务建议', description: '如何接待该用户的一句话建议' },
    ],
  },

  // 第四维度：页面与信息架构
  {
    id: 'Q10', dimId: 'D', dimName: '页面与信息架构', type: 'single_choice',
    question: '核心页面范围应该如何处理？',
    options: [
      { id: 'Q10a', label: '完整保留 8 个页面', description: '登录、工作台、对话列表、对话详情、画像、审核、版本、看板' },
      { id: 'Q10b', label: '合并 Prompt 相关页面', description: 'Prompt 审核与版本管理合并为 Prompt 中心' },
      { id: 'Q10c', label: '继续合并更多页面', description: '进一步减少独立页面数量' },
      { id: 'Q10d', label: '补充新页面', description: '现有页面仍未覆盖完整工作流' },
    ],
  },
  {
    id: 'Q11', dimId: 'D', dimName: '页面与信息架构', type: 'single_choice',
    question: '员工最常走的核心导航路径是哪一条？',
    options: [
      { id: 'Q11a', label: '对话驱动型', description: '工作台 → 对话列表 → 对话详情 → 用户画像 → Prompt 历史' },
      { id: 'Q11b', label: '用户驱动型', description: '工作台 → 搜索用户 → 用户画像 → 关联对话 → Prompt 调整' },
      { id: 'Q11c', label: '任务驱动型', description: '工作台 → 待审核 Prompt → 一站式审核详情' },
      { id: 'Q11d', label: '三条都支持', description: '不同角色可从各自任务入口进入' },
    ],
  },
  {
    id: 'Q12', dimId: 'D', dimName: '页面与信息架构', type: 'single_choice',
    question: '用户画像页应该具备怎样的可编辑性？',
    options: [
      { id: 'Q12a', label: '完全只读', description: '全部由 AI 自动生成，保证数据一致性' },
      { id: 'Q12b', label: '允许补充备注', description: 'AI 生成内容只读，客服可增加独立备注' },
      { id: 'Q12c', label: '允许批注', description: '可批注但不能修改 AI 原始总结' },
    ],
  },
  {
    id: 'Q13', dimId: 'D', dimName: '页面与信息架构', type: 'single_choice',
    question: 'AI Prompt 生成后采用哪种审核流程？',
    options: [
      { id: 'Q13a', label: '单人审核', description: '一名 AI 产品同事审核后生效' },
      { id: 'Q13b', label: '双人审核', description: '一人提交，另一人确认' },
      { id: 'Q13c', label: '直接生效、事后抽检', description: '优先保证速度' },
      { id: 'Q13d', label: '按 AI 自评分流', description: '高分自动生效，低分人工审核' },
    ],
  },

  // 第五维度：交互与视觉确认
  {
    id: 'Q14', dimId: 'E', dimName: '交互与视觉确认', type: 'single_choice',
    question: '整体视觉风格倾向哪一种？',
    options: [
      { id: 'Q14a', label: '度小满官方风格', description: '白底、品牌蓝与金融严谨感' },
      { id: 'Q14b', label: '极简专业风格', description: '白、深灰与少量强调色，类似 Linear/Notion' },
      { id: 'Q14c', label: '数据密集型工具风格', description: '深色背景、高密度信息，类似交易终端' },
      { id: 'Q14d', label: '卡片式现代风格', description: '白底、卡片与柔和阴影，类似飞书/钉钉后台' },
    ],
  },
  {
    id: 'Q15', dimId: 'E', dimName: '交互与视觉确认', type: 'single_choice',
    question: '员工日常使用时偏好哪种信息密度？',
    options: [
      { id: 'Q15a', label: '高密度', description: '一屏尽量展示更多对话，接近表格工具' },
      { id: 'Q15b', label: '中等密度', description: '每条带摘要，一屏约 10-15 条' },
      { id: 'Q15c', label: '低密度', description: '每条信息更丰富，一屏约 5-8 条' },
    ],
  },
  {
    id: 'Q16', dimId: 'E', dimName: '交互与视觉确认', type: 'single_choice',
    question: 'AI 分类标签采用哪种展示方式？',
    options: [
      { id: 'Q16a', label: '彩色徽章', description: '用不同颜色区分投诉、利率、额度与还款' },
      { id: 'Q16b', label: '统一文字标签', description: '不染色，统一使用灰色样式' },
      { id: 'Q16c', label: '图标 + 文字', description: '每类配置图标，不使用背景色' },
      { id: 'Q16d', label: '彩色徽章 + 置信度', description: '同时显示分类名称和 AI 置信度' },
    ],
  },
  {
    id: 'Q17', dimId: 'E', dimName: '交互与视觉确认', type: 'single_choice',
    question: '对话详情页采用哪种布局？',
    options: [
      { id: 'Q17a', label: '左对话 + 右画像/分类', description: '左侧约 70%，右侧约 30%' },
      { id: 'Q17b', label: '上对话 + 下分析', description: '对话占主体，分析信息放在下方' },
      { id: 'Q17c', label: '三栏布局', description: '左侧对话列表，中间当前对话，右侧画像、分类与操作' },
    ],
  },

  // 第六维度：确认收敛
  {
    id: 'Q18', dimId: 'F', dimName: '确认收敛', type: 'single_choice',
    question: 'MVP（首版）的范围想做多大？',
    options: [
      { id: 'Q18a', label: '极简 MVP', description: '对话列表、对话详情、AI 分类、用户画像，约 2-3 周' },
      { id: 'Q18b', label: '完整 P0', description: '8 个 P0 功能一次完成，约 5-6 周' },
      { id: 'Q18c', label: '分两期', description: '一期做对话、分类、画像；二期做 Prompt 生成与审核，各约 3 周' },
    ],
  },
  {
    id: 'Q19', dimId: 'F', dimName: '确认收敛', type: 'multi_choice',
    question: '第一版上线 1 个月内，最关键的成功指标是什么？',
    options: [
      { id: 'Q19a', label: '分类覆盖率与准确率', description: '100% 对话自动分类，准确率不低于 85%' },
      { id: 'Q19b', label: '客服准备效率', description: '显著缩短客服理解用户与准备回复的时间' },
      { id: 'Q19c', label: '个性化 Prompt 质量', description: '审核通过率不低于 70%' },
      { id: 'Q19d', label: '高净值用户满意度', description: '客服服务满意度提升不低于 10%' },
    ],
  },
  {
    id: 'Q20', dimId: 'F', dimName: '确认收敛', type: 'multi_choice',
    question: '哪些硬约束或底线要求必须遵守？',
    options: [
      { id: 'Q20a', label: '数据合规', description: '对话原文不得发送到外部 LLM' },
      { id: 'Q20b', label: '响应时间', description: '分类与画像生成必须在 3 秒内完成' },
      { id: 'Q20c', label: '分级权限', description: '不同角色看到不同字段并进行脱敏' },
      { id: 'Q20d', label: '全量审计', description: '所有 AI 修改必须留痕并可追溯' },
      { id: 'Q20e', label: '现有系统集成', description: '对接度小满现有 CRM 或工单系统' },
      { id: 'Q20f', label: '暂无额外硬约束', description: '当前阶段没有必须补充的底线要求' },
    ],
  },
  {
    id: 'Q21', dimId: 'F', dimName: '确认收敛', type: 'multi_choice',
    question: '希望五人评审会重点挑战产品的哪些方面？',
    options: [
      { id: 'Q21a', label: '产品必要性', description: '是否是真需求，是否真的有人使用' },
      { id: 'Q21b', label: '数据合规与安全', description: '金融数据和 AI 内容的合规风险' },
      { id: 'Q21c', label: 'AI 准确性', description: '分类与画像出错时如何处理' },
      { id: 'Q21d', label: '用户体验', description: '员工是否真正好用，会不会嫌麻烦' },
      { id: 'Q21e', label: '工程可行性', description: '开发周期、成本与技术风险' },
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
