from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageDraw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--thumb-width", type=int, default=760)
    parser.add_argument("--margin", type=int, default=24)
    parser.add_argument("--label-height", type=int, default=40)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    files = sorted(
        [path for path in input_dir.iterdir() if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}]
    )

    if not files:
        raise SystemExit(f"No images found in {input_dir}")

    images = [(path.stem, Image.open(path).convert("RGB")) for path in files]
    thumb_width = args.thumb_width
    thumb_height = int(images[0][1].height * (thumb_width / images[0][1].width))
    margin = args.margin
    label_height = args.label_height

    canvas_width = thumb_width + margin * 2
    canvas_height = len(images) * (thumb_height + label_height + margin) + margin
    canvas = Image.new("RGB", (canvas_width, canvas_height), (18, 20, 28))
    draw = ImageDraw.Draw(canvas)

    y = margin
    for label, image in images:
        thumb = image.resize((thumb_width, thumb_height))
        canvas.paste(thumb, (margin, y))
        draw.text((margin, y + thumb_height + 8), label, fill=(236, 236, 240))
        y += thumb_height + label_height + margin

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)
    print(output)


if __name__ == "__main__":
    main()
