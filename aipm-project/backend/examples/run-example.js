/**
 * 运行示例：用 D5 测试时生成的产物跑一遍评审会
 */

import { ReviewSession } from '../src/review-session.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runExample() {
  console.log('🎯 运行示例：大学生兼职App 阶段0 评审会\n');

  // 使用 D5 测试时生成的产物
  const artifactPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    'aipm-test-workspace/projects/大学生兼职App/00-需求头脑风暴设计.md'
  );

  const session = new ReviewSession({
    useMock: true, // 示例用 Mock 模式（无需 API Key）
  });

  try {
    const result = await session.run('00', artifactPath);

    console.log('\n📊 评审会统计：');
    console.log(`   总发言：${result.metadata.totalSpeaks} 次`);
    console.log(`   插话：${result.metadata.interrupts} 次`);
    console.log(`   决策点：${result.decisions.length} 个`);

    console.log('\n✨ 示例运行成功！');
    console.log('\n💡 提示：');
    console.log('   - 当前使用 Mock 模式，发言内容是预设的');
    console.log('   - 设置 ANTHROPIC_API_KEY 并移除 USE_MOCK 可使用真实 API');
    console.log('   - 输出 JSON 位于 backend/output/ 目录');
  } catch (err) {
    console.error('\n❌ 示例运行失败:', err.message);
    throw err;
  }
}

runExample();
