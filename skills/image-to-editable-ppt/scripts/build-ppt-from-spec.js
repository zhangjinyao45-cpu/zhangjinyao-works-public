#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function hex(value, fallback) {
  if (!value) {
    return fallback;
  }
  return String(value).replace(/^#/, "").toUpperCase();
}

function shapeName(name) {
  const map = {
    rect: "rect",
    roundRect: "roundRect",
    ellipse: "ellipse",
    line: "line",
    chevron: "chevron",
  };
  if (!map[name]) {
    throw new Error(`Unsupported shape "${name}"`);
  }
  return map[name];
}

function buildTextOptions(element) {
  return {
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    margin: element.margin ?? 0,
    bold: Boolean(element.bold),
    italic: Boolean(element.italic),
    fontFace: element.fontFace || "Microsoft YaHei",
    fontSize: element.fontSize || 16,
    color: hex(element.color, "1F1F1F"),
    align: element.align || "left",
    valign: element.valign || "mid",
    breakLine: false,
    fit: element.fit || "shrink",
    fill: element.fill ? { color: hex(element.fill, "FFFFFF") } : undefined,
    line: element.line ? { color: hex(element.line, "000000"), width: element.lineWidth || 1 } : undefined,
  };
}

function buildShapeOptions(element) {
  const options = {
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    fill: { color: hex(element.fill, "FFFFFF"), transparency: element.fillTransparency || 0 },
    line: { color: hex(element.line, "000000"), width: element.lineWidth || 0 },
  };

  if (element.type === "shape" && element.shape === "line") {
    options.line = { color: hex(element.line, "000000"), width: element.lineWidth || 1.5 };
    delete options.fill;
  }

  return options;
}

function renderElement(slide, element) {
  switch (element.type) {
    case "text":
      slide.addText(element.text || "", buildTextOptions(element));
      return;
    case "shape":
      slide.addShape(shapeName(element.shape || "rect"), buildShapeOptions(element));
      return;
    case "image": {
      const imagePath = path.resolve(element.path);
      slide.addImage({
        path: imagePath,
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
      });
      return;
    }
    default:
      throw new Error(`Unsupported element type "${element.type}"`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.spec || !args.out) {
    throw new Error("Usage: node build-ppt-from-spec.js --spec <spec.json> --out <output.pptx>");
  }

  const specPath = path.resolve(args.spec);
  const outPath = path.resolve(args.out);
  const raw = fs.readFileSync(specPath, "utf8");
  const spec = JSON.parse(raw);

  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    throw new Error("Spec must include a non-empty slides array.");
  }

  const pptx = new PptxGenJS();
  pptx.layout = spec.layout?.name || "LAYOUT_WIDE";
  pptx.author = "Codex";
  pptx.subject = "Editable slide rebuilt from image";
  pptx.title = spec.title || "Editable PPT From Image";
  pptx.company = "OpenAI";
  pptx.lang = "zh-CN";

  for (const slideSpec of spec.slides) {
    const slide = pptx.addSlide();
    if (spec.layout?.backgroundColor) {
      slide.background = { color: hex(spec.layout.backgroundColor, "FFFFFF") };
    }
    if (slideSpec.notes) {
      slide.addNotes(slideSpec.notes);
    }
    for (const element of slideSpec.elements || []) {
      renderElement(slide, element);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pptx.writeFile({ fileName: outPath });
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
