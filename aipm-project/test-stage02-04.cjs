const BASE = 'http://localhost:3000/api';
const fs = require('fs');
const META_PATH = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/meta.json';
const STAGES_DIR = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages';

async function post(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return {success: false, raw: text.substring(0,300)}; }
}
async function get(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

async function main() {
  const pid = 'demo-campus-job';

  // 修复 meta
  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  meta.currentStage = '02';
  meta.currentState = 'pending';
  meta.stages['02'] = { status: 'pending', startedAt: null, completedAt: null, artifactPath: null, reviewPath: null, decisions: [], needsRedo: false };
  meta.stages['03'] = { status: 'pending', startedAt: null, completedAt: null, artifactPath: null, reviewPath: null, decisions: [], needsRedo: false };
  meta.stages['04'] = { status: 'pending', startedAt: null, completedAt: null, artifactPath: null, reviewPath: null, decisions: [], needsRedo: false };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  console.log('Meta reset: stage 02-04 -> pending');

  for (const stage of ['02', '03', '04']) {
    console.log(`\n--- Stage ${stage} ---`);
    const r = await post(`/projects/${pid}/stage/${stage}/run`, {});
    console.log(`  Run: success=${r.success} state=${r.data?.state} mock=${r.data?.mock}`);
    if (!r.success) {
      console.log(`  ERROR: ${r.raw || r.message || JSON.stringify(r).substring(0,200)}`);
      break;
    }
    const a = await post(`/projects/${pid}/stage/${stage}/advance`, {});
    console.log(`  Advance: success=${a.success} next=${a.data?.nextStage}`);
  }

  // Final status
  const s = await get(`/projects/${pid}/status`);
  console.log(`\n=== Final: stage=${s.data.currentStage} global=${s.data.globalState} ===`);
  for (const [k, v] of Object.entries(s.data.stages)) {
    console.log(`  ${k}: ${v.status} ${v.artifactPath || ''}`);
  }

  // File sizes
  if (fs.existsSync(STAGES_DIR)) {
    console.log('\n--- Generated Files ---');
    fs.readdirSync(STAGES_DIR).forEach(f => {
      const c = fs.readFileSync(STAGES_DIR + '/' + f, 'utf8');
      console.log(`  ${f}: ${c.length} chars`);
    });
  }
}

main().catch(e => console.error('FAILED:', e.message));
