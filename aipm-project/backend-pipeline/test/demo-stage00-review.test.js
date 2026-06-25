import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const reviewPath = path.resolve(
  testDir,
  '../../frontend/data/dxm-conversation-intel/reviews/00-review.json'
);
const review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));

assert.equal(
  review.transcript.some(entry => entry.speaker === 'gu-qing'),
  false,
  'Stage 00 演示评审不应包含顾清发言'
);

const liHangEntries = review.transcript.filter(entry => entry.speaker === 'li-hang');
assert.ok(liHangEntries.length >= 1, 'Stage 00 演示评审应包含李航发言');

const liHangText = liHangEntries.map(entry => entry.content).join('\n');
assert.match(liHangText, /总计 15 个工作日，3 周/);
assert.match(liHangText, /固定大模型和信息上下文已具备/);
assert.doesNotMatch(
  liHangText,
  /大模型从哪来|LLM 选型|外部 LLM|本地开源模型|fine-tune|13 周|65 天|训练\+部署/
);

const fullText = JSON.stringify(review);
assert.doesNotMatch(fullText, /顾青的市场数据支持|顾青领走|LLM 选型决策|13 周|65 天/);

console.log('demo stage 00 review contract passed');

const stage05ReviewPath = path.resolve(
  testDir,
  '../../frontend/data/dxm-conversation-intel/reviews/00.5-review.json'
);
const stage05Review = JSON.parse(fs.readFileSync(stage05ReviewPath, 'utf-8'));
const stage05LiHangText = stage05Review.transcript
  .filter(entry => entry.speaker === 'li-hang')
  .map(entry => entry.content)
  .join('\n');

assert.match(stage05LiHangText, /总工期仍然是 3 周/);
assert.doesNotMatch(
  stage05LiHangText,
  /LLM|大模型从哪来|模型选型|外部模型|本地开源模型|fine-tune|10 周|13 周|50 天|65 天/
);

console.log('demo stage 00.5 engineering review contract passed');
