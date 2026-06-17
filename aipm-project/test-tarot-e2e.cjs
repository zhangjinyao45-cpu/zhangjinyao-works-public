// Full e2e test for tarot-divination project
const http = require('http');

const BASE = { hostname: '127.0.0.1', port: 3000 };
const PROJECT = 'tarot-divination';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { ...BASE, path: `/api/projects/${PROJECT}${path}`, method, headers: {} };
    let data = '';
    if (body) {
      data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(600000, () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== AIPM E2E Test: 塔罗牌占卜网站 ===\n');

  // Stage 0: Submit answers
  console.log('[Stage 00] 提交需求头脑风暴答案...');
  const answers = [
    { questionId: 'A1', answer: '决策辅助' },
    { questionId: 'A2', answer: '日常决策困惑者' },
    { questionId: 'A3', answer: '独立占卜网站' },
    { questionId: 'A4', answer: '核心功能是否成立' },
    { questionId: 'B1', answer: '18-35岁年轻用户' },
    { questionId: 'B2', answer: '碎片时间无聊浏览' },
    { questionId: 'B3', answer: '偶尔使用' },
    { questionId: 'B4', answer: '没有好方案' },
    { questionId: 'B5', answer: '提问→AI处理→结果→调整' },
    { questionId: 'B6', answer: '判断不了好坏' },
    { questionId: 'C1', answer: '搜索/筛选/推荐' },
    { questionId: 'C2', answer: 'AI智能生成' },
    { questionId: 'C3', answer: 'AI智能推荐' },
    { questionId: 'C4', answer: '即时通讯/聊天' },
    { questionId: 'D1', answer: '首页/发现页' },
    { questionId: 'D2', answer: '首页' },
    { questionId: 'D3', answer: '单页工作台' },
    { questionId: 'E1', answer: '浏览/滑动' },
    { questionId: 'E2', answer: '温暖轻松' },
    { questionId: 'E3', answer: '暖色亲切' },
    { questionId: 'E4', answer: '小红书' },
    { questionId: 'F1', answer: '塔罗牌要神秘感但不能封建迷信，AI解读要专业可信，视觉要有星空/水晶/月亮氛围' },
  ];

  const s0 = await api('POST', '/stage/00/answers', { answers });
  console.log('  Status:', s0.status, 'State:', s0.data?.data?.state || s0.data?.data?.currentState || 'N/A');
  console.log('  Artifact:', s0.data?.data?.artifactPath || 'N/A');
  if (s0.status !== 200) { console.log('  Error:', JSON.stringify(s0.data).slice(0, 300)); return; }

  // Stage 0: Review
  console.log('[Stage 00] 圆桌评审...');
  const r0 = await api('POST', '/review/00');
  console.log('  Status:', r0.status, 'Reviews:', r0.data?.data?.transcript?.length || 0);

  // Stage 0: Decision
  console.log('[Stage 00] 自动决策...');
  const d0 = await api('POST', '/decisions/00');
  console.log('  Status:', d0.status, 'Decisions:', d0.data?.data?.length || 0);

  // Stage 0.5: Competitor Analysis
  console.log('[Stage 0.5] 竞品分析...');
  const s05 = await api('POST', '/stage/00.5/run');
  console.log('  Status:', s05.status, 'State:', s05.data?.data?.state || 'N/A');
  console.log('  Artifact:', s05.data?.data?.artifactPath || 'N/A');
  if (s05.status !== 200) { console.log('  Error:', JSON.stringify(s05.data).slice(0, 300)); }

  // Stage 0.5: Review
  console.log('[Stage 0.5] 圆桌评审...');
  const r05 = await api('POST', '/review/00.5');
  console.log('  Status:', r05.status);

  // Stage 0.5: Decision
  console.log('[Stage 0.5] 自动决策...');
  const d05 = await api('POST', '/decisions/00.5');
  console.log('  Status:', d05.status);

  // Stage 01: Prompt Enhancement
  console.log('[Stage 01] 提示增强...');
  const s1 = await api('POST', '/stage/01/run');
  console.log('  Status:', s1.status, 'State:', s1.data?.data?.state || 'N/A');
  if (s1.status !== 200) { console.log('  Error:', JSON.stringify(s1.data).slice(0, 300)); }

  // Stage 01: Decision
  console.log('[Stage 01] 自动决策...');
  const d1 = await api('POST', '/decisions/01');
  console.log('  Status:', d1.status);

  // Stage 02: PRD
  console.log('[Stage 02] PRD生成...');
  const s2 = await api('POST', '/stage/02/run');
  console.log('  Status:', s2.status, 'State:', s2.data?.data?.state || 'N/A');
  if (s2.status !== 200) { console.log('  Error:', JSON.stringify(s2.data).slice(0, 300)); }

  // Stage 02: Review
  console.log('[Stage 02] 圆桌评审...');
  const r2 = await api('POST', '/review/02');
  console.log('  Status:', r2.status);

  // Stage 02: Decision
  console.log('[Stage 02] 自动决策...');
  const d2 = await api('POST', '/decisions/02');
  console.log('  Status:', d2.status);

  // Stage 03: Wireframe
  console.log('[Stage 03] 线框图生成...');
  const s3 = await api('POST', '/stage/03/run');
  console.log('  Status:', s3.status, 'State:', s3.data?.data?.state || 'N/A');
  if (s3.status !== 200) { console.log('  Error:', JSON.stringify(s3.data).slice(0, 300)); }

  // Stage 03: Decision
  console.log('[Stage 03] 自动决策...');
  const d3 = await api('POST', '/decisions/03');
  console.log('  Status:', d3.status);

  // Stage 04: High-fidelity Prototype
  console.log('[Stage 04] 高保真原型生成...');
  const s4 = await api('POST', '/stage/04/run');
  console.log('  Status:', s4.status, 'State:', s4.data?.data?.state || 'N/A');
  if (s4.status !== 200) { console.log('  Error:', JSON.stringify(s4.data).slice(0, 300)); }

  // Stage 04: Decision
  console.log('[Stage 04] 自动决策...');
  const d4 = await api('POST', '/decisions/04');
  console.log('  Status:', d4.status);

  // Verify all artifacts
  console.log('\n=== 验证产物 ===');
  const stages = ['00', '00.5', '01', '02', '03', '04'];
  for (const s of stages) {
    const meta = await api('GET', ``);
    const stageInfo = meta.data?.data?.stages?.[s];
    if (stageInfo) {
      console.log(`  Stage ${s}: status=${stageInfo.status} artifact=${stageInfo.artifactPath || 'N/A'}`);
    }
  }

  console.log('\n=== E2E Test Complete ===');
}

run().catch(e => console.error('Fatal:', e.message));
