const fs = require('fs');

async function test() {
  console.log('Testing stream call with 16000 maxTokens...');
  const start = Date.now();
  
  const res = await fetch('http://localhost:3000/api/projects/demo-campus-job/stage/04/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Response status: ${res.status}, elapsed: ${elapsed}s`);
  
  const result = await res.json();
  
  if (result.success && result.data?.content) {
    let content = result.data.content;
    // Strip markdown code fences
    const fenceRe = /^```(?:html|HTML)?\s*\n?/;
    content = content.replace(fenceRe, '');
    if (content.trimEnd().endsWith('```')) content = content.trimEnd().slice(0, -3);
    content = content.trim();
    
    const artifactPath = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages/04-UI交互原型.html';
    fs.writeFileSync(artifactPath, content);
    
    console.log(`✅ Generated: ${content.length} chars in ${elapsed}s`);
    console.log('Has </html>:', content.includes('</html>'));
    console.log('Has <script>:', content.includes('<script>'));
    console.log('Starts with:', content.substring(0, 50));
    console.log('Ends with:', content.substring(content.length - 50));
  } else {
    console.log('❌ Failed:', JSON.stringify(result).substring(0, 300));
  }
}

test().catch(e => console.error('Error:', e.message));
