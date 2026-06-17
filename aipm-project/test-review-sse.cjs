// 测试评审会 — 用 fetch + SSE 手动解析
const API = 'http://localhost:3000/api';
const project = 'demo-campus-job';

async function test() {
  console.log('=== 触发评审会 ===');
  await fetch(`${API}/projects/${project}/review/00`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  console.log('=== 监听 SSE ===');
  const res = await fetch(`${API}/projects/${project}/review/00/stream`);
  
  let buffer = '';
  const entries = [];
  const t = Date.now();
  
  for await (const chunk of res.body) {
    const text = Buffer.from(chunk).toString('utf8');
    buffer += text;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    
    for (const part of parts) {
      let eventType = '';
      let eventData = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7);
        if (line.startsWith('data: ')) eventData = line.slice(6);
      }
      if (!eventType || !eventData) continue;
      
      try {
        const data = JSON.parse(eventData);
        if (['opening', 'main_speech', 'interrupt', 'closing', 'response'].includes(eventType)) {
          entries.push({ ...data, _type: eventType });
          const elapsed = ((Date.now() - t) / 1000).toFixed(0);
          console.log(`[${elapsed}s] ${eventType}: ${data.speakerName} — ${data.content.substring(0, 80)}...`);
        } else if (eventType === 'complete') {
          console.log(`\n=== 完成 ===`);
          console.log(`总发言: ${entries.length} 条`);
          console.log(`决策点: ${data.decisionCount}`);
          
          // 分析内容质量
          console.log('\n=== 内容分析 ===');
          for (const e of entries) {
            const hasProductRef = /校园|兼职|岗位|雇主|靠谱|结算|同校|大学生/.test(e.content);
            const hasMock = /mock|置信度.*mock/.test(e.content);
            console.log(`  ${e.speakerName}(${e._type}): ${hasProductRef ? '✅' : '❌'} ${hasMock ? '⚠️mock' : '真实'} | ${e.content.substring(0, 50)}`);
          }
          return;
        }
      } catch {}
    }
  }
}

test().catch(e => console.error('Error:', e.message));
