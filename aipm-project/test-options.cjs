// 快速测试 callClaude 能否在 60s 内返回定制选项
const API_KEY = 'sk-qenAcqGhEkbOs8nNuO9Cexbn4yy8h4akA4I39NbPWHKd4541';
const BASE_URL = 'https://bobdong.cn/v1/messages';

async function test() {
  const t = Date.now();
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'kimi-k2.6',
      max_tokens: 3000,
      stream: true,
      system: '你是周明，AIPM 团队的 Lead PM。根据用户的具体产品想法，为问卷的每道题生成更贴合该产品的选项。输出严格JSON，不要其他内容。',
      messages: [{ role: 'user', content: `用户产品想法：帮大学生把用过的教材和课外书低价转给下一届同学\n项目名：校园二手书交换\n\n以下是一份产品头脑风暴问卷的题目列表。请为每道题生成3-5个更贴合该产品想法的选项。选项要具体、可直接选择。\n\n题目：\nA1: 如果用一句话描述，你想做一个什么产品？它最核心解决什么问题？ (single_choice)\nA2: 这个产品主要给谁用？ (single_choice)\nA3: 你希望它最终是什么形态？ (single_choice)\nA4: 如果第一版只能验证一件事，你最希望验证什么？ (single_choice)\n\n输出格式：\n{"A1":[{"id":"A1a","label":"具体选项","description":"一句话解释"},{"id":"A1b","label":"...","description":"..."}],"A2":[...],"A3":[...],"A4":[...]}\n\n只输出JSON` }],
    }),
  });

  console.log('Status:', res.status);
  let fullText = '';
  let buffer = '';
  for await (const chunk of res.body) {
    const text = Buffer.from(chunk).toString('utf8');
    buffer += text;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.text) fullText += evt.delta.text;
          } catch {}
        }
      }
    }
  }
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  console.log(`Done: ${elapsed}s, ${fullText.length} chars`);
  
  // Parse
  let cleaned = fullText;
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
  try {
    const parsed = JSON.parse(cleaned.trim());
    console.log('Parsed OK!');
    for (const [qid, opts] of Object.entries(parsed)) {
      console.log(`  ${qid}: ${opts.map(o => o.label).join(' / ')}`);
    }
  } catch (e) {
    console.log('Parse failed:', e.message);
    console.log('Raw:', fullText.substring(0, 300));
  }
}

test().catch(e => console.error(e.message));
