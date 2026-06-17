import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_SKILL_ROOT = path.resolve(__dirname, '../../../skill');

async function readFileSafe(filePath) {
  try { return await fs.readFile(filePath, 'utf-8'); } catch { return ''; }
}

export async function loadSkill(skillName) {
  // 优先用户显式 skill，再 fallback 到 Codex / Agents / 本仓库 skill。
  const home = process.env.HOME || process.env.USERPROFILE;
  const roots = [
    path.join(home, '.claude/skills', skillName),
    path.join(home, '.codex/skills', skillName),
    path.join(home, '.agents/skills', skillName),
    path.join(LOCAL_SKILL_ROOT, skillName),
  ];
  for (const root of roots) {
    const main = await readFileSafe(path.join(root, 'SKILL.md'));
    if (main) return { root, main };
  }
  return { root: null, main: '' };
}

export async function loadSkillWithRef(skillName, ...refPaths) {
  const { root, main } = await loadSkill(skillName);
  const refs = {};
  if (root) {
    for (const refPath of refPaths) {
      refs[refPath] = await readFileSafe(path.join(root, 'references', refPath));
    }
  }
  return { main, refs };
}
