/**
 * 角色人设加载器
 * 从 .claude/skills/aipm-* 目录读取 5 个角色的 SKILL.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PersonaLoader {
  constructor(skillsDir) {
    // 默认从用户的 .claude/skills/ 读取
    this.skillsDir = skillsDir || path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.claude', 'skills'
    );
  }

  /**
   * 加载某个角色的完整人设（SKILL.md + references）
   * @param {string} roleName - 角色名（如 'zhou-ming'）
   * @returns {object} - { name, role, systemPrompt, references }
   */
  loadPersona(roleName) {
    const skillPath = path.join(this.skillsDir, `aipm-${roleName}`, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill not found: ${skillPath}`);
    }

    const skillMd = fs.readFileSync(skillPath, 'utf-8');

    // 从人设 yaml block 中提取中文姓名（如"姓名: 周明"）
    const nameMatch = skillMd.match(/姓名[:：]\s*([^（(\s]+)/);
    const roleMatch = skillMd.match(/##\s*角色定位\s*\n+([^\n]+)/);

    return {
      id: roleName,
      name: nameMatch ? nameMatch[1].trim() : roleName,
      role: roleMatch ? roleMatch[1].trim() : 'Unknown',
      systemPrompt: this._extractSystemPrompt(skillMd),
      references: this._loadReferences(roleName),
    };
  }

  /**
   * 加载所有 5 个角色
   */
  loadAllPersonas() {
    const roles = ['zhou-ming', 'gu-qing', 'su-yu', 'li-hang', 'zhang-lei'];
    return roles.map(r => this.loadPersona(r));
  }

  /**
   * Load the review-session orchestration skill, if present.
   */
  loadReviewSessionSkill() {
    const skillPath = path.join(this.skillsDir, 'aipm-review-session', 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return '';
    }
    return fs.readFileSync(skillPath, 'utf-8');
  }

  /**
   * 从 SKILL.md 提取系统提示（用于 Claude API）
   */
  _extractSystemPrompt(skillMd) {
    // 简化版：整个 SKILL.md 作为系统提示
    // 实际可以提取特定章节（如"人设定义"、"发言模板"）
    return skillMd;
  }

  /**
   * 加载 references 目录（可选，用于复杂场景）
   */
  _loadReferences(roleName) {
    const refsDir = path.join(this.skillsDir, `aipm-${roleName}`, 'references');
    if (!fs.existsSync(refsDir)) {
      return {};
    }

    const refs = {};
    const files = fs.readdirSync(refsDir);

    files.forEach(file => {
      if (file.endsWith('.md')) {
        const key = file.replace('.md', '');
        refs[key] = fs.readFileSync(path.join(refsDir, file), 'utf-8');
      }
    });

    return refs;
  }

  /**
   * 构建评审会用的角色 prompt
   * @param {string} roleName - 角色名
   * @param {object} context - 评审会上下文（阶段产物、之前的发言等）
   */
  buildReviewPrompt(roleName, context) {
    const persona = this.loadPersona(roleName);
    const reviewSessionSkill = this.loadReviewSessionSkill();

    const prompt = `
你是 ${persona.name}，正在参加 AI 产品天团的评审会。

当前阶段：${context.stage}
评审对象：${context.artifact}

之前的发言：
${context.transcript.length > 0
  ? context.transcript.map(t => `${t.speakerName}: ${t.content}`).join('\n\n')
  : '（暂无）'}

请按照你的角色定位和发言模板，做主发言或插话。
要求：
- 严格遵循你的人设和说话风格
- 不要重复前面已经讲过的观点
- 如果有数据支撑就引用数据，没有就诚实说明
- 长度控制在 200-400 字
`.trim();

    return {
      systemPrompt: reviewSessionSkill
        ? `${reviewSessionSkill}\n\n--- Role Persona ---\n\n${persona.systemPrompt}`
        : persona.systemPrompt,
      userMessage: prompt,
    };
  }
}
