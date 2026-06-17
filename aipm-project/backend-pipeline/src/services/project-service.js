/**
 * 项目工作区管理
 * 负责 meta.json 的读写、目录创建、状态变更
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { config } from '../config.js';
import { Errors } from '../utils/errors.js';

export class ProjectService {
  /**
   * 创建新项目
   */
  async create({ name, idea, userPersona = 'default' }) {
    if (!name || !idea) {
      throw Errors.invalidInput('name 和 idea 必填');
    }

    // 校验项目名（不允许特殊字符）
    if (!/^[一-龥a-zA-Z0-9_\-]{2,30}$/.test(name)) {
      throw Errors.invalidInput('项目名只能含中文/字母/数字/-/_，长度 2-30');
    }

    const projectDir = path.join(config.workspaceRoot, name);

    // 检查是否已存在
    if (fsSync.existsSync(projectDir)) {
      throw Errors.invalidInput(`项目已存在: ${name}`, { projectId: name });
    }

    // 创建目录结构
    await fs.mkdir(path.join(projectDir, 'stages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'reviews'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'decisions'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'data-snapshots'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'inputs'), { recursive: true });

    // 初始 meta.json
    const now = new Date().toISOString();
    const meta = {
      $schema: 'https://aipm.dev/schemas/meta-v1.json',
      projectId: name,
      name,
      idea,
      userPersona,
      createdAt: now,
      updatedAt: now,

      currentStage: '00',
      currentState: 'in_progress',
      globalState: 'running',
      blockedReason: null,

      stages: Object.fromEntries(
        config.stages.map(s => [s, {
          status: s === '00' ? 'in_progress' : 'pending',
          startedAt: s === '00' ? now : null,
          completedAt: null,
          artifactPath: null,
          reviewPath: null,
          decisions: [],
          needsRedo: false,
        }])
      ),

      decisionHistory: [],
      eventLog: [
        { time: now, event: 'pipeline_started', user: 'default' },
        { time: now, event: 'stage_started', stage: '00' },
      ],
    };

    await this._writeMeta(name, meta);
    return meta;
  }

  /**
   * 读取项目 meta.json
   */
  async getMeta(projectId) {
    const metaPath = path.join(config.workspaceRoot, projectId, 'meta.json');
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') throw Errors.projectNotFound(projectId);
      throw err;
    }
  }

  /**
   * 更新项目 meta.json（部分更新 + 时间戳）
   */
  async updateMeta(projectId, updater) {
    const meta = await this.getMeta(projectId);
    const updated = typeof updater === 'function' ? updater(meta) : { ...meta, ...updater };
    updated.updatedAt = new Date().toISOString();
    await this._writeMeta(projectId, updated);
    return updated;
  }

  /**
   * 添加事件日志
   */
  async logEvent(projectId, event) {
    return this.updateMeta(projectId, (meta) => {
      meta.eventLog.push({
        time: new Date().toISOString(),
        ...event,
      });
      return meta;
    });
  }

  /**
   * 列出所有项目
   */
  async listAll() {
    try {
      const dirs = await fs.readdir(config.workspaceRoot);
      const projects = [];
      for (const dir of dirs) {
        if (dir.startsWith('_') || dir.startsWith('.')) continue;
        try {
          const meta = await this.getMeta(dir);
          projects.push({
            projectId: meta.projectId,
            name: meta.name,
            idea: meta.idea,
            currentStage: meta.currentStage,
            globalState: meta.globalState,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
          });
        } catch (err) {
          // 跳过损坏的项目
        }
      }
      return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * 获取项目某个文件的绝对路径
   */
  filePath(projectId, relativePath) {
    return path.join(config.workspaceRoot, projectId, relativePath);
  }

  /**
   * 写入项目内的文件
   */
  async writeFile(projectId, relativePath, content) {
    const fullPath = this.filePath(projectId, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return fullPath;
  }

  /**
   * 读取项目内的文件
   */
  async readFile(projectId, relativePath) {
    const fullPath = this.filePath(projectId, relativePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw Errors.invalidInput(`文件不存在: ${relativePath}`, { projectId, path: relativePath });
      }
      throw err;
    }
  }

  // === 内部方法 ===
  async _writeMeta(projectId, meta) {
    const metaPath = path.join(config.workspaceRoot, projectId, 'meta.json');
    await fs.mkdir(path.dirname(metaPath), { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}

// 单例
export const projectService = new ProjectService();
