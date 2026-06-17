#!/usr/bin/env node
/**
 * Hacker News 搜索（Algolia 官方 API）
 *
 * 用法：
 *   node hn-search.js "<查询词>" [--limit 20] [--min-points 50] [--write file.json]
 *
 * 示例：
 *   node hn-search.js "task manager" --limit 20
 *   node hn-search.js "notion alternative" --min-points 100 --limit 30
 *
 * 接口：https://hn.algolia.com/api/v1/search
 *
 * 用途：
 * - 找海外/技术圈对某个产品或赛道的讨论
 * - 看真实开发者的吐槽和推荐
 * - 验证趋势（某赛道是否被技术圈关注）
 *
 * 注意：无需 API Key，每小时 10000 次免费
 */

const https = require('https');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node hn-search.js "<查询词>" [--limit 20] [--min-points 50] [--write file.json]');
    process.exit(1);
  }
  const opts = {
    query: args[0],
    limit: 20,
    minPoints: 0,
    write: null,
  };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
    else if (args[i] === '--min-points') opts.minPoints = parseInt(args[++i], 10);
    else if (args[i] === '--write') opts.write = args[++i];
  }
  return opts;
}

function fetchSearch(query, limit, minPoints) {
  return new Promise((resolve, reject) => {
    let url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
    if (minPoints > 0) {
      url += `&numericFilters=${encodeURIComponent('points>=' + minPoints)}`;
    }
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function simplify(hits) {
  return hits.map((h) => ({
    id: h.objectID,
    title: h.title,
    url: h.url,
    hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
    author: h.author,
    points: h.points,
    numComments: h.num_comments,
    createdAt: h.created_at,
    tags: h._tags,
  }));
}

async function main() {
  const opts = parseArgs();
  console.error(`搜索 HN: "${opts.query}" (limit ${opts.limit}${opts.minPoints ? `, points>=${opts.minPoints}` : ''})...`);

  const result = await fetchSearch(opts.query, opts.limit, opts.minPoints);
  const hits = simplify(result.hits || []);

  const output = {
    query: opts.query,
    source: 'hacker_news',
    fetched_at: new Date().toISOString(),
    total: hits.length,
    total_available: result.nbHits,
    stories: hits,
  };

  if (opts.write) {
    fs.writeFileSync(opts.write, JSON.stringify(output, null, 2));
    console.error(`\n已写入 ${opts.write}`);
    console.error(`找到 ${hits.length} 个故事（共 ${result.nbHits} 个匹配）：`);
    hits.slice(0, 10).forEach((h, i) => {
      console.error(`  ${i + 1}. [${h.points}↑ ${h.numComments}💬] ${h.title}`);
    });
    if (hits.length > 10) console.error(`  ...还有 ${hits.length - 10} 个`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
