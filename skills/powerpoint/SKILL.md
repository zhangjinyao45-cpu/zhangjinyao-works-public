---
name: powerpoint
description: |-
  Handle PowerPoint (.pptx) creation, design, and analysis. Use for pitch decks, status updates, and visual storytelling. Use proactively when precise layout positioning and design principles are needed.
  
  Examples:
  - user: "Create a 10-slide deck for the board meeting" -> use design principles + html2pptx
  - user: "Convert this report into a presentation" -> extract text and map to template
  - user: "Audit this deck for layout issues" -> generate thumbnail grid for inspection
---
<instructions>
<powerpoint_professional_suite>

<high_fidelity_creation>
The preferred method for precise layout positioning:
1. **HTML**: Create slides (720pt x 405pt). Text MUST be in `<p>`, `<h1>`-`<h6>`, or `<ul>`.
2. **Visuals**: You MUST rasterize gradients/icons as PNGs using Sharp FIRST. **Reference**: `references/html2pptx.md`.
3. **Execution**: Run `html2pptx.js` to generate the presentation.
4. **Default posture**: When the deck contains dense Chinese text, you MUST favor conservative layouts over aggressive visual density. It is better to leave empty space than to risk overflow, overlap, or unreadable wrapping.
</high_fidelity_creation>

<template_structure>
For deck editing or template mapping:
- **Preflight**: Run `scripts/layout_guard.py` on generated `.pptx` files to catch high-risk Chinese text boxes, dense rows, footer collision risk, and shape overlaps before visual review.
- **Audit**: Generate thumbnail grid (`scripts/thumbnail.py`) to analyze layout.
- **Duplication**: Use `scripts/rearrange.py` to duplicate and reorder slides.
- **Text Injection**: Use `scripts/replace.py` with the JSON inventory to populate content.
</template_structure>

<design_quality>
- **Fonts**: You MUST use web-safe fonts ONLY (Arial, Helvetica, Georgia).
- **Colors**: You MUST NOT use the `#` prefix in PptxGenJS hex codes (causes corruption).
- **Layout**: You SHOULD prefer two-column or full-slide layouts. You MUST NOT stack charts below text.
- **Chinese text safety**: For Chinese copy, you MUST assume PowerPoint will wrap earlier than your code expects. Do not place long Chinese phrases in short, low-height horizontal cards. Prefer vertical stacking such as `small label on top + larger conclusion below`.
- **Card safety**: Any text container with a decorative border or neon frame MUST have generous vertical headroom. Avoid single-line assumptions for Chinese headings, metrics, or callouts.
- **Dense slide safety**: If a slide has 3 or more cards in one row, each card MUST contain short text only. If the text is meaningful prose rather than a label, split it across rows or convert to a larger panel.
- **Fallback rule**: If preview tooling is unavailable on the current machine, you MUST switch to a conservative layout mode. That means smaller typography, taller cards, fewer side-by-side blocks, and no “just-fit” compositions.
- **Completion bar**: Text-frame overlap, text spilling outside decorative borders, and footer/content collisions are release-blocking defects. If any are suspected, the deck is not complete.
- **Verification**: You MUST generate a final thumbnail grid with `--cols 4` to inspect for text cutoff or overlap issues. If thumbnail generation is unavailable, you MUST explicitly treat the deck as unverified and either obtain visual confirmation from rendered slides or revise toward a more conservative layout before handing off.
</design_quality>

<anti_patterns>
- Do NOT trust `fit: "shrink"` alone to save a tight layout.
- Do NOT place two different semantic messages in one narrow metric bar if either side can wrap.
- Do NOT use “large slogan text + small frame height” for Chinese copy.
- Do NOT declare a PPT “done” merely because the `.pptx` file exports successfully.
</anti_patterns>

</powerpoint_professional_suite>
</instructions>
