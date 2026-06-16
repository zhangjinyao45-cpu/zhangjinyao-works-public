"""
self-learning · 候选能力抽取脚手架

用法：
    python scripts/extract.py <输入文件> <输出JSON路径>

本脚本只做「读取 + 切分 + 模板填充」，真正的语义抽取由调用方
（Claude / 原力AI助手）完成。脚本输出一个待填充的 JSON 骨架。
"""

import json
import sys
from datetime import date
from pathlib import Path


def build_skeleton(source: str) -> dict:
    return {
        "source": source,
        "date": date.today().isoformat(),
        "candidate_capabilities": [],
        "lessons": [],
        "user_preferences": [],
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python scripts/extract.py <input> <output.json>")
        return 1

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])

    if not src.exists():
        print(f"input not found: {src}")
        return 1

    skeleton = build_skeleton(str(src))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(skeleton, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"skeleton written to: {dst}")
    print("next: 调用 LLM 按 references/prompts.md 模板 A 填充 candidate_capabilities 等字段。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
