/**
 * AIPM 流水线总控服务器
 * 实现 docs/API_CONTRACT.md 定义的 12 个 RESTful 端点
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { projectRoutes } from './routes/projects.js';
import { stageRoutes } from './routes/stages.js';
import { reviewRoutes } from './routes/reviews.js';
import { decisionRoutes } from './routes/decisions.js';
import { stageOrchestratorService } from './services/stage-orchestrator-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  requestTimeout: 0, // No request timeout - AI generation can take 10+ minutes
  connectionTimeout: 0, // Keep connections alive for long SSE streams
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  },
});

// ====== 全局中间件 ======

// CORS（允许前端跨域调用）
await fastify.register(cors, {
  origin: true, // 开发期允许所有来源
  credentials: true,
});

// ====== 健康检查 ======
fastify.get('/api/health', async () => ({
  success: true,
  data: {
    service: 'aipm-pipeline',
    version: '0.1.0',
    workspaceRoot: config.workspaceRoot,
    skillsRoot: config.skillsRoot,
    mockMode: config.useMock,
    orchestration: Object.fromEntries(
      Object.entries(stageOrchestratorService.getAllStagePlans()).map(([stage, plan]) => [
        stage,
        { source: plan.source, skills: plan.skills },
      ])
    ),
    uptime: process.uptime(),
  }
}));

// ====== 业务路由 ======
await fastify.register(projectRoutes, { prefix: '/api' });
await fastify.register(stageRoutes, { prefix: '/api' });
await fastify.register(reviewRoutes, { prefix: '/api' });
await fastify.register(decisionRoutes, { prefix: '/api' });

// ====== 静态文件（开发期可同源访问 frontend）======
const frontendRoot = path.resolve(__dirname, '../../frontend');
try {
  await fastify.register(staticPlugin, {
    root: frontendRoot,
    prefix: '/app/',
  });
} catch (err) {
  fastify.log.warn(`无法挂载前端静态目录: ${err.message}`);
}

// ====== 错误处理 ======
fastify.setErrorHandler((err, request, reply) => {
  fastify.log.error({ err, url: request.url }, 'Request failed');

  const isAppError = err.code && typeof err.code === 'string' && err.code === err.code.toUpperCase();
  if (isAppError) {
    return reply.status(err.status || 500).send({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      }
    });
  }

  reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || '内部错误',
    }
  });
});

// ====== 启动 ======
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port, host });
  fastify.log.info(`🚀 AIPM 流水线总控启动`);
  fastify.log.info(`   服务地址: http://localhost:${port}`);
  fastify.log.info(`   API 文档: docs/API_CONTRACT.md`);
  fastify.log.info(`   前端入口: http://localhost:${port}/app/`);
  fastify.log.info(`   工作区:   ${config.workspaceRoot}`);
  fastify.log.info(`   Mock 模式: ${config.useMock ? '✅ 开启' : '❌ 关闭（使用真实 Claude API）'}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
