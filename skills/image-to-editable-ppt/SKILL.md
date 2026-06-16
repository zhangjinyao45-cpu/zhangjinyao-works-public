---
name: image-to-editable-ppt
description: Use when a user wants to rebuild a flat image, screenshot, poster, flyer, infographic, UI mockup, cover, or page fragment as an editable PowerPoint slide instead of pasting the image as one bitmap. Trigger on requests like "把这张图做成可编辑PPT", "拆成模块", "照着图片还原成PPT", or when text, cards, labels, and simple graphics must become editable PPT objects.
---

# Image To Editable PPT

## Overview

Rebuild a reference image into editable PowerPoint modules: text boxes, shapes, lines, fills, and placed images. Do not promise full vectorization of complex art; recreate text and simple geometry as native PPT objects, and keep photos or complex illustrations as image assets unless separate source files exist.

## Workflow

1. Inspect the image and identify reusable modules before writing any slide code.
2. Split the layout into:
- background blocks
- cards / panels
- headings / body text
- simple badges, dividers, arrows, icons
- photos or complex art that should stay as images
3. Recreate text as editable PPT text boxes.
4. Recreate simple geometry as PPT shapes.
5. Keep photos, textured icons, and dense illustrations as images.
6. Write a JSON spec that follows [references/layout-spec.md](references/layout-spec.md).
7. Render the slide with `scripts/build-ppt-from-spec.js`.

## Rebuild Rules

- Prefer reconstruction over screenshot pasting.
- Use a consistent slide size and coordinate system across the whole spec.
- Approximate fonts when the exact font is unknown; preserve hierarchy, spacing, and contrast first.
- If the image contains paragraphs, rewrite them as separate text boxes instead of one giant text layer.
- If a card has shadow, radius, border, and fill, model those explicitly.
- If an item repeats, make repeated cards consistent in size and spacing.
- Use image fills only for parts that are not worth redrawing manually.

## Output Rules

- Always produce a `.pptx`, not just JSON.
- Keep every editable module independent where practical: title, subtitle, tag, card body, and button should usually be separate objects.
- Add speaker notes or a sidecar markdown only if the user asks.
- If accuracy is more important than speed, place the original image on a hidden backup slide for visual diffing.

## Commands

Build from a prepared spec:

```powershell
node scripts/build-ppt-from-spec.js `
  --spec .\work\image-spec.json `
  --out .\output\editable-from-image.pptx
```

## Common Mistakes

- Dumping the full screenshot onto the slide and calling it editable.
- Leaving all text inside one image instead of rebuilding it as text boxes.
- Ignoring padding and alignment inside cards.
- Rebuilding photos as low-quality shapes instead of keeping them as images.
- Mixing too many guessed fonts and colors when one close family would be more stable.

## Resources

### scripts/
- `build-ppt-from-spec.js`: render a JSON layout spec into editable PPT objects.

### references/
- `layout-spec.md`: the JSON schema and authoring rules for editable modules.
