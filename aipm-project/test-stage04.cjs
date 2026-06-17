const fs = require('fs');

// Reset meta
const metaPath = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/meta.json';
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.currentStage = '04';
meta.currentState = 'pending';
meta.globalState = 'running';
meta.stages['04'] = { status: 'pending', startedAt: null, completedAt: null, artifactPath: null, reviewPath: null, decisions: [], needsRedo: false };
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

async function run() {
  console.log('Running Stage 04 with 16000 maxTokens...');
  const res = await fetch('http://localhost:3000/api/projects/demo-campus-job/stage/04/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  const result = await res.json();
  console.log('Success:', result.success, 'Mock:', result.data?.mock, 'Content length:', result.data?.content?.length);

  if (result.success && result.data?.content) {
    const artifactPath = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/stages/04-UI交互原型.html';
    let content = result.data.content;
    // Strip markdown code fences
    const fenceRe = /^```(?:html|HTML)?\s*\n?/;
    content = content.replace(fenceRe, '');
    if (content.trimEnd().endsWith('```')) content = content.trimEnd().slice(0, -3);
    content = content.trim();
    fs.writeFileSync(artifactPath, content);
    console.log('Written:', content.length, 'chars');
    console.log('Starts with:', content.substring(0, 60));
    console.log('Ends with:', content.substring(content.length - 60));
    console.log('Has </html>:', content.includes('</html>'));
    console.log('Has <script>:', content.includes('<script>'));
  } else {
    console.log('Failed:', JSON.stringify(result).substring(0, 200));
  }
}

run().catch(e => console.error('Error:', e.message));
