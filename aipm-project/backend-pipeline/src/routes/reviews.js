/**
 * 评审会路由（包装 D6 编排器 + SSE 流式输出）
 * - POST /api/projects/:id/review/:stageNum         触发评审会
 * - GET  /api/projects/:id/review/:stageNum/stream  SSE 流式接收
 * - GET  /api/projects/:id/review/:stageNum         完整 JSON
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { projectService } from '../services/project-service.js';
import { decisionService } from '../services/decision-service.js';
import { reviewMockService } from '../services/review-mock-service.js';
import { config } from '../config.js';
import { Errors } from '../utils/errors.js';
import { isDemoProject } from '../services/demo-mode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 引入 D6 编排器（同 monorepo 中的 backend/）
const reviewSessionPath = path.resolve(__dirname, '../../../backend/src/review-session.js');
let ReviewSession;
try {
  const mod = await import(pathToFileURL(reviewSessionPath).href);
  ReviewSession = mod.ReviewSession;
} catch (err) {
  console.warn('⚠️ 无法加载 D6 评审会编排器:', err.message);
}

export async function reviewRoutes(fastify) {
  // ─── 触发评审会 ───
  fastify.post('/projects/:id/review/:stageNum', async (request, reply) => {
    const { id, stageNum } = request.params;
    const meta = await projectService.getMeta(id);

    const stageInfo = meta.stages[stageNum];
    if (!stageInfo || !stageInfo.artifactPath) {
      throw Errors.invalidInput(`阶段 ${stageNum} 尚未产出文档，无法评审`);
    }

    // 演示项目：先恢复一下文件状态（解决用户重新走流程时残留 reviewPath 的问题）
    if (await isDemoProject(id)) {
      // 评审尚未开始，把 reviewPath 清空，让 stream 用预制 JSON 而不是已有结果
      await projectService.updateMeta(id, (m) => {
        if (m.stages[stageNum].status === 'review_running') return m; // 已经在跑就别动
        m.stages[stageNum].status = 'review_running';
        m.stages[stageNum].reviewPath = null;
        m.stages[stageNum].decisions = [];
        m.currentState = 'review_running';
        m.currentStage = stageNum;
        m.eventLog.push({ time: new Date().toISOString(), event: 'review_started', stage: stageNum, source: 'demo' });
        return m;
      });
      return {
        success: true,
        data: {
          reviewId: `${stageNum}-review`,
          state: 'running',
          streamEndpoint: `/api/projects/${id}/review/${stageNum}/stream`,
          snapshotEndpoint: `/api/projects/${id}/review/${stageNum}`,
        },
      };
    }

    // 状态：进入 review_running
    await projectService.updateMeta(id, (m) => {
      m.stages[stageNum].status = 'review_running';
      m.currentState = 'review_running';
      m.eventLog.push({
        time: new Date().toISOString(),
        event: 'review_started',
        stage: stageNum,
      });
      return m;
    });

    return {
      success: true,
      data: {
        reviewId: `${stageNum}-review`,
        state: 'running',
        streamEndpoint: `/api/projects/${id}/review/${stageNum}/stream`,
        snapshotEndpoint: `/api/projects/${id}/review/${stageNum}`,
      },
    };
  });

  // ─── SSE 流式输出 ───
  fastify.get('/projects/:id/review/:stageNum/stream', async (request, reply) => {
    const { id, stageNum } = request.params;
    const meta = await projectService.getMeta(id);

    const stageInfo = meta.stages[stageNum];
    if (!stageInfo || !stageInfo.artifactPath) {
      throw Errors.invalidInput(`阶段 ${stageNum} 尚未产出文档，无法评审`);
    }

    // 设置 SSE 头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (eventType, data) => {
      reply.raw.write(`event: ${eventType}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // ====== 演示模式：从预置 review JSON 重放，每条发言带自然延时 ======
    if (await isDemoProject(id)) {
      try {
        const reviewPath = `reviews/${stageNum}-review.json`;
        const content = await projectService.readFile(id, reviewPath);
        const reviewData = JSON.parse(content);

        sendEvent('ready', { reviewId: `${stageNum}-review` });

        // 按 transcript 顺序逐条推送，每条之间根据内容长度自然延时
        for (const entry of reviewData.transcript || []) {
          const eventType = mapType(entry.type);
          // 估算发言时长：每个字 80ms，最少 3s 最多 25s
          const duration = Math.min(25000, Math.max(3000, (entry.content || '').length * 80));
          if (entry.type === 'closing') {
            sendEvent('closing', { ...entry, decisions: reviewData.decisions || [] });
          } else {
            sendEvent(eventType, entry);
          }
          await sleep(Math.min(2200, duration / 4)); // 显示间隔，前端逐字播放
        }

        // 把 review 注册为 pending decisions（让 decisions.html 能读到）
        const decisions = await decisionService.registerReviewDecisions(id, stageNum, reviewData, reviewPath);

        sendEvent('complete', {
          reviewPath,
          decisionCount: decisions.length,
          durationMs: reviewData.metadata?.duration || 0,
          source: 'demo-replay',
        });
      } catch (err) {
        console.error(`[demo review/${stageNum}] 重放失败：`, err.message);
        sendEvent('error', { code: 'DEMO_REPLAY_FAILED', message: err.message });
      } finally {
        reply.raw.end();
      }
      return;
    }

    try {
      const artifactPath = projectService.filePath(id, stageInfo.artifactPath);

      sendEvent('ready', { reviewId: `${stageNum}-review` });

      // 流式回调：每条发言生成后立刻推给前端
      const onEntry = (entry) => {
        const eventType = mapType(entry.type);
        sendEvent(eventType, entry);
      };

      // 评审会最长 20 分钟超时（5个发言每人最多5分钟 + 开场 + 收尾）
      const REVIEW_TIMEOUT = 1200000;
      const runPromise = reviewMockService.run(id, stageNum, stageInfo.artifactPath, onEntry);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('评审会生成超时，请重试')), REVIEW_TIMEOUT)
      );

      const result = await Promise.race([runPromise, timeoutPromise]);

      result.decisions = decisionService.normalizeDecisions(
        result.decisions || [],
        result.transcript || [],
        stageNum
      );

      // closing 由 onEntry 回调之外的 route 层附带 decisions 推送
      // 不再重复推送 transcript（onEntry 已经逐条推过了）
      const closing = result.transcript.find(e => e.type === 'closing');
      if (closing) {
        sendEvent('closing', { ...closing, decisions: result.decisions });
      }

      const reviewJsonPath = `reviews/${stageNum}-review.json`;
      const decisions = await decisionService.registerReviewDecisions(id, stageNum, result, reviewJsonPath);

      sendEvent('complete', {
        reviewPath: reviewJsonPath,
        decisionCount: decisions.length,
        durationMs: result.metadata?.duration || 0,
      });
    } catch (err) {
      console.error(`[review/${stageNum}] 评审会失败：`, err.message);
      sendEvent('error', { code: 'INTERNAL_ERROR', message: err.message });
    } finally {
      reply.raw.end();
    }
  });

  // ─── 获取完整评审会 JSON ───
  fastify.get('/projects/:id/review/:stageNum', async (request) => {
    const { id, stageNum } = request.params;
    const meta = await projectService.getMeta(id);
    const stageInfo = meta.stages[stageNum];

    if (!stageInfo || !stageInfo.reviewPath) {
      throw Errors.invalidInput(`阶段 ${stageNum} 尚未完成评审`);
    }

    const content = await projectService.readFile(id, stageInfo.reviewPath);
    return { success: true, data: JSON.parse(content) };
  });
}

// ─── 工具 ───

function mapType(type) {
  return {
    opening: 'opening',
    main_speech: 'main_speech',
    interrupt: 'interrupt',
    response_to_interrupt: 'response',
    closing: 'closing',
  }[type] || type;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 降级：当 D6 模块加载失败时，从 sample JSON 流式播放
 */
async function streamFromSample(projectId, stageNum, sendEvent) {
  const samplePath = path.resolve(__dirname, '../../../frontend/data/review-sample.json');
  const fs = await import('fs/promises');
  try {
    const content = await fs.readFile(samplePath, 'utf-8');
    const data = JSON.parse(content);
    sendEvent('ready', { reviewId: `${stageNum}-review`, fallback: true });
    for (const entry of data.transcript) {
      sendEvent(mapType(entry.type), entry);
      await sleep(200);
    }
    sendEvent('complete', { decisionCount: data.decisions?.length || 0 });
  } catch (err) {
    sendEvent('error', { message: '降级数据加载失败: ' + err.message });
  }
}
