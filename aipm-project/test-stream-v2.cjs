const fs = require('fs');
const API_KEY = 'sk-qenAcqGhEkbOs8nNuO9Cexbn4yy8h4akA4I39NbPWHKd4541';
const BASE_URL = 'https://bobdong.cn/v1/messages';

async function test() {
  console.log('Streaming HTML prototype...');
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
  let buffer = '';

  for await (const chunk of reader) {
    rawChunks++;
    // chunk 可能是 Uint8Array，需要正确解码
    let text;
    if (typeof chunk === 'string') {
      text = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      text = chunk.toString('utf8');
    } else if (chunk instanceof Uint8Array) {
      text = Buffer.from(chunk).toString('utf8');
    } else {
      text = String(chunk);
    }
    
    buffer += text;
    
    // Process complete SSE messages
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || ''; // keep incomplete part
    
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              fullText += evt.delta.text;
            }
          } catch {}
        }
      }
    }
    
    if (Date.now() - lastLog > 20000) {
      console.log(`  ${((Date.now()-t)/1000).toFixed(0)}s: chunks=${rawChunks}, textLen=${fullText.length}`);
      lastLog = Date.now();
    }
  }

  const elapsed = ((Date.now()-t)/1000).toFixed(1);
  console.log(`\nDone: ${elapsed}s, ${rawChunks} chunks, ${fullText.length} chars`);
  console.log('Has </html>:', fullText.includes('</html>'));
  console.log('Has <script>:', fullText.includes('<script>'));
  
  if (fullText.length > 0) {
    let content = fullText;
    const fenceRe = /^```(?:html|HTML)?\s*\n?/;
    content = content.replace(fenceRe, '');
    if (content.trimEnd().endsWith('```')) content = content.trimEnd().slice(0, -3);
    content = content.trim();
    const outPath = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages/04-UI交互原型.html';
    fs.writeFileSync(outPath, content);
    console.log(`✅ Saved! ${content.length} chars`);
  } else {
    console.log('❌ No text extracted');
  }
}

test().catch(e => console.error(e.message));
