#!/usr/bin/env node

/**
 * Minimal Pexels search helper for jinshan-aipm prototype work.
 *
 * Usage:
 *   node scripts/pexels-search.js "moody coffee shop interior"
 *   node scripts/pexels-search.js "quiet cocktail bar interior" --per-page 6 --orientation portrait
 *   node scripts/pexels-search.js "editorial restaurant interior" --write results.json
 */

const API_KEY = "omwklTEJRj66M1cARVdU0vhXbZhTUldHDIZW6NWEVXVrMPzdQpbGe93C";
const API_ENDPOINT = "https://api.pexels.com/v1/search";

function printHelp() {
  console.log(`
Pexels image search helper

Usage:
  node scripts/pexels-search.js "<query>" [options]

Options:
  --per-page <n>        Number of results to request. Default: 8
  --page <n>            Page number. Default: 1
  --orientation <type>  portrait | landscape | square. Default: portrait
  --size <type>         large | medium | small. Default: large
  --locale <code>       Language locale. Default: en-US
  --raw                 Output full Pexels API JSON
  --write <file>        Save output JSON to a file
  --help                Show this help

Examples:
  node scripts/pexels-search.js "moody coffee shop interior"
  node scripts/pexels-search.js "night city bar warm light" --per-page 6 --orientation portrait
  node scripts/pexels-search.js "cozy cafe window light" --write cafe-images.json
`.trim());
}

function parseArgs(argv) {
  const options = {
    perPage: 8,
    page: 1,
    orientation: "portrait",
    size: "large",
    locale: "en-US",
    raw: false,
    write: null
  };

  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--raw") {
      options.raw = true;
      continue;
    }

    if (arg === "--per-page") {
      options.perPage = Number(argv[++index] || 8);
      continue;
    }

    if (arg === "--page") {
      options.page = Number(argv[++index] || 1);
      continue;
    }

    if (arg === "--orientation") {
      options.orientation = argv[++index] || "portrait";
      continue;
    }

    if (arg === "--size") {
      options.size = argv[++index] || "large";
      continue;
    }

    if (arg === "--locale") {
      options.locale = argv[++index] || "en-US";
      continue;
    }

    if (arg === "--write") {
      options.write = argv[++index] || null;
      continue;
    }

    positionals.push(arg);
  }

  options.query = positionals.join(" ").trim();
  return options;
}

function buildUrl({ query, perPage, page, orientation, size, locale }) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("size", size);
  url.searchParams.set("locale", locale);
  return url;
}

function simplifyResponse(payload, query, options) {
  return {
    query,
    endpoint: API_ENDPOINT,
    used_options: {
      per_page: options.perPage,
      page: options.page,
      orientation: options.orientation,
      size: options.size,
      locale: options.locale
    },
    total_results: payload.total_results,
    page: payload.page,
    per_page: payload.per_page,
    photos: (payload.photos || []).map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      photographer: photo.photographer,
      photographer_url: photo.photographer_url,
      avg_color: photo.avg_color,
      alt: photo.alt,
      pexels_page: photo.url,
      image_urls: {
        original: photo.src?.original,
        large2x: photo.src?.large2x,
        large: photo.src?.large,
        medium: photo.src?.medium,
        small: photo.src?.small,
        portrait: photo.src?.portrait,
        landscape: photo.src?.landscape,
        tiny: photo.src?.tiny
      }
    }))
  };
}

async function main() {
  const fs = await import("node:fs/promises");
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.query) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  if (!API_KEY) {
    console.error("Pexels API key is missing.");
    process.exit(1);
  }

  const url = buildUrl(options);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: API_KEY
      }
    });
  } catch (error) {
    console.error(`Network request failed: ${error.message}`);
    process.exit(1);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Pexels request failed: ${response.status} ${response.statusText}`);
    console.error(errorText);
    process.exit(1);
  }

  const payload = await response.json();
  const output = options.raw ? payload : simplifyResponse(payload, options.query, options);
  const json = JSON.stringify(output, null, 2);

  if (options.write) {
    await fs.writeFile(options.write, json, "utf8");
  }

  process.stdout.write(json);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
