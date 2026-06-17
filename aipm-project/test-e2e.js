/**
 * AIPM 全流程端到端测试（真实 API）
 */
const BASE = 'http://localhost:3000/api';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

async function getSSE(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  return text;
}

function parseSSEEvents(raw) {
  const blocks = raw.split('\n\n').filter(b => b.trim());
  return blocks.map(block => {
    const lines = block.split('\n');
    let event = '', data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data = line.slice(5).trim();
    }
    return { event, data: data ? JSON.parse(data) : {} };
  });
}

function extractSSEReply(raw) {
  let text = '';
  let done = false, canFinish = false;
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      const d = JSON.parse(line.slice(5));
      if (d.char) text += d.char;
      if (d.done) { done = true; canFinish = d.canFinish || false; }
    } catch {}
  }
  return { text, done, canFinish };
}

async function run() {
  const projectId = 'demo-campus-job';
  const log = (step, msg) => console.log(`\n=== Step ${step}: ${msg} ===`);

  // 1. 创建项目
  log(1, '创建项目');
  const create = await post('/projects', { name: projectId, idea: '我想做一个帮大学生找靠谱兼职的App' });
  console.log('✅', create.success, 'stage:', create.data.currentStage);

  // 2. Stage 00 多轮对话
  log(2, 'Stage 00 对话');
  const chatHistory = [
    { role: 'user', content: '我想做一个帮大学生找靠谱兼职的平台' },
  ];

  const questions = [
    '兼职信息真假难辨，结算不靠谱，这是最大痛点',
    '大一到大三的大学生，课余时间想赚零花钱',
    '先做信任闭环，审核+评价+结算说明，不做资金托管',
    '温暖亲切，橙黄色调',
    '没有了，可以生成文档了',
  ];

  for (let i = 0; i < questions.length; i++) {
    const userMsg = questions[i];
    chatHistory.push({ role: 'user', content: userMsg });
    
    const raw = await getSSE(`/projects/${projectId}/stage/00/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: userMsg, history: chatHistory.slice(0, -1) }),
    });
    
    // For SSE, we need to use raw fetch
    const res = await fetch(BASE + `/projects/${projectId}/stage/00/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: userMsg, history: chatHistory.slice(0, -1) }),
    });
    const sseText = await res.text();
    const { text, done, canFinish } = extractSSEReply(sseText);
    console.log(`  Turn ${i + 1}: "${text.substring(0, 60)}..." done=${done} canFinish=${canFinish}`);
    chatHistory.push({ role: 'assistant', content: text });
  }

  // 3. 生成需求文档
  log(3, 'Stage 00 生成需求文档');
  const finish = await post(`/projects/${projectId}/stage/00/chat/finish`, { history: chatHistory });
  console.log('✅', finish.success, 'state:', finish.data.state);

  // 读取文档内容
  const artifact = await get(`/projects/${projectId}/stage/00/artifact?format=json`);
  console.log('  文档长度:', artifact.data.wordCount, '字');
  console.log('  前200字:', artifact.data.content.substring(0, 200));

  // 4. 触发评审会
  log(4, '触发评审会 + SSE');
  const review = await post(`/projects/${projectId}/review/00`, {});
  console.log('✅ Review triggered:', review.data.reviewId);

  // 5. 获取评审会 SSE 流
  log(5, '评审会 SSE 流');
  const sseRaw = await getSSE(`/projects/${projectId}/review/00/stream`);
  const events = parseSSEEvents(sseRaw);
  console.log('  事件数:', events.length);
  for (const e of events) {
    if (e.event === 'error') {
      console.log('  ❌ Error:', e.data.message?.substring(0, 100));
    } else if (e.event === 'complete') {
      console.log('  ✅ Complete, decisions:', e.data.decisionCount);
    } else if (e.event === 'opening' || e.event === 'main_speech' || e.event === 'closing') {
      const name = e.data.speakerName || '?';
      const content = (e.data.content || '').substring(0, 60);
      console.log(`  ${e.event}: ${name}: "${content}..."`);
    } else if (e.event === 'interrupt') {
      console.log(`  interrupt: ${e.data.speakerName}: "${(e.data.content||'').substring(0,40)}..."`);
    }
  }

  // 6. 获取待决策
  log(6, '获取待决策');
  const decisions = await get(`/projects/${projectId}/decisions?status=pending`);
  console.log('  决策点数:', decisions.data.pendingDecisions.length);
  for (const d of decisions.data.pendingDecisions) {
    console.log(`  - ${d.id}: ${d.question}`);
  }

  // 7. 提交决策
  log(7, '提交决策');
  for (const d of decisions.data.pendingDecisions) {
    const choice = d.options[0]?.id || 'A';
    const result = await post(`/projects/${projectId}/decisions/${d.id}`, { choice, rationale: '同意' });
    console.log(`  ${d.id}: 选${choice} → next=${result.data.nextAction?.type}`);
  }

  // 8. Stage 00.5
  log(8, 'Stage 00.5 竞品分析');
  const s05 = await post(`/projects/${projectId}/stage/00.5/run`, { useMock: false });
  console.log('✅', s05.success, 'dataMode:', s05.data.dataMode);
  if (s05.data.warnings?.length) console.log('  ⚠️ Warnings:', s05.data.warnings);

  // 9. 推进 00.5 -> 01
  log(9, '推进阶段 00.5 -> 04');
  // 触发评审 + 决策 + 推进
  await post(`/projects/${projectId}/review/00.5`, {});
  const s05sse = await getSSE(`/projects/${projectId}/review/00.5/stream`);
  const s05events = parseSSEEvents(s05sse);
  const complete = s05events.find(e => e.event === 'complete');
  if (complete) {
    const decs = await get(`/projects/${projectId}/decisions?status=pending`);
    for (const d of decs.data.pendingDecisions) {
      await post(`/projects/${projectId}/decisions/${d.id}`, { choice: d.options[0]?.id || 'A', rationale: 'ok' });
    }
  } else {
    // fallback: advance manually
    await post(`/projects/${projectId}/stage/00.5/advance`, {});
  }

  // Stage 01-04
  for (const stage of ['01', '02', '03', '04']) {
    const run = await post(`/projects/${projectId}/stage/${stage}/run`, {});
    console.log(`  Stage ${stage}: ${run.success} state=${run.data.state} mock=${run.data.mock}`);
    await post(`/projects/${projectId}/stage/${stage}/advance`, {});
  }

  // 10. 最终状态
  log(10, '最终项目状态');
  const status = await get(`/projects/${projectId}/status`);
  console.log('  currentStage:', status.data.currentStage);
  console.log('  globalState:', status.data.globalState);
  for (const [k, v] of Object.entries(status.data.stages)) {
    console.log(`  ${k}: ${v.status} ${v.artifactPath || ''}`);
  }
  console.log('  decisions:', status.data.decisionHistory.length);

  // 导出
  const export_ = await get(`/projects/${projectId}/export`);
  console.log('\n  Export: files=' + export_.data.fileCount + ' prototype=' + export_.data.prototypeUrl);

  console.log('\n🎉 全流程测试完成！');
}

run().catch(e => console.error('FAILED:', e.message));
