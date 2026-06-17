const API_KEY = 'sk-qenAcqGhEkbOs8nNuO9Cexbn4yy8h4akA4I39NbPWHKd4541';
const BASE_URL = 'https://bobdong.cn/v1/messages';

async function test() {
  const idea = '帮大学生把用过的教材和课外书低价转给下一届同学';
  const qids = 'A1(single_choice),A2(single_choice),A3(single_choice),A4(single_choice),B1(single_choice),B2(single_choice),B3(single_choice),B4(multi_choice),B5(single_choice),B6(single_choice),C1(single_choice),C2(multi_choice),C3(multi_choice),C4(multi_choice)';
  
  const prompt = `产品：${idea}\n为这些题生成3-5个贴合该产品的选项：\n${qids}\n输出：{"A1":[{"id":"A1a","label":"选项","description":"解释"}],"A2":[...]}\n只输出JSON`;
  
  const t = Date.now();
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'kimi-k2.6', max_tokens: 3000, stream: true, messages: [{ role: 'user', content: prompt }] }),
  });

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
          try { const evt = JSON.parse(line.slice(6)); if (evt.type === 'content_block_delta' && evt.delta?.text) fullText += evt.delta.text; } catch {}
        }
      }
    }
  }
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  console.log(`Done: ${elapsed}s, ${fullText.length} chars`);
  
  let cleaned = fullText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
  try {
    const parsed = JSON.parse(cleaned.trim());
    console.log('✅ Parsed! Keys:', Object.keys(parsed).length);
    for (const [qid, opts] of Object.entries(parsed)) {
      console.log(`  ${qid}: ${opts.map(o => o.label).join(' / ')}`);
    }
  } catch (e) {
    console.log('❌ Parse failed:', e.message);
  }
}

test().catch(e => console.error(e.message));
