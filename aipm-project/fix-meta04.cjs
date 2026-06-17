const fs = require('fs');
const path = 'C:/Users/zhangjinyao01_dxm/aipm-project/workspace/projects/demo-campus-job/meta.json';
const meta = JSON.parse(fs.readFileSync(path, 'utf8'));
meta.currentStage = '04';
meta.currentState = 'completed';
meta.globalState = 'completed';
meta.stages['04'] = {
  status: 'completed',
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  artifactPath: '04-UI交互原型.html',
  reviewPath: null,
  decisions: [],
  needsRedo: false
};
fs.writeFileSync(path, JSON.stringify(meta, null, 2));
console.log('Meta updated. Stage 04 marked as completed.');
