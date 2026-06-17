// 测试评审会是否使用真实文档内容
const API = 'http://localhost:3000/api';
const project = 'demo-campus-job';

async function test() {
  console.log('=== 测试评审会（Stage 00，需求头脑风暴）===');
  
  // 1. 触发评审会
  const triggerRes = await fetch(`${API}/projects/${project}/review/00`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const triggerResult = await triggerRes.json();
  console.log('Trigger:', triggerResult.success ? 'OK' : triggerResult.error?.message);
  
  // 2. SSE 监听
  const streamUrl = `${API}/projects/${project}/review/00/stream`;
  const entries = [];
  
  return new Promise((resolve, reject) => {
    const es = new EventSource(streamUrl);
    const timeout = setTimeout(() => { es.close(); reject(new Error('Timeout')); }, 300000);
    
    es.addEventListener('ready', () => console.log('SSE ready'));
    
    ['opening', 'main_speech', 'interrupt', 'response', 'closing'].forEach(type => {
      es.addEventListener(type, (e) => {
        const data = JSON.parse(e.data);
        entries.push(data);
        console.log(`[${type}] ${data.speakerName}: ${data.content.substring(0, 60)}...`);
      });
    });
    
    es.addEventListener('complete', (e) => {
      clearTimeout(timeout);
      es.close();
      const data = JSON.parse(e.data);
      console.log(`\nComplete! Total: ${entries.length} entries`);
      console.log('Decision count:', data.decisionCount);
      
      // 检查发言是否基于真实文档
      for (const entry of entries) {
        const mentionsProduct = /校园|兼职|岗位|雇主|靠谱|结算|同校/.test(entry.content);
        const isGeneric = /mock|置信度|mock数据/.test(entry.content);
        console.log(`  ${entry.speakerName}(${entry.type}): ${mentionsProduct ? '✅ 提到产品内容' : '❓ 泛泛而谈'} ${isGeneric ? '⚠️ 含mock标记' : ''}`);
      }
      resolve(entries);
    });
    
    es.addEventListener('error', (e) => {
      clearTimeout(timeout);
      es.close();
      reject(new Error('SSE error'));
    });
  });
}

test().catch(e => console.error('Error:', e.message));
