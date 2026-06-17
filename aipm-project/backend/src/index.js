/**
 * CLI 入口
 * 用法：node src/index.js <stage> <artifact-path>
 */

import { ReviewSession } from './review-session.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(`
用法：node src/index.js <stage> <artifact-path>

示例：
  node src/index.js 00 ../workspace/projects/大学生兼职App/00-需求头脑风暴设计.md

环境变量：
  ANTHROPIC_API_KEY - Claude API Key（必需，除非 USE_MOCK=true）
  USE_MOCK=true      - 开发模式（无需 API Key，快速验证流程）
    `);
    process.exit(1);
  }

  const [stage, artifactPath] = args;

  console.log('🚀 AIPM 评审会编排器 v0.1.0');
  console.log(`   阶段: ${stage}`);
  console.log(`   产物: ${artifactPath}`);
  console.log(`   模式: ${process.env.USE_MOCK === 'true' ? 'Mock（开发）' : '真实 API'}\n`);

  try {
    const session = new ReviewSession({
      useMock: process.env.USE_MOCK === 'true',
    });

    const result = await session.run(stage, artifactPath);

    // 输出 JSON
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsonPath = path.join(outputDir, `review-${stage}-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    console.log(`📦 输出 JSON: ${jsonPath}`);

    // 输出 Markdown 纪要
    const mdPath = path.join(outputDir, `review-${stage}-${Date.now()}.md`);
    const markdown = generateMarkdown(result);
    fs.writeFileSync(mdPath, markdown);

    console.log(`📝 输出纪要: ${mdPath}`);

    console.log('\n✨ 评审会完成！');
  } catch (err) {
    console.error('\n❌ 错误:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

/**
 * 生成 Markdown 纪要
 */
function generateMarkdown(result) {
  const { stage, transcript, decisions, metadata } = result;

  let md = `# ${stage}-评审会纪要\n\n`;
  md += `> 生成时间：${new Date().toISOString()}\n`;
  md += `> 阶段：阶段${stage}\n`;
  md += `> 总发言：${metadata.totalSpeaks} 次\n`;
  md += `> 插话次数：${metadata.interrupts} 次\n\n`;

  md += `## 评审记录\n\n`;

  transcript.forEach((entry, i) => {
    const timeLabel = entry.time || `[${i}]`;
    const typeLabel = {
      opening: '开场',
      main_speech: '主发言',
      interrupt: '插话',
      response_to_interrupt: '回应',
      closing: '收敛',
    }[entry.type] || entry.type;

    md += `### ${timeLabel} ${entry.speakerName}（${typeLabel}）\n\n`;
    md += `> ${entry.content}\n\n`;
  });

  md += `## 决策点（待用户拍板）\n\n`;

  decisions.forEach(d => {
    md += `### ${d.id}: ${d.question}\n\n`;
    // 简化版：完整决策点解析留给后续
    md += `（决策选项待提取）\n\n`;
  });

  return md;
}

main();
