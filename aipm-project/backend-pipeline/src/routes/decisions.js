/**
 * 决策点路由
 * - GET  /api/projects/:id/decisions?status=pending  待拍板列表
 * - POST /api/projects/:id/decisions/:decisionId     提交决策
 */

import { decisionService } from '../services/decision-service.js';
import { Errors } from '../utils/errors.js';

export async function decisionRoutes(fastify) {
  fastify.get('/projects/:id/decisions', async (request) => {
    const { id } = request.params;
    const { status = 'pending' } = request.query;
    const pendingDecisions = await decisionService.listDecisions(id, status);

    return {
      success: true,
      data: { pendingDecisions },
    };
  });

  fastify.post('/projects/:id/decisions/:decisionId', async (request) => {
    const { id, decisionId } = request.params;
    const { choice, rationale } = request.body || {};

    if (!choice) {
      throw Errors.invalidInput('choice 必填');
    }

    const result = await decisionService.submitDecision(id, decisionId, choice, rationale || null);
    return {
      success: true,
      data: result,
    };
  });
}
