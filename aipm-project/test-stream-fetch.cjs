const fs = require('fs');

const API_KEY = 'sk-qenAcqGhEkbOs8nNuO9Cexbn4yy8h4akA4I39NbPWHKd4541';
const BASE_URL = 'https://bobdong.cn/v1/messages';

async function test() {
  // Test 1: short
  console.log('Test 1: Short response...');
  const t1 = Date.now();
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'kimi-k2.6',
        max_tokens: 100,
        messages: [{ role: 'user', content: '说一个笑话' }],
      }),
    });
    const data = await res.json();
    console.log(`✅ Short: ${((Date.now()-t1)/1000).toFixed(1)}s, status=${res.status}`);
    if (data.content) console.log('  Text:', data.content[0].text?.substring(0, 80));
    else console.log('  Error:', JSON.stringify(data).substring(0, 200));
  } catch(e) {
    console.log(`❌ Short: ${e.message}`);
  }

  // Test 2: stream long response
  console.log('\nTest 2: Streaming long HTML prototype (max_tokens=16000)...');
  const t2 = Date.now();
  try {
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

    console.log(`Stream status: ${res.status}`);
    if (res.status !== 200) {
      const text = await res.text();
      console.log('Error:', text.substring(0, 300));
      return;
    }

    const reader = res.body;
    let fullText = '';
    let events = 0;
    let lastLog = Date.now();

    for await (const chunk of reader) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            events++;
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              fullText += evt.delta.text;
            }
            if (Date.now() - lastLog > 15000) {
              console.log(`  ${((Date.now()-t2)/1000).toFixed(0)}s: ${fullText.length} chars, ${events} events`);
              lastLog = Date.now();
            }
          } catch {}
        }
      }
    }

    const elapsed = ((Date.now()-t2)/1000).toFixed(1);
    console.log(`\n✅ Stream done: ${elapsed}s, ${fullText.length} chars, ${events} events`);
    console.log('Has </html>:', fullText.includes('</html>'));
    console.log('Has <script>:', fullText.includes('<script>'));

    // Save
    let content = fullText;
    const fenceRe = /^```(?:html|HTML)?\s*\n?/;
    content = content.replace(fenceRe, '');
    if (content.trimEnd().endsWith('```')) content = content.trimEnd().slice(0, -3);
    content = content.trim();
    const outPath = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages/04-UI交互原型.html';
    fs.writeFileSync(outPath, content);
    console.log(`Saved to ${outPath}`);
  } catch(e) {
    console.log(`❌ Stream failed after ${((Date.now()-t2)/1000).toFixed(1)}s: ${e.message}`);
  }
}

test();
