/**
 * 全局配置
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取 .env 文件
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
const homeDir = process.env.HOME || process.env.USERPROFILE;
const userSkillsRoot = path.join(homeDir, '.claude/skills');
const userRagScriptsDir = path.join(userSkillsRoot, 'aipm-data-rag/scripts');
const localRagScriptsDir = path.resolve(__dirname, '../../skill/aipm-data-rag/scripts');

function firstExistingPath(paths, fallback) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || fallback;
}

export const config = {
  // 工作区根目录（项目数据存放位置）
  workspaceRoot: process.env.WORKSPACE_ROOT
    || path.resolve(__dirname, '../../workspace/projects'),

  // Skills 目录（5 角色 + RAG 等 skill）
  skillsRoot: process.env.SKILLS_ROOT || userSkillsRoot,

  // RAG 脚本目录（aipm-data-rag 内的 Node 脚本）：优先显式配置，其次用户 skills，最后使用仓库内置 skill
  ragScriptsDir: process.env.RAG_SCRIPTS_DIR
    || firstExistingPath([userRagScriptsDir, localRagScriptsDir], userRagScriptsDir),

  // Claude API
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',

  // 是否使用 Mock 模式（开发期无需 API Key）
  useMock: process.env.USE_MOCK === 'true' || !process.env.ANTHROPIC_API_KEY,

  // 服务端口
  port: parseInt(process.env.PORT || '3000', 10),

  // 评审会插话上限
  defaultInterruptBudget: 3,

  // 阶段顺序
  stages: ['00', '00.5', '01', '02', '03', '04'],

  // 阶段中文名
  stageNames: {
    '00': '需求头脑风暴',
    '00.5': '竞品分析',
    '01': '提示增强',
    '02': '产品需求文档',
    '03': '线框图与交互规范',
    '04': '高保真原型',
  },
};
