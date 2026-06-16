"""
self-learning · 敏感数据脱敏脚手架

用法：
    # 脱敏并写入新文件，同时输出报告
    python scripts/desensitize.py <输入> <输出> --report <报告.json>

    # 仅检查（不写出脱敏文件），命中时退出码 != 0
    python scripts/desensitize.py <输入> --check-only --report <报告.json>

设计目标：
- 与 references/sensitive-patterns.md 中的类别清单保持一致。
- 默认即安全：宁可误伤，不可漏伤。
- 占位符类型化：<REDACTED:CATEGORY>，不保留任何原值片段。
- 报告 JSON 仅记录命中类别、条数与位置区间，**不保留命中原文**。

注意：
- 银行卡号在正则之外再做一次 Luhn 校验，避免把订单号、长 ID 全量误伤。
- TOKEN 走双层判断：明确前缀（sk-/AKIA/ghp_）直接命中；通用长串需上下文关键字（token/secret/key/password）配合。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# 正则定义：与 references/sensitive-patterns.md 同步
# ---------------------------------------------------------------------------

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("PRIVATE_KEY", re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"
    )),
    ("URL_TOKEN", re.compile(
        r"https?://[^\s]+?[?&](?:token|access_token|api_key|sig|signature)=[^\s&#]+",
        re.IGNORECASE,
    )),
    ("TOKEN", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")),
    ("TOKEN", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("TOKEN", re.compile(r"\bghp_[A-Za-z0-9]{30,}\b")),
    ("TOKEN", re.compile(r"\b[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{20,}\b")),  # JWT
    ("PASSWORD", re.compile(r"(?i)\b(?:password|passwd|pwd)\s*[:=]\s*\S+")),
    ("EMAIL", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")),
    ("ID_CARD", re.compile(r"(?<!\d)(?:\d{17}[\dXx]|\d{15})(?!\d)")),
    ("PHONE", re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")),
    ("IP", re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")),
    ("INTERNAL_ID", re.compile(r"\b(?:TICKET|UID|CUS|EMP)[-_]?\d{4,}\b")),
    ("BANK_CARD", re.compile(r"(?<!\d)\d{13,19}(?!\d)")),  # 命中后做 Luhn 复核
]

TOKEN_CONTEXT_RE = re.compile(r"(?i)(token|secret|api[_\- ]?key|password|authorization)\s*[:=]\s*([A-Za-z0-9_\-]{16,})")


def luhn_ok(digits: str) -> bool:
    """Luhn 校验，用于过滤银行卡号误伤。"""
    s = 0
    parity = len(digits) % 2
    for i, ch in enumerate(digits):
        d = ord(ch) - 48
        if d < 0 or d > 9:
            return False
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        s += d
    return s % 10 == 0


def scan(text: str) -> list[dict]:
    """返回命中列表：{category, start, end}。同一区间多次命中按最先匹配类别保留。"""
    hits: list[dict] = []
    occupied: list[tuple[int, int]] = []

    def _overlap(a: int, b: int) -> bool:
        return any(not (b <= s or a >= e) for s, e in occupied)

    # 上下文型 TOKEN（先于通用扫描，命中后占位避免被 EMAIL/IP 等再次匹配）
    for m in TOKEN_CONTEXT_RE.finditer(text):
        s, e = m.span(2)
        if not _overlap(s, e):
            hits.append({"category": "TOKEN", "start": s, "end": e})
            occupied.append((s, e))

    for category, pat in PATTERNS:
        for m in pat.finditer(text):
            s, e = m.span()
            if _overlap(s, e):
                continue
            value = m.group()
            if category == "BANK_CARD":
                # 仅纯数字串，做 Luhn；不通过则跳过
                if not luhn_ok(value):
                    continue
            hits.append({"category": category, "start": s, "end": e})
            occupied.append((s, e))

    hits.sort(key=lambda h: h["start"])
    return hits


def redact(text: str, hits: Iterable[dict]) -> str:
    """根据命中列表生成脱敏文本。"""
    parts: list[str] = []
    cursor = 0
    for h in hits:
        parts.append(text[cursor:h["start"]])
        if h["category"] == "URL_TOKEN":
            # 保留 host+path，把 query 统一替换
            original = text[h["start"]:h["end"]]
            base = re.split(r"[?&]", original, maxsplit=1)[0]
            parts.append(f"{base}?<REDACTED:QUERY>")
        else:
            parts.append(f"<REDACTED:{h['category']}>")
        cursor = h["end"]
    parts.append(text[cursor:])
    return "".join(parts)


def summarize(hits: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for h in hits:
        counts[h["category"]] = counts.get(h["category"], 0) + 1
    return {
        "hits": len(hits),
        "by_category": counts,
        # 仅记录位置区间，不保留原值样本
        "spans": [{"category": h["category"], "start": h["start"], "end": h["end"]} for h in hits],
        "samples": [],  # 强制为空：报告中绝不保留原值
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="self-learning 敏感数据脱敏工具")
    parser.add_argument("input", help="输入文件路径")
    parser.add_argument("output", nargs="?", help="脱敏后输出文件路径（--check-only 时省略）")
    parser.add_argument("--report", help="脱敏报告 JSON 输出路径", default=None)
    parser.add_argument("--check-only", action="store_true", help="只检查不写出脱敏文件")
    args = parser.parse_args()

    src = Path(args.input)
    if not src.exists():
        print(f"input not found: {src}", file=sys.stderr)
        return 2

    text = src.read_text(encoding="utf-8", errors="replace")
    hits = scan(text)
    report = summarize(hits)

    if args.report:
        rp = Path(args.report)
        rp.parent.mkdir(parents=True, exist_ok=True)
        rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.check_only:
        if hits:
            print(f"[check-only] hits={len(hits)} by_category={report['by_category']}")
            return 1
        print("[check-only] clean")
        return 0

    if not args.output:
        print("output path required when not --check-only", file=sys.stderr)
        return 2

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(redact(text, hits), encoding="utf-8")
    print(f"sanitized -> {out}  hits={len(hits)} by_category={report['by_category']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
