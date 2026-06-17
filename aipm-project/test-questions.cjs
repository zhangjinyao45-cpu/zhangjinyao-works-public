const API = 'http://localhost:3000/api';
const project = '校园二手书交换';

async function test() {
  console.log('Fetching questions for:', project);
  const t = Date.now();
  const res = await fetch(`${API}/projects/${encodeURIComponent(project)}/stage/00/questions`);
  const result = await res.json();
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  
  if (!result.success) {
    console.log('Failed:', result);
    return;
  }
  
  const q = result.data;
  console.log(`\n✅ Loaded in ${elapsed}s`);
  console.log(`Intro: ${q.intro.substring(0, 80)}...`);
  console.log(`Dimensions: ${q.dimensions.length}`);
  
  let totalQ = 0;
  for (const dim of q.dimensions) {
    console.log(`\n--- ${dim.id}. ${dim.name} (${dim.questions.length} questions) ---`);
    for (const question of dim.questions) {
      totalQ++;
      console.log(`  ${question.id}: ${question.question.substring(0, 40)}... [${question.type}]`);
      if (question.options) {
        for (const opt of question.options) {
          console.log(`    ${opt.id}: ${opt.label} — ${opt.description}`);
        }
      }
    }
  }
  console.log(`\nTotal: ${totalQ} questions`);
}

test().catch(e => console.error(e.message));
