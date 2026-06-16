#!/usr/bin/env python3
"""
Heuristic layout safety checks for PowerPoint decks without external dependencies.

This script inspects slide OOXML directly and flags high-risk layout patterns:
- overlapping text shapes
- long Chinese text inside short horizontal cards
- narrow text boxes with dense Chinese copy
- text boxes placed too close to the footer band
- crowded rows with too many narrow text cards

Usage:
  python layout_guard.py input.pptx
  python layout_guard.py input.pptx --json
  python layout_guard.py input.pptx --strict
"""

import argparse
import json
import re
import sys
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence
from xml.etree import ElementTree as ET

CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}
EMU_PER_INCH = 914400.0


@dataclass
class ShapeInfo:
    shape_id: str
    left: float
    top: float
    width: float
    height: float
    text: str


@dataclass
class Finding:
    severity: str
    slide: str
    shape: str
    rule: str
    message: str


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check a PPTX for high-risk layout issues."
    )
    parser.add_argument("input", help="Input PowerPoint file (.pptx)")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit findings as JSON.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return non-zero when warnings exist, not only errors.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists() or input_path.suffix.lower() != ".pptx":
        print(f"Error: invalid PowerPoint file: {args.input}", file=sys.stderr)
        sys.exit(2)

    slide_width, slide_height, slides = load_slides(input_path)
    findings = collect_findings(slide_width, slide_height, slides)

    if args.json:
        print(json.dumps([asdict(f) for f in findings], ensure_ascii=False, indent=2))
    else:
        print_report(findings)

    has_error = any(f.severity == "error" for f in findings)
    has_warning = any(f.severity == "warning" for f in findings)
    if has_error or (args.strict and has_warning):
        sys.exit(1)


