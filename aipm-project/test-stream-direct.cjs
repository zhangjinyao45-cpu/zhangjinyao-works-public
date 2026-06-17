// 快速测试：生成一个短回答看流式是否正常
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({
  apiKey: 'sk-qenAcqGhEkbOs8nNuO9Cexbn4yy8h4akA4I39NbPWHKd4541',
  baseURL: 'https://bobdong.cn/',
  timeout: 300000,
});

async function test() {
  console.log('Test 1: Short response (max_tokens=100)...');
  const t1 = Date.now();
  try {
    const stream = client.messages.stream({
      model: 'kimi-k2.6',
      max_tokens: 100,
      messages: [{ role: 'user', content: '说一个笑话' }],
    });
    const msg = await stream.finalMessage();
    console.log(`✅ Short: ${((Date.now()-t1)/1000).toFixed(1)}s, ${msg.content[0].text.length} chars`);
  } catch(e) {
    console.log(`❌ Short failed: ${e.message}`);
  }

  console.log('\nTest 2: Long response (max_tokens=8000, generate HTML prototype)...');
  const t2 = Date.now();
  try {
    const stream = client.messages.stream({
      model: 'kimi-k2.6',
      max_tokens: 8000,
      system: '你必须只输出完整的 HTML 文件，包含内联 CSS 和 JS。不要输出任何解释。',
      messages: [{ role: 'user', content: '生成一个大学生学习搭子匹配App的高保真可交互原型。手机端单页应用，带底部导航、首页推荐卡片、卡片点击展开详情、报名表单、成功反馈。中文UI，mock数据。' }],
    });
    
    // 监听流式事件
    let chunks = 0;
    let lastChunkTime = Date.now();
    stream.on('text', (text) => {
      chunks++;
      const now = Date.now();
      if (now - lastChunkTime > 10000 || chunks % 20 === 0) {
        console.log(`  chunk #${chunks}: +${text.length} chars, ${(now-t2)/1000}s elapsed`);
        lastChunkTime = now;
      }
    });
    
    const msg = await stream.finalMessage();
    const elapsed = ((Date.now()-t2)/1000).toFixed(1);
    const text = msg.content[0].text;
    console.log(`✅ Long: ${elapsed}s, ${text.length} chars, chunks: ${chunks}`);
    console.log('Has </html>:', text.includes('</html>'));
    console.log('Has <script>:', text.includes('<script>'));
    
    // 保存
    const fs = require('fs');
    let content = text;
    const fenceRe = /^```(?:html|HTML)?\s*\n?/;
    content = content.replace(fenceRe, '');
    if (content.trimEnd().endsWith('```')) content = content.trimEnd().slice(0, -3);
    fs.writeFileSync('C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages/04-UI交互原型.html', content.trim());
    console.log('Saved!');
  } catch(e) {
    console.log(`❌ Long failed after ${((Date.now()-t2)/1000).toFixed(1)}s: ${e.message}`);
  }
}

test();
