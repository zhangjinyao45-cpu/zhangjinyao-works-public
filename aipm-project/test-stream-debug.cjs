const API_KEY = 'sk-qenAcqGhEkbOs8nNuO9Cexbn4yy8h4akA4I39NbPWHKd4541';
const BASE_URL = 'https://bobdong.cn/v1/messages';

async function test() {
  console.log('Streaming HTML prototype, dumping raw SSE...');
  const t = Date.now();
  
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'kimi-k2.6',
      max_tokens: 16000,
      stream: true,
      system: '你必须只输出完整的 HTML 文件，包含内联 CSS 和 JS。不要输出任何解释。',
      messages: [{ role: 'user', content: '生成一个大学生学习搭子匹配App的高保真可交互原型。手机端单页应用，带底部导航（首页/发现/我的），首页 hero+推荐搭子卡片，卡片可点击展开详情面板，详情有"发起搭子"按钮，点击弹出表单，提交后显示成功页。中文UI，mock数据。' }],
    }),
  });

  console.log(`Status: ${res.status}`);
  
  const reader = res.body;
  let fullText = '';
  let rawChunks = 0;
  let lastLog = Date.now();
  let allRaw = '';

  for await (const chunk of reader) {
    rawChunks++;
    const raw = chunk.toString();
    allRaw += raw;
    
    // Try to parse SSE
    const lines = raw.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') { console.log('[DONE] received'); continue; }
        try {
          const evt = JSON.parse(data);
          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            fullText += evt.delta.text;
          } else if (evt.choices?.[0]?.delta?.content) {
            // OpenAI format
            fullText += evt.choices[0].delta.content;
          }
        } catch {}
      }
    }
    
    if (Date.now() - lastLog > 20000 || rawChunks <= 3) {
      console.log(`  ${((Date.now()-t)/1000).toFixed(0)}s: rawChunks=${rawChunks}, textLen=${fullText.length}`);
      if (rawChunks <= 3) console.log(`  Raw sample: ${raw.substring(0, 200)}`);
      lastLog = Date.now();
    }
  }

  const elapsed = ((Date.now()-t)/1000).toFixed(1);
  console.log(`\nDone: ${elapsed}s, ${rawChunks} raw chunks, ${fullText.length} chars`);
  
  // Save raw for debugging
  const fs = require('fs');
  fs.writeFileSync('C:/Users/zhangjinyao01_dxm/aipm-project/test-raw-sse.txt', allRaw.substring(0, 5000));
  console.log('Raw SSE saved to test-raw-sse.txt');
  
  if (fullText.length > 0) {
    let content = fullText;
    const fenceRe = /^```(?:html|HTML)?\s*\n?/;
    content = content.replace(fenceRe, '');
    if (content.trimEnd().endsWith('```')) content = content.trimEnd().slice(0, -3);
    fs.writeFileSync('C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages/04-UI交互原型.html', content.trim());
    console.log('Saved prototype!');
  } else {
    console.log('No text extracted, check raw SSE format');
  }
}

test().catch(e => console.error(e.message));
