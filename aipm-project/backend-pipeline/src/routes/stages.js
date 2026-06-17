/**
 * 阶段相关路由（D7 P0：先实现阶段0 头脑风暴）
 * - GET  /api/projects/:id/stage/:stageNum/questions  阶段提问列表
 * - POST /api/projects/:id/stage/:stageNum/answers    提交答题
 * - GET  /api/projects/:id/stage/:stageNum/artifact   获取阶段产出文档
 */

import { projectService } from '../services/project-service.js';
import { brainstormingService } from '../services/brainstorming-service.js';
import { competitorService } from '../services/competitor-service.js';
import { promptService } from '../services/prompt-service.js';
import { downstreamMockService } from '../services/downstream-mock-service.js';
import { config } from '../config.js';
import { Errors } from '../utils/errors.js';
import { stageOrchestratorService } from '../services/stage-orchestrator-service.js';
import { isDemoProject, getDemoChatReply, shouldDemoChatFinish, getDemoQuestionByIndex, DEMO_TOTAL_QUESTIONS } from '../services/demo-mode.js';

export async function stageRoutes(fastify) {
  // ─── Stage 0 引导式对话（SSE 流式，周明逐字回复）───
  fastify.post('/projects/:id/stage/00/chat', async (request, reply) => {
    const { id } = request.params;
    const { history = [], userMessage } = request.body || {};
    if (!userMessage) throw Errors.invalidInput('userMessage 不能为空');

    const meta = await projectService.getMeta(id);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (data) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    // ====== 演示模式：走预设脚本 ======
    if (await isDemoProject(id)) {
      const userTurnIndex = history.filter(m => m.role === 'user').length;
      const replyText = await getDemoChatReply(meta, userTurnIndex);
      for (const char of replyText) {
        send({ char });
        await new Promise(r => setTimeout(r, 20));
      }
      send({ done: true, canFinish: shouldDemoChatFinish(userTurnIndex) });
      reply.raw.end();
      return;
    }

    try {
      if (config.useMock) {
        // mock：根据对话轮次返回预设回复
        const turn = history.filter(m => m.role === 'assistant').length;
        const mockReplies = [
          `好，"${userMessage}"——我理解了。再问你：你的目标用户是谁？年龄、场景、现在怎么解决这个问题的？`,
          `明白。那核心痛点是什么？用户现在最抓狂的一件事是什么？`,
          `清楚了。首版 MVP 的边界怎么划？哪些是必须做的，哪些先不做？`,
          `好。视觉风格方向呢？参考哪个产品，或者你有什么偏好？`,
          `信息很完整了。还有什么你特别想强调的，或者顾虑的？如果没有，我们可以直接生成需求文档了。`,
        ];
        const reply_text = mockReplies[Math.min(turn, mockReplies.length - 1)];
        for (const char of reply_text) {
          send({ char });
          await new Promise(r => setTimeout(r, 18));
        }
        send({ done: true, canFinish: turn >= 3 });
      } else {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const opts = { apiKey: config.anthropicApiKey };
        if (config.anthropicBaseUrl) opts.baseURL = config.anthropicBaseUrl;
        const client = new Anthropic(opts);

        const orchestratedSystemPrompt = await stageOrchestratorService.buildSystemPrompt(
          '00',
          [
            'You are Zhou Ming running AIPM stage 00 requirement brainstorming.',
            'Use the requirement-brainstorming-zjy six-dimension intake logic.',
            'Ask exactly one concise question per turn.',
            'Always respond to the user answer first, then ask the next question.',
            'Questions must be grounded in the project name and original idea.',
            'If the user answer is too vague, ask a targeted follow-up instead of moving on.',
            'Cover: product intent, target users, use scenario, current workaround, MVP scope, page structure, interaction/visual direction, final constraints.',
            'When enough information has been collected, end the reply with: 【信息收集完毕，可以生成文档了】',
          ].join('\n')
        );
        const transcript = history
          .map(m => `${m.role === 'user' ? '用户' : '周明'}：${m.content}`)
          .join('\n\n') || '暂无';
        const orchestratedUserPrompt = [
          `项目名：${meta.name}`,
          `用户原始想法/项目说明：${meta.idea}`,
          '',
          '已有对话：',
          transcript,
          '',
          `用户最新回答：${userMessage}`,
          '',
          '请先对用户最新回答做一句具体反馈，再基于项目上下文继续问一个最该问的问题。不要输出列表，不要一次问多个问题。',
        ].join('\n');

        const stream = await client.messages.stream({
          model: config.claudeModel,
          max_tokens: 500,
          system: orchestratedSystemPrompt,
          messages: [{ role: 'user', content: orchestratedUserPrompt }],
        });

        let fullText = '';
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            const char = chunk.delta.text;
            fullText += char;
            send({ char });
          }
        }

        const canFinish = fullText.includes('【信息收集完毕');
        send({ done: true, canFinish });
      }
    } catch (err) {
      const fallbackText = buildStage00FallbackReply(meta, history, userMessage);
      for (const char of fallbackText) {
        send({ char, fallback: true });
        await new Promise(r => setTimeout(r, 12));
      }
      send({ done: true, canFinish: shouldFinishStage00(history) });
    } finally {
      reply.raw.end();
    }
  });

  // ─── Stage 0 对话完成，生成需求文档 ───
  fastify.post('/projects/:id/stage/00/chat/finish', async (request, reply) => {
    const { id } = request.params;
    const { history = [] } = request.body || {};

    const meta = await projectService.getMeta(id);

    // ====== 演示模式：mock 文档已经在 seedDemoProject 时复制过来了 ======
    if (await isDemoProject(id)) {
      // 保存对话记录（覆盖原 mock，反映用户真实对话过程）
      await projectService.writeFile(
        id,
        'inputs/00-conversation.json',
        JSON.stringify({ history, savedAt: new Date().toISOString() }, null, 2)
      );
      const updated = await projectService.updateMeta(id, (m) => {
        m.stages['00'].status = 'review_pending';
        m.stages['00'].artifactPath = 'stages/00-需求头脑风暴设计.md';
        m.currentState = 'review_pending';
        m.eventLog.push({ time: new Date().toISOString(), event: 'artifact_generated', stage: '00', source: 'demo-script' });
        return m;
      });
      return {
        success: true,
        data: {
          stage: '00',
          state: updated.currentState,
          artifactPath: 'stages/00-需求头脑风暴设计.md',
          nextAction: { type: 'trigger_review', endpoint: `/api/projects/${id}/review/00` },
        },
      };
    }

    const conversationText = history
      .map(m => `${m.role === 'user' ? '用户' : '周明'}：${m.content}`)
      .join('\n\n');

    // 把对话转成 answers 格式
    const answers = history
      .filter(m => m.role === 'user')
      .map((m, i) => ({ questionId: `chat_q${i+1}`, answer: m.content }));

    const artifact = await brainstormingService.generateArtifact(meta, answers);
    await projectService.writeFile(id, 'stages/00-需求头脑风暴设计.md', artifact);
    await projectService.writeFile(id, 'inputs/00-conversation.json', JSON.stringify({ history, savedAt: new Date().toISOString() }, null, 2));

    const updated = await projectService.updateMeta(id, (m) => {
      m.stages['00'].status = 'review_pending';
      m.stages['00'].artifactPath = 'stages/00-需求头脑风暴设计.md';
      m.currentState = 'review_pending';
      m.eventLog.push({ time: new Date().toISOString(), event: 'artifact_generated', stage: '00' });
      return m;
    });

    return {
      success: true,
      data: {
        stage: '00',
        state: updated.currentState,
        artifactPath: 'stages/00-需求头脑风暴设计.md',
        nextAction: { type: 'trigger_review', endpoint: `/api/projects/${id}/review/00` },
      },
    };
  });

  // ─── Stage 0 渐进式问答：获取第一题（秒出，无需 API）───
  fastify.get('/projects/:id/stage/00/first-question', async (request) => {
    const { id } = request.params;
    const meta = await projectService.getMeta(id);

    // ====== 演示模式：返回 12 题中的第一题 ======
    if (await isDemoProject(id)) {
      const q = getDemoQuestionByIndex(0);
      return {
        success: true,
        data: {
          ...q,
          totalQuestions: DEMO_TOTAL_QUESTIONS,
          currentIndex: 0,
          intro: `好，我是周明。听到你想做"${meta.idea}"。\n\n做产品不是"我觉得"，是"用户需要、竞品没做好、我们能做到"三者的交集。我会用六个维度把你的想法结构化——如实回答就好。`,
        },
      };
    }

    const q = brainstormingService.getFirstQuestion(meta);
    return { success: true, data: q };
  });

  // ─── Stage 0 渐进式问答：提交回答，获取下一题（动态生成选项）───
  fastify.post('/projects/:id/stage/00/next-question', async (request) => {
    const { id } = request.params;
    const { answerHistory = [], currentIndex = 0 } = request.body || {};
    const meta = await projectService.getMeta(id);

    // ====== 演示模式：按索引返回下一题 ======
    if (await isDemoProject(id)) {
      const nextIdx = currentIndex + 1;
      if (nextIdx >= DEMO_TOTAL_QUESTIONS) {
        return { success: true, data: { done: true, totalQuestions: DEMO_TOTAL_QUESTIONS } };
      }
      const q = getDemoQuestionByIndex(nextIdx);
      return {
        success: true,
        data: {
          ...q,
          totalQuestions: DEMO_TOTAL_QUESTIONS,
          currentIndex: nextIdx,
          done: false,
        },
      };
    }

    const nextQ = await brainstormingService.getNextQuestion(meta, answerHistory, currentIndex);
    return { success: true, data: nextQ };
  });

  // ─── 获取提问列表（保留兼容）───
  fastify.get('/projects/:id/stage/:stageNum/questions', async (request) => {
    const { id, stageNum } = request.params;
    const meta = await projectService.getMeta(id);

    if (stageNum !== '00') {
      throw Errors.invalidInput(`阶段 ${stageNum} 暂不支持问卷模式（仅阶段0 用问卷）`);
    }

    // 检查阶段状态
    if (meta.stages[stageNum].status === 'done') {
      throw Errors.stageNotReady(meta.currentStage, stageNum);
    }

    // 生成（或读取缓存的）提问列表
    const questions = await brainstormingService.generateQuestions(meta);

    return { success: true, data: questions };
  });

  // ─── 提交答题 ───
  fastify.post('/projects/:id/stage/:stageNum/answers', async (request, reply) => {
    const { id, stageNum } = request.params;
    const { answers } = request.body || {};

    if (!Array.isArray(answers)) {
      throw Errors.invalidInput('answers 必须是数组');
    }
    if (stageNum !== '00') {
      throw Errors.invalidInput(`阶段 ${stageNum} 暂不支持问卷模式`);
    }

    const meta = await projectService.getMeta(id);

    // ====== 演示模式：保存答题但不重新生成文档 ======
    if (await isDemoProject(id)) {
      await projectService.writeFile(
        id,
        'inputs/00-brainstorming-answers.json',
        JSON.stringify({ answers, submittedAt: new Date().toISOString() }, null, 2)
      );
      const updated = await projectService.updateMeta(id, (m) => {
        m.stages['00'].status = 'review_pending';
        m.stages['00'].artifactPath = 'stages/00-需求头脑风暴设计.md';
        m.currentState = 'review_pending';
        m.eventLog.push({ time: new Date().toISOString(), event: 'artifact_generated', stage: '00', source: 'demo-script' });
        return m;
      });
      reply.send({
        success: true,
        data: {
          stage: '00',
          state: updated.currentState,
          artifactPath: 'stages/00-需求头脑风暴设计.md',
          nextAction: { type: 'trigger_review', endpoint: `/api/projects/${id}/review/00` },
        },
      });
      return;
    }

    // 保存原始答题
    await projectService.writeFile(
      id,
      `inputs/00-brainstorming-answers.json`,
      JSON.stringify({ answers, submittedAt: new Date().toISOString() }, null, 2)
    );

    // 生成阶段0 产出文档
    const artifact = await brainstormingService.generateArtifact(meta, answers);
    await projectService.writeFile(id, 'stages/00-需求头脑风暴设计.md', artifact);

    // 更新 meta：阶段0 进入 review_pending
    const updated = await projectService.updateMeta(id, (m) => {
      m.stages['00'].status = 'review_pending';
      m.stages['00'].artifactPath = 'stages/00-需求头脑风暴设计.md';
      m.currentState = 'review_pending';
      m.eventLog.push({
        time: new Date().toISOString(),
        event: 'artifact_generated',
        stage: '00',
      });
      return m;
    });

    reply.send({
      success: true,
      data: {
        stage: '00',
        state: updated.currentState,
        artifactPath: 'stages/00-需求头脑风暴设计.md',
        nextAction: {
          type: 'trigger_review',
          endpoint: `/api/projects/${id}/review/00`,
        },
      },
    });
  });

  // ─── 获取阶段产出文档 ───
  fastify.post('/projects/:id/stage/:stageNum/run', async (request, reply) => {
    const { id, stageNum } = request.params;
    const { useMock = false } = request.body || {};

    if (!['00.5', '01', '02', '03', '04'].includes(stageNum)) {
      throw Errors.invalidInput(`阶段 ${stageNum} 暂不支持自动执行`);
    }

    // ====== 演示模式：产物已预置，直接标记为已生成 ======
    if (await isDemoProject(id)) {
      const filenameMap = {
        '00.5': 'stages/00.5-竞品分析报告.md',
        '01': 'stages/01-增强提示词.md',
        '02': 'stages/02-产品需求文档.md',
        '03': 'stages/03-线框图与交互规范.md',
        '04': 'stages/04-UI交互原型.html',
      };
      const artifactPath = filenameMap[stageNum];
      const now = new Date().toISOString();
      await projectService.updateMeta(id, (m) => {
        m.stages[stageNum].artifactPath = artifactPath;
        if (!m.stages[stageNum].startedAt) m.stages[stageNum].startedAt = now;
        m.stages[stageNum].status = 'review_pending';
        m.currentState = 'review_pending';
        m.currentStage = stageNum;
        m.eventLog.push({ time: now, event: 'artifact_generated', stage: stageNum, source: 'demo-script', artifactPath });
        return m;
      });
      reply.send({
        success: true,
        data: { stage: stageNum, artifactPath, state: 'review_pending', source: 'demo-script' },
      });
      return;
    }

    let result;
    if (stageNum === '00.5') {
      result = await competitorService.generateArtifact(id, { useMock });
    } else if (stageNum === '01') {
      result = await promptService.generateArtifact(id);
    } else {
      result = await downstreamMockService.generateArtifact(id, stageNum);
    }
    reply.send({ success: true, data: result });
  });

  fastify.post('/projects/:id/stage/:stageNum/advance', async (request, reply) => {
    const { id, stageNum } = request.params;
    const meta = await projectService.getMeta(id);
    const stageInfo = meta.stages[stageNum];

    if (!stageInfo) {
      throw Errors.invalidInput(`阶段 ${stageNum} 不存在`);
    }
    if (meta.currentStage !== stageNum) {
      throw Errors.invalidInput(`当前阶段是 ${meta.currentStage}，不能推进 ${stageNum}`);
    }
    if (!['review_pending', 'decision_pending', 'pending'].includes(meta.currentState)) {
      throw Errors.invalidInput(`当前状态 ${meta.currentState} 暂不能直接推进`);
    }

    const stageIndex = config.stages.indexOf(stageNum);
    const nextStage = config.stages[stageIndex + 1] || null;
    const now = new Date().toISOString();
    const reviewPath = stageInfo.reviewPath || `reviews/${stageNum}-review.json`;

    if (!stageInfo.reviewPath) {
      await projectService.writeFile(
        id,
        reviewPath,
        JSON.stringify({
          stage: stageNum,
          transcript: [],
          decisions: [],
          metadata: {
            source: 'manual_advance',
            note: '用户确认当前阶段已完成，系统补齐无决策评审记录并进入下一阶段。',
            generatedAt: now,
          },
        }, null, 2)
      );
    }

    const updated = await projectService.updateMeta(id, (m) => {
      m.stages[stageNum].status = 'done';
      m.stages[stageNum].completedAt = now;
      m.stages[stageNum].reviewPath = reviewPath;
      m.currentStage = nextStage || stageNum;

      if (nextStage) {
        m.stages[nextStage].status = m.stages[nextStage].status === 'done'
          ? 'done'
          : 'pending';
        m.stages[nextStage].startedAt = m.stages[nextStage].startedAt || null;
        m.currentState = m.stages[nextStage].status === 'done' ? 'completed' : 'pending';
        m.eventLog.push({ time: now, event: 'stage_done', stage: stageNum });
        m.eventLog.push({ time: now, event: 'stage_ready', stage: nextStage });
      } else {
        m.currentState = 'completed';
        m.globalState = 'completed';
        m.eventLog.push({ time: now, event: 'pipeline_completed' });
      }

      return m;
    });

    reply.send({
      success: true,
      data: {
        stage: stageNum,
        state: updated.currentState,
        nextStage,
        nextAction: nextStage
          ? { type: 'advance_to_stage', stage: nextStage, endpoint: `/api/projects/${id}/status` }
          : { type: 'pipeline_completed' },
      },
    });
  });

  fastify.get('/projects/:id/stage/:stageNum/artifact', async (request, reply) => {
    const { id, stageNum } = request.params;
    const { format } = request.query;

    const meta = await projectService.getMeta(id);
    const stageInfo = meta.stages[stageNum];

    if (!stageInfo || !stageInfo.artifactPath) {
      throw Errors.invalidInput(`阶段 ${stageNum} 尚未产出文档`);
    }

    const content = await projectService.readFile(id, stageInfo.artifactPath);
    const filename = stageInfo.artifactPath.split('/').pop();

    if (format === 'json') {
      return {
        success: true,
        data: {
          stage: stageNum,
          filename,
          content,
          wordCount: content.length,
          generatedAt: stageInfo.completedAt || meta.updatedAt,
        },
      };
    }

    // 默认返回 raw Markdown / HTML
    const isHtml = filename.endsWith('.html');
    reply
      .header('Content-Type', isHtml ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8')
      .send(content);
  });
}