def load_slides(pptx_path: Path) -> tuple[float, float, Dict[str, List[ShapeInfo]]]:
    slides: Dict[str, List[ShapeInfo]] = {}
    with zipfile.ZipFile(pptx_path) as zf:
        pres_root = ET.fromstring(zf.read("ppt/presentation.xml"))
        sld_sz = pres_root.find("p:sldSz", NS)
        if sld_sz is None:
            raise RuntimeError("presentation.xml missing slide size")
        slide_width = int(sld_sz.attrib["cx"]) / EMU_PER_INCH
        slide_height = int(sld_sz.attrib["cy"]) / EMU_PER_INCH

        slide_files = sorted(
            name
            for name in zf.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        for idx, name in enumerate(slide_files):
            slide_key = f"slide-{idx}"
            slides[slide_key] = parse_slide(zf.read(name))

    return slide_width, slide_height, slides


def parse_slide(xml_bytes: bytes) -> List[ShapeInfo]:
    root = ET.fromstring(xml_bytes)
    shapes: List[ShapeInfo] = []
    shape_index = 0

    for shape in root.findall(".//p:sp", NS):
        xfrm = shape.find("./p:spPr/a:xfrm", NS)
        if xfrm is None:
            continue

        off = xfrm.find("a:off", NS)
        ext = xfrm.find("a:ext", NS)
        if off is None or ext is None:
            continue

        text_runs = [node.text.strip() for node in shape.findall(".//a:t", NS) if node.text and node.text.strip()]
        text = " ".join(text_runs).strip()
        if not text:
            continue

        left = int(off.attrib.get("x", "0")) / EMU_PER_INCH
        top = int(off.attrib.get("y", "0")) / EMU_PER_INCH
        width = int(ext.attrib.get("cx", "0")) / EMU_PER_INCH
        height = int(ext.attrib.get("cy", "0")) / EMU_PER_INCH

        shapes.append(
            ShapeInfo(
                shape_id=f"shape-{shape_index}",
                left=round(left, 2),
                top=round(top, 2),
                width=round(width, 2),
                height=round(height, 2),
                text=text,
            )
        )
        shape_index += 1

    return shapes


def collect_findings(
    slide_width: float, slide_height: float, slides: Dict[str, List[ShapeInfo]]
) -> List[Finding]:
    findings: List[Finding] = []
    for slide_id, shapes in slides.items():
        findings.extend(check_overlaps(slide_id, shapes))
        for shape in shapes:
            findings.extend(check_shape(slide_id, shape, slide_width, slide_height))
        findings.extend(check_dense_rows(slide_id, shapes))
    return sort_findings(findings)


def check_shape(
    slide_id: str, shape: ShapeInfo, slide_width: float, slide_height: float
) -> List[Finding]:
    findings: List[Finding] = []
    chinese_count = count_chinese(shape.text)
    text_len = len(shape.text)

    if shape.left + shape.width > slide_width + 0.02 or shape.top + shape.height > slide_height + 0.02:
        findings.append(
            Finding(
                severity="error",
                slide=slide_id,
                shape=shape.shape_id,
                rule="off-slide",
                message="shape extends beyond slide bounds",
            )
        )

    if (
        chinese_count >= 8
        and shape.width >= 1.8
        and shape.height <= 0.95
        and shape.width / max(shape.height, 0.01) >= 2.6
        and shape.top > 0.45
    ):
        findings.append(
            Finding(
                severity="warning",
                slide=slide_id,
                shape=shape.shape_id,
                rule="narrow-horizontal-card",
                message="long Chinese text appears inside a short horizontal card; use taller stacked layout",
            )
        )

    if chinese_count >= 12 and shape.width <= 2.8 and shape.top > 0.45:
        findings.append(
            Finding(
                severity="warning",
                slide=slide_id,
                shape=shape.shape_id,
                rule="narrow-text-box",
                message="Chinese copy is dense for the current text box width; early wrapping risk is high",
            )
        )

    if (
        text_len >= 24
        and (chinese_count >= 6 or shape.width <= 3.4)
        and shape.height <= 0.55
        and shape.top > 0.45
    ):
        findings.append(
            Finding(
                severity="warning",
                slide=slide_id,
                shape=shape.shape_id,
                rule="low-height-text-box",
                message="text box is unusually short for its text load; clipping or hard wrapping risk is high",
            )
        )

    if (
        shape.top + shape.height >= slide_height - 0.68
        and (chinese_count >= 10 or text_len >= 18)
    ):
        findings.append(
            Finding(
                severity="warning",
                slide=slide_id,
                shape=shape.shape_id,
                rule="footer-collision-risk",
                message="text-bearing shape sits close to the footer band; review for collision",
            )
        )

    return findings


def check_overlaps(slide_id: str, shapes: Sequence[ShapeInfo]) -> List[Finding]:
    findings: List[Finding] = []
    for i in range(len(shapes)):
        for j in range(i + 1, len(shapes)):
            overlap = overlap_area(shapes[i], shapes[j])
            if overlap > 0.12:
                findings.append(
                    Finding(
                        severity="error",
                        slide=slide_id,
                        shape=shapes[i].shape_id,
                        rule="shape-overlap",
                        message=f"overlaps {shapes[j].shape_id} by {overlap:.2f} sq in",
                    )
                )
    return findings


def check_dense_rows(slide_id: str, shapes: Sequence[ShapeInfo]) -> List[Finding]:
    if not shapes:
        return []

    ordered = sorted(shapes, key=lambda s: (s.top, s.left))
    rows: List[List[ShapeInfo]] = []
    current = [ordered[0]]
    baseline_top = ordered[0].top

    for shape in ordered[1:]:
        if abs(shape.top - baseline_top) <= 0.22:
            current.append(shape)
        else:
            rows.append(current)
            current = [shape]
            baseline_top = shape.top
    rows.append(current)

    findings: List[Finding] = []
    for idx, row in enumerate(rows, start=1):
        if len(row) < 3:
            continue
        narrow_cards = [shape for shape in row if shape.width <= 2.8]
        verbose_cards = [
            shape
            for shape in row
            if count_chinese(shape.text) >= 8 or len(shape.text) >= 14
        ]
        if len(narrow_cards) >= 3 and verbose_cards:
            findings.append(
                Finding(
                    severity="warning",
                    slide=slide_id,
                    shape=", ".join(shape.shape_id for shape in row),
                    rule="dense-row-risk",
                    message=f"row {idx} has {len(row)} text cards with narrow widths; convert part of the row into taller panels",
                )
            )
    return findings


def overlap_area(shape_a: ShapeInfo, shape_b: ShapeInfo) -> float:
    left = max(shape_a.left, shape_b.left)
    top = max(shape_a.top, shape_b.top)
    right = min(shape_a.left + shape_a.width, shape_b.left + shape_b.width)
    bottom = min(shape_a.top + shape_a.height, shape_b.top + shape_b.height)
    if right <= left or bottom <= top:
        return 0.0
    return round((right - left) * (bottom - top), 2)


def count_chinese(text: str) -> int:
    return len(CHINESE_RE.findall(text))


def sort_findings(findings: Iterable[Finding]) -> List[Finding]:
    severity_order = {"error": 0, "warning": 1, "info": 2}
    return sorted(
        findings,
        key=lambda f: (
            severity_order.get(f.severity, 9),
            slide_index(f.slide),
            f.shape,
            f.rule,
        ),
    )


def slide_index(slide_id: str) -> int:
    try:
        return int(slide_id.split("-")[-1])
    except ValueError:
        return 9999


def print_report(findings: Sequence[Finding]) -> None:
    if not findings:
        print("No layout risks found.")
        return
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]
    print(f"Found {len(errors)} error(s), {len(warnings)} warning(s).")
    for finding in findings:
        print(
            f"[{finding.severity.upper()}] {finding.slide} {finding.shape} {finding.rule}: {finding.message}"
        )


if __name__ == "__main__":
    main()
