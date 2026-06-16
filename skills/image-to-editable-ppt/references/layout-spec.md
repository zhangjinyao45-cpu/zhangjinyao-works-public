# Layout Spec

Use this spec to describe the rebuilt slide before rendering it to PowerPoint.

## Root Shape

```json
{
  "layout": {
    "name": "LAYOUT_WIDE",
    "backgroundColor": "F7F3EE"
  },
  "slides": [
    {
      "title": "Optional slide title",
      "notes": "Optional note",
      "elements": []
    }
  ]
}
```

## Supported Elements

### Text

```json
{
  "type": "text",
  "text": "Editable heading",
  "x": 0.8,
  "y": 0.6,
  "w": 4.4,
  "h": 0.8,
  "fontFace": "Microsoft YaHei",
  "fontSize": 24,
  "bold": true,
  "color": "1F1F1F",
  "align": "left",
  "valign": "mid",
  "margin": 0.05
}
```

### Rectangle / Rounded Card

```json
{
  "type": "shape",
  "shape": "roundRect",
  "x": 0.7,
  "y": 1.4,
  "w": 3.2,
  "h": 2.0,
  "fill": "FFF8F0",
  "line": "E7D7C6",
  "lineWidth": 1.2,
  "radius": 0.12
}
```

Supported shape values:
- `rect`
- `roundRect`
- `ellipse`
- `line`
- `chevron`

### Image

```json
{
  "type": "image",
  "path": "C:/absolute/path/to/photo.png",
  "x": 8.5,
  "y": 1.2,
  "w": 3.8,
  "h": 4.6
}
```

## Authoring Rules

- Use inches for `x`, `y`, `w`, `h`.
- Keep colors as 6-digit hex without `#`.
- Use one element per logical module where possible.
- Break paragraphs into separate text blocks when they need different emphasis.
- Model panels before text so z-order stays predictable.
- If a visual is too complex to redraw, place it as an image and rebuild only the nearby labels.
