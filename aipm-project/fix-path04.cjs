const fs = require('fs');
const path = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/meta.json';
const meta = JSON.parse(fs.readFileSync(path, 'utf8'));
meta.stages['04'].artifactPath = 'stages/04-UI交互原型.html';
fs.writeFileSync(path, JSON.stringify(meta, null, 2));
console.log('Fixed artifactPath to:', meta.stages['04'].artifactPath);
