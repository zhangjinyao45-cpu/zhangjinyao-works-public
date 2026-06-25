import assert from 'node:assert/strict';
import {
  DEMO_BRAINSTORMING_QUESTIONS,
  DEMO_TOTAL_QUESTIONS,
  getDemoQuestionByIndex,
} from '../src/services/demo-mode.js';

assert.equal(DEMO_TOTAL_QUESTIONS, 21, '演示题库应包含 21 道题');
assert.equal(DEMO_BRAINSTORMING_QUESTIONS.length, 21);
assert.deepEqual(
  DEMO_BRAINSTORMING_QUESTIONS.map(question => question.id),
  Array.from({ length: 21 }, (_, index) => `Q${index + 1}`),
  '题号应从 Q1 连续到 Q21'
);

const q17 = getDemoQuestionByIndex(16);
assert.equal(q17.question, '对话详情页采用哪种布局？');
assert.deepEqual(
  q17.options.map(option => option.label),
  [
    '左对话 + 右画像/分类',
    '上对话 + 下分析',
    '三栏布局',
  ]
);

const q18 = getDemoQuestionByIndex(17);
assert.equal(q18.question, 'MVP（首版）的范围想做多大？');
assert.deepEqual(
  q18.options.map(option => option.label),
  [
    '极简 MVP',
    '完整 P0',
    '分两期',
  ]
);

for (const question of DEMO_BRAINSTORMING_QUESTIONS) {
  assert.ok(question.dimId, `${question.id} 缺少 dimId`);
  assert.ok(question.dimName, `${question.id} 缺少 dimName`);
  assert.ok(['single_choice', 'multi_choice'].includes(question.type), `${question.id} 题型不合法`);
  assert.ok(Array.isArray(question.options) && question.options.length >= 2, `${question.id} 缺少选项`);

  const optionIds = question.options.map(option => option.id);
  assert.equal(new Set(optionIds).size, optionIds.length, `${question.id} 选项 ID 重复`);
  assert.ok(question.options.every(option => option.label), `${question.id} 存在空选项`);
}

console.log('demo brainstorming question contract passed');
