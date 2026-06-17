/**
 * 项目相关路由
 * - POST /api/projects          创建项目
 * - GET  /api/projects          列出所有项目
 * - GET  /api/projects/:id/status  项目状态总览
 * - GET  /api/projects/:id/export  导出（暂留 P1）
 * - POST /api/projects/:id/resume  错误恢复（暂留 P2）
 */

import { projectService } from '../services/project-service.js';
import { Errors } from '../utils/errors.js';
import { config } from '../config.js';
import { isDemoModeOn, seedDemoProject } from '../services/demo-mode.js';

export async function projectRoutes(fastify) {
  // ─── 创建项目 ───
  fastify.post('/projects', async (request, reply) => {
    const { name, idea, userPersona = 'default' } = request.body || {};

    let meta;
    if (isDemoModeOn()) {
      // 演示模式：复制 dxm-conversation-intel 项目到用户输入的 name 下
      // 用户输入啥都触发同一套剧本（度小满项目）
      if (!name || !idea) throw Errors.invalidInput('name 和 idea 必填');
      if (!/^[一-龥a-zA-Z0-9_\-]{2,30}$/.test(name)) {
        throw Errors.invalidInput('项目名只能含中文/字母/数字/-/_，长度 2-30');
      }
      meta = await seedDemoProject(name, idea);
    } else {
      // 真实模式：原始逻辑
      meta = await projectService.create({ name, idea, userPersona });
    }

    reply.status(201).send({
      success: true,
      data: {
        projectId: meta.projectId,
        createdAt: meta.createdAt,
        currentStage: meta.currentStage,
        currentState: meta.currentState,
        nextAction: {
          type: 'answer_questions',
          endpoint: `/api/projects/${meta.projectId}/stage/00/questions`,
        },
      },
    });
  });

  // ─── 列出项目 ───
  fastify.get('/projects', async () => {
    const projects = await projectService.listAll();
    return { success: true, data: { projects } };
  });

  // ─── 项目状态 ───
  fastify.get('/projects/:id/status', async (request) => {
    const meta = await projectService.getMeta(request.params.id);
    return { success: true, data: meta };
  });

  // ─── 导出 manifest（无 zip 依赖，先保证本地可追溯）───
  fastify.get('/projects/:id/export', async (request) => {
    const { id } = request.params;
    const meta = await projectService.getMeta(id);
    const exportedAt = new Date().toISOString();
    const stageFiles = Object.entries(meta.stages || {})
      .flatMap(([stage, info]) => [
        info.artifactPath ? { type: 'artifact', stage, path: info.artifactPath } : null,
        info.reviewPath ? { type: 'review', stage, path: info.reviewPath } : null,
        ...(info.reviewMinutesPath ? [{ type: 'review_minutes', stage, path: info.reviewMinutesPath }] : []),
        ...((info.dataSources || info.dataSnapshots || []).map(path => ({ type: 'data_snapshot', stage, path }))),
      ])
      .filter(Boolean);
    const decisionFiles = [
      ...((meta.decisionHistory || []).map(d => d.tracePath || (d.stage && d.id ? `decisions/${d.stage}-${d.id}.md` : null)).filter(Boolean)
        .map(path => ({ type: 'decision_trace', path }))),
      { type: 'decision_answers', path: 'inputs/decision-answers.json' },
    ];
    const inputFiles = [
      { type: 'stage_input', stage: '00', path: 'inputs/00-brainstorming-answers.json' },
    ];
    const files = [
      { type: 'meta', path: 'meta.json' },
      ...stageFiles,
      ...decisionFiles,
      ...inputFiles,
    ];
    const prototypeUrl = meta.stages?.['04']?.artifactPath
      ? `/api/projects/${encodeURIComponent(id)}/stage/04/artifact`
      : null;
    const manifest = {
      projectId: meta.projectId,
      name: meta.name,
      idea: meta.idea,
      userPersona: meta.userPersona,
      exportedAt,
      globalState: meta.globalState,
      currentStage: meta.currentStage,
      currentState: meta.currentState,
      prototypeUrl,
      stages: meta.stages,
      decisionHistory: meta.decisionHistory || [],
      files,
      workspacePath: projectService.filePath(id, ''),
      notes: [
        '本导出为 manifest 形式，不打包 zip；所有文件均位于同一项目 workspace 中。',
        '如需打开最终原型，请访问 prototypeUrl 或 stages/04-UI交互原型.html。',
      ],
    };
    const exportPath = 'exports/latest/manifest.json';
    await projectService.writeFile(id, exportPath, JSON.stringify(manifest, null, 2));
    return {
      success: true,
      data: {
        projectId: meta.projectId,
        exportPath,
        workspacePath: manifest.workspacePath,
        prototypeUrl,
        fileCount: files.length,
        files,
        exportedAt,
      },
    };
  });

  // ─── 错误恢复（占位）───
  fastify.post('/projects/:id/resume', async (request, reply) => {
    const meta = await projectService.getMeta(request.params.id);
    return {
      success: true,
      data: {
        projectId: meta.projectId,
        resumedFrom: meta.currentState,
        currentStage: meta.currentStage,
      },
    };
  });
}
