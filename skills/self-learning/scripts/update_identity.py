"""
self-learning · 阶段 7：身份信息受控更新

职责：
- 仅在 self-identity/identity.md 的 <!-- soft-block:start --> ... <!-- soft-block:end --> 内写入。
- 标记块以外的字节内容在更新前后必须完全相同（SHA-256 校验）。
- 每条提案值在落盘前必须通过 desensitize.py --check-only。
- 写入采用"先写临时文件 → 校验 → 原子替换"，并强制写 changelog。
- 支持 --dry-run（仅打印 diff）与 --apply（真实落盘）。

用法：
    # 预览
    python scripts/update_identity.py \
        --identity self-identity/identity.md \
        --proposal proposal.json \
        --policy references/identity-update-policy.md \
        --changelog self-identity/references/identity-changelog.md \
        --run-id 2026-05-29T16:55 \
        --dry-run

    # 真正写入（默认交互模式：仍会在打印 diff 后等待 --apply 标志）
    python scripts/update_identity.py ... --apply

proposal.json 示例：
    {
      "recent_focus": ["金融对账自动化", "PDF 报表生成"],
      "preferred_tools": ["pandas", "openpyxl"],
      "working_style_notes": {"language": "zh", "tone": "concise"},
      "trigger": "stable_preference"
    }

policy 文件解析要求：仅使用极小子集（顶部 yaml-like 键值对），不依赖 PyYAML。
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

SOFT_START = "<!-- soft-block:start -->"
SOFT_END = "<!-- soft-block:end -->"

DEFAULT_POLICY = {
    "enabled": True,
    "mode": "interactive",
    "auto_apply_max_lines": 8,
    "recent_focus_keep": 5,
    "preferred_tools_keep": 10,
    "require_changelog": True,
}


# ---------------------------------------------------------------------------
# Policy loader (minimal yaml-like subset)
# ---------------------------------------------------------------------------

def load_policy(path: Path) -> dict:
    policy = dict(DEFAULT_POLICY)
    if not path.exists():
        return policy
    text = path.read_text(encoding="utf-8")
    # 只读取首个 ```yaml ... ``` 代码块
    m = re.search(r"```yaml\s*(.*?)```", text, re.DOTALL)
    block = m.group(1) if m else text
    for line in block.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        k, v = (s.strip() for s in line.split(":", 1))
        if v.lower() in ("true", "false"):
            policy[k] = v.lower() == "true"
        else:
            try:
                policy[k] = int(v)
            except ValueError:
                policy[k] = v
    return policy


# ---------------------------------------------------------------------------
# Soft block helpers
# ---------------------------------------------------------------------------

def split_soft_block(text: str) -> tuple[str, str | None, str]:
    """返回 (head, soft_inner_or_None, tail)。soft_inner 不含起止标记自身。"""
    s = text.find(SOFT_START)
    e = text.find(SOFT_END)
    if s == -1 and e == -1:
        return text, None, ""
    if s == -1 or e == -1 or e < s:
        raise ValueError("identity.md 软字段块标记不完整或顺序错误")
    head = text[:s]
    inner_start = s + len(SOFT_START)
    inner = text[inner_start:e]
    tail = text[e + len(SOFT_END):]
    return head, inner, tail


def ensure_soft_block(text: str) -> tuple[str, bool]:
    """若无软字段块，则在文件末尾追加一个空块。返回 (新文本, 是否创建)。"""
    head, inner, tail = split_soft_block(text)
    if inner is not None:
        return text, False
    block = (
        ("\n" if not text.endswith("\n") else "")
        + "\n"
        + SOFT_START
        + "\n## 动态档案\n<!-- 由 self-learning 阶段 7 受控更新；勿手工编辑标记 -->\n"
        + SOFT_END
        + "\n"
    )
    return text + block, True


def render_soft_inner(state: dict, recent_focus_keep: int, preferred_tools_keep: int) -> str:
    rf = state.get("recent_focus", [])[:recent_focus_keep]
    pt = state.get("preferred_tools", [])[:preferred_tools_keep]
    ws = state.get("working_style_notes", {})
    last = state.get("last_updated") or datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = ["", "## 动态档案", "<!-- 由 self-learning 阶段 7 受控更新；勿手工编辑标记 -->", ""]
    lines.append("### recent_focus")
    if rf:
        lines += [f"- {x}" for x in rf]
    else:
        lines.append("- (空)")
    lines.append("")
    lines.append("### preferred_tools")
    if pt:
        lines += [f"- {x}" for x in pt]
    else:
        lines.append("- (空)")
    lines.append("")
    lines.append("### working_style_notes")
    if ws:
        for k, v in ws.items():
            lines.append(f"- {k}: {v}")
    else:
        lines.append("- (空)")
    lines.append("")
    lines.append(f"### last_updated")
    lines.append(f"- {last}")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Existing soft state parsing (best-effort, for merging)
# ---------------------------------------------------------------------------

def parse_soft_inner(inner: str) -> dict:
    state: dict[str, Any] = {"recent_focus": [], "preferred_tools": [], "working_style_notes": {}}
    section = None
    for raw in inner.splitlines():
        line = raw.strip()
        if line.startswith("### "):
            section = line[4:].strip()
            continue
        if not line.startswith("- "):
            continue
        item = line[2:].strip()
        if section == "recent_focus" and item != "(空)":
            state["recent_focus"].append(item)
        elif section == "preferred_tools" and item != "(空)":
            state["preferred_tools"].append(item)
        elif section == "working_style_notes" and ":" in item:
            k, v = (s.strip() for s in item.split(":", 1))
            state["working_style_notes"][k] = v
        elif section == "last_updated":
            state["last_updated"] = item
    return state


def merge_state(old: dict, proposal: dict, policy: dict) -> dict:
    new = {
        "recent_focus": list(old.get("recent_focus", [])),
        "preferred_tools": list(old.get("preferred_tools", [])),
        "working_style_notes": dict(old.get("working_style_notes", {})),
    }
    # recent_focus: 把 proposal 项前置，去重，截断
    for x in reversed(proposal.get("recent_focus", []) or []):
        if x in new["recent_focus"]:
            new["recent_focus"].remove(x)
        new["recent_focus"].insert(0, x)
    new["recent_focus"] = new["recent_focus"][: policy["recent_focus_keep"]]
    # preferred_tools: 累计去重
    for x in proposal.get("preferred_tools", []) or []:
        if x not in new["preferred_tools"]:
            new["preferred_tools"].append(x)
    new["preferred_tools"] = new["preferred_tools"][: policy["preferred_tools_keep"]]
    # working_style_notes: 同键覆盖
    for k, v in (proposal.get("working_style_notes") or {}).items():
        new["working_style_notes"][k] = v
    new["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    return new


# ---------------------------------------------------------------------------
# Sensitivity check via desensitize.py
# ---------------------------------------------------------------------------

def desensitize_check(values: list[str], desensitize_script: Path) -> list[str]:
    """对一批字符串逐个调用 desensitize.py --check-only；返回命中的字符串列表（不含原值，仅返回索引位置串）。"""
    flagged: list[str] = []
    for v in values:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(v)
            tmp = Path(f.name)
        try:
            rc = subprocess.run(
                [sys.executable, str(desensitize_script), str(tmp), "--check-only"],
                capture_output=True, text=True,
            ).returncode
            if rc != 0:
                flagged.append(v)
        finally:
            tmp.unlink(missing_ok=True)
    return flagged


def collect_proposal_strings(proposal: dict) -> list[str]:
    out: list[str] = []
    out.extend(proposal.get("recent_focus") or [])
    out.extend(proposal.get("preferred_tools") or [])
    for k, v in (proposal.get("working_style_notes") or {}).items():
        out.append(f"{k}: {v}")
    return out


# ---------------------------------------------------------------------------
# Atomic write with byte-equality invariant for outside-block content
# ---------------------------------------------------------------------------

def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_identity_atomic(identity_path: Path, new_text: str, expected_outside_hash: str) -> None:
    head, inner, tail = split_soft_block(new_text)
    if inner is None:
        raise RuntimeError("写入后软字段块缺失，拒绝落盘")
    outside = (head + tail).encode("utf-8")
    if sha256(outside) != expected_outside_hash:
        raise RuntimeError("软字段块外内容已变化，拒绝落盘（不变量被破坏）")
    tmp = identity_path.with_suffix(identity_path.suffix + ".tmp")
    tmp.write_text(new_text, encoding="utf-8")
    os.replace(tmp, identity_path)


def append_changelog(changelog: Path, run_id: str, diff_summary: list[tuple[str, str, str]], trigger: str) -> None:
    changelog.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [f"\n### {ts} · run={run_id}", f"- 触发条件：{trigger}"]
    for field, old, new in diff_summary:
        lines.append(f"- 字段：{field}")
        lines.append(f"  - 修改前：{old}")
        lines.append(f"  - 修改后：{new}")
    with changelog.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--identity", required=True)
    p.add_argument("--proposal", required=True)
    p.add_argument("--policy", required=True)
    p.add_argument("--changelog", required=True)
    p.add_argument("--desensitize", default=str(Path(__file__).with_name("desensitize.py")))
    p.add_argument("--run-id", default=datetime.now().strftime("%Y%m%dT%H%M%S"))
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()

    identity_path = Path(args.identity)
    proposal_path = Path(args.proposal)
    policy_path = Path(args.policy)
    changelog_path = Path(args.changelog)
    desensitize_script = Path(args.desensitize)

    if not identity_path.exists():
        print(f"identity not found: {identity_path}", file=sys.stderr)
        return 2
    if not proposal_path.exists():
        print(f"proposal not found: {proposal_path}", file=sys.stderr)
        return 2

    policy = load_policy(policy_path)
    if not policy.get("enabled", True):
        print("identity-update disabled by policy; skipping.")
        return 0

    proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
    trigger = proposal.get("trigger", "user_explicit")

    # 脱敏复检
    flagged = desensitize_check(collect_proposal_strings(proposal), desensitize_script)
    if flagged:
        print(f"[blocked] {len(flagged)} proposal item(s) hit sensitive patterns; aborting (no original values shown).")
        return 3

    original_text = identity_path.read_text(encoding="utf-8")
    text, created = ensure_soft_block(original_text)
    if created:
        print("soft-block 不存在，已在末尾追加空块。")

    head, inner, tail = split_soft_block(text)
    assert inner is not None
    outside_hash = sha256((head + tail).encode("utf-8"))

    old_state = parse_soft_inner(inner)
    new_state = merge_state(old_state, proposal, policy)
    new_inner = render_soft_inner(new_state, policy["recent_focus_keep"], policy["preferred_tools_keep"])

    new_text = head + SOFT_START + new_inner + SOFT_END + tail

    # 计算 diff
    diff = list(difflib.unified_diff(
        text.splitlines(keepends=True),
        new_text.splitlines(keepends=True),
        fromfile="identity.md (current)",
        tofile="identity.md (proposed)",
        n=2,
    ))
    print("".join(diff) if diff else "(no changes)")

    diff_lines = sum(1 for ln in diff if ln.startswith(("+", "-")) and not ln.startswith(("+++", "---")))

    if args.dry_run or not args.apply:
        if policy.get("mode") == "auto" and diff_lines <= policy["auto_apply_max_lines"] and not args.dry_run:
            print(f"[auto-mode] diff={diff_lines} lines ≤ {policy['auto_apply_max_lines']}, applying...")
        else:
            print(f"[preview-only] diff={diff_lines} lines. 加 --apply 执行写入。")
            return 0

    # 应用：构造变更摘要
    diff_summary: list[tuple[str, str, str]] = []
    for field in ("recent_focus", "preferred_tools"):
        old = ", ".join(old_state.get(field, [])) or "(空)"
        new = ", ".join(new_state.get(field, [])) or "(空)"
        if old != new:
            diff_summary.append((field, old, new))
    if old_state.get("working_style_notes") != new_state.get("working_style_notes"):
        diff_summary.append((
            "working_style_notes",
            json.dumps(old_state.get("working_style_notes", {}), ensure_ascii=False),
            json.dumps(new_state.get("working_style_notes", {}), ensure_ascii=False),
        ))

    write_identity_atomic(identity_path, new_text, outside_hash)
    if policy.get("require_changelog", True):
        append_changelog(changelog_path, args.run_id, diff_summary, trigger)
    print(f"[applied] identity.md updated, changelog appended ({len(diff_summary)} field(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
