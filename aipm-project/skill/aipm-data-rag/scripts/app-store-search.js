#!/usr/bin/env node
/**
 * App Store App 搜索（iTunes Search API）
 *
 * 用法：
 *   node app-store-search.js "<关键词>" [--country cn] [--limit 10] [--write file.json]
 *
 * 示例：
 *   node app-store-search.js "任务管理" --country cn --limit 10
 *   node app-store-search.js "task manager" --country us --limit 5
 *
 * 用途：
 * - 找直接竞品的 App ID（用于后续拉评论）
 * - 拿评分、下载量、价格、截图等元数据
 *
 * 接口：https://itunes.apple.com/search （无需 API Key）
 */

const https = require('https');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node app-store-search.js "<关键词>" [--country cn] [--limit 10] [--write file.json]');
    process.exit(1);
  }
  const opts = { term: args[0], country: 'cn', limit: 10, write: null };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--country') opts.country = args[++i];
    else if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
    else if (args[i] === '--write') opts.write = args[++i];
  }
  return opts;
}

function fetchSearch(term, country, limit) {
  return new Promise((resolve, reject) => {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=software&limit=${limit}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function simplify(apps) {
  return apps.map((a) => ({
    id: a.trackId,
    name: a.trackName,
    bundleId: a.bundleId,
    seller: a.sellerName,
    description: a.description?.slice(0, 500),
    price: a.price,
    currency: a.currency,
    averageRating: a.averageUserRating,
    ratingCount: a.userRatingCount,
    averageRatingCurrentVersion: a.averageUserRatingForCurrentVersion,
    ratingCountCurrentVersion: a.userRatingCountForCurrentVersion,
    version: a.version,
    releaseDate: a.releaseDate,
    currentVersionReleaseDate: a.currentVersionReleaseDate,
    primaryGenre: a.primaryGenreName,
    genres: a.genres,
    languageCodes: a.languageCodesISO2A,
    appStoreUrl: a.trackViewUrl,
    iconUrl: a.artworkUrl512 || a.artworkUrl100,
    screenshotUrls: (a.screenshotUrls || []).slice(0, 4),
  }));
}

async function main() {
  const opts = parseArgs();
  console.error(`搜索 "${opts.term}" (${opts.country.toUpperCase()} App Store, limit ${opts.limit})...`);

  const result = await fetchSearch(opts.term, opts.country, opts.limit);
  const apps = simplify(result.results || []);

  const output = {
    query: opts.term,
    country: opts.country,
    fetched_at: new Date().toISOString(),
    total: apps.length,
    apps,
  };

  if (opts.write) {
    fs.writeFileSync(opts.write, JSON.stringify(output, null, 2));
    console.error(`\n已写入 ${opts.write}`);
    console.error(`找到 ${apps.length} 个 App：`);
    apps.forEach((a, i) => {
      console.error(`  ${i + 1}. ${a.name} (id=${a.id}, ⭐${a.averageRating?.toFixed(1) || 'N/A'} × ${a.ratingCount || 0})`);
    });
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
