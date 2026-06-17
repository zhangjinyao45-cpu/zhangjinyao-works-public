// 测试渐进式问答流程
const API = 'http://localhost:3000/api';
const project = '校园二手书交换';

async function test() {
  // 1. 获取第一题
  console.log('=== 第一题 ===');
  const r1 = await fetch(`${API}/projects/${encodeURIComponent(project)}/stage/00/first-question`);
  const d1 = await r1.json();
  const q1 = d1.data;
  console.log(`Q: ${q1.id}: ${q1.question}`);
  console.log(`Options: ${q1.options.map(o => o.label).join(' / ')}`);

  // 2. 模拟回答 A1a，获取下一题（动态生成选项）
  console.log('\n=== 回答后获取下一题 ===');
  const t = Date.now();
  const history = [{ questionId: 'A1', answer: 'A1a' }]; // 选了"撮合匹配"
  const r2 = await fetch(`${API}/projects/${encodeURIComponent(project)}/stage/00/next-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answerHistory: history, currentIndex: 0 }),
  });
  const d2 = await r2.json();
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  
  if (d2.data.done) {
    console.log('All done!');
    return;
  }
  
  const q2 = d2.data;
  console.log(`Time: ${elapsed}s`);
  console.log(`Q: ${q2.id}: ${q2.question}`);
  console.log(`Options: ${q2.options.map(o => o.label).join(' / ')}`);

  // 3. 再回答一题，获取第三题
  console.log('\n=== 第三题 ===');
  const t2 = Date.now();
  history.push({ questionId: 'A2', answer: 'A2a' });
  const r3 = await fetch(`${API}/projects/${encodeURIComponent(project)}/stage/00/next-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answerHistory: history, currentIndex: 1 }),
  });
  const d3 = await r3.json();
  const elapsed2 = ((Date.now() - t2) / 1000).toFixed(1);
  const q3 = d3.data;
  console.log(`Time: ${elapsed2}s`);
  console.log(`Q: ${q3.id}: ${q3.question}`);
  console.log(`Options: ${q3.options.map(o => o.label).join(' / ')}`);
}

test().catch(e => console.error(e));