function shouldFinishStage00(history) {
  return history.filter(m => m.role === 'assistant').length >= 5;
}

function buildStage00FallbackReply(meta, history, userMessage) {
  const assistantTurns = history.filter(m => m.role === 'assistant').length;
  const idea = meta.idea || meta.name || '这个产品';
  const answer = String(userMessage || '').trim();
  const shortAnswer = answer.length <= 8;
  const prefix = shortAnswer
    ? `我先把「${answer || '这个信息'}」记下来，但它现在更像一个名称，还不是完整需求判断。结合你最初说的「${idea}」，`
    : `明白，我先把你这点收进阶段 0：${answer.slice(0, 42)}${answer.length > 42 ? '...' : ''}。结合项目说明「${idea}」，`;

  const questions = [
    '我下一步要确认：这个产品第一版到底服务谁？是度小满内部业务团队、已有金融用户，还是某个更窄的年轻用户场景？',
    '这个用户现在遇到的具体问题是什么？请尽量用一个真实场景说，比如他在什么时刻、因为什么卡住、现在怎么绕过去。',
    '如果只做 MVP，哪一个结果最重要：提升转化、降低用户理解成本、增强信任，还是沉淀可复用的产品方案？',
    '首版必须出现哪些页面或模块？比如首页、方案生成、数据看板、用户反馈、运营配置，哪些必须做，哪些先不做？',
    '这个产品的可信表达要怎么做？你希望用户第一眼看到数据证明、品牌背书、成功案例，还是清晰的风险说明？',
    '最后收敛一下：有没有硬性限制，比如合规边界、不能承诺的能力、必须沿用的品牌风格，或者你特别不想做成的样子？',
  ];

  const question = questions[Math.min(assistantTurns, questions.length - 1)];
  const finish = assistantTurns >= questions.length - 1 ? '\n\n【信息收集完毕，可以生成文档了】' : '';
  return `${prefix}${question}${finish}`;
}
