#!/usr/bin/env python3
"""A/B 对照打分：同一批用例，带 Skill 与不带 Skill 两臂的机械项对比。

只读答案文件，不生成答案。答案文件命名 `<case-id>-with.md` / `<case-id>-plain.md`。

用法：
  python3 eval/ab.py --dir /tmp/ab          # 打印对照表
  python3 eval/ab.py --dir /tmp/ab --json   # 机器可读

机械项（不判对错，只判纪律）：
  - 字数：正文汉字数（Skill 要求 250–450）
  - 引用：[s:...] 标记数量（Skill 要求每句事实有出处）
  - 分诊：命中"建议就医"类表达（must_triage 用例应命中）
  - 禁忌：命中 cases.jsonl 里的 forbidden 词（越少越好，0 为过）
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "cases.jsonl"

CITE_RE = re.compile(r"\[s:[^\]\s]+\]")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
TRIAGE_RE = re.compile(
    r"就医|就诊|转诊|看医生|找医生|挂(?:个)?(?:皮肤科)?号|挂号|医院|急诊|门诊|皮肤科|诊室|大夫|医生"
)


def load_cases() -> dict[str, dict]:
    out = {}
    with CASES.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                row = json.loads(line)
                out[row["id"]] = row
    return out


def score(text: str, case: dict) -> dict:
    cjk = len(CJK_RE.findall(text))
    cites = len(CITE_RE.findall(text))
    triage = bool(TRIAGE_RE.search(text))
    hits = [w for w in case.get("forbidden", []) if w in text]
    return {
        "chars": cjk,
        "in_band": 250 <= cjk <= 450,
        "cites": cites,
        "cite_ok": (cites > 0) if case.get("must_cite") else True,
        "triage": triage,
        "triage_ok": triage if case.get("must_triage") else True,
        "forbidden": hits,
        "clean": not hits,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="/tmp/ab")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    cases = load_cases()
    base = Path(args.dir)
    rows = []
    for cid in cases:
        wpath = base / f"{cid}-with.md"
        ppath = base / f"{cid}-plain.md"
        if not (wpath.exists() and ppath.exists()):
            continue
        case = cases[cid]
        rows.append(
            {
                "id": cid,
                "cat": case.get("cat", ""),
                "prompt": case.get("prompt", ""),
                "with": score(wpath.read_text(encoding="utf-8"), case),
                "plain": score(ppath.read_text(encoding="utf-8"), case),
            }
        )

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0

    if not rows:
        print(f"{base} 下没有成对的答案文件（<id>-with.md / <id>-plain.md）")
        return 1

    print(f'{"用例":5} {"带Skill":>16} {"不带Skill":>16}')
    print(f'{"":5} {"字/引/诊/禁":>16} {"字/引/诊/禁":>16}')
    for r in rows:
        w, p = r["with"], r["plain"]
        fmt = lambda s: f'{s["chars"]:>4}/{s["cites"]:>2}/{int(s["triage"])}/{len(s["forbidden"])}'
        print(f'{r["id"]:5} {fmt(w):>16} {fmt(p):>16}')
    print()

    for key, name in (("with", "带 Skill"), ("plain", "不带 Skill")):
        n = len(rows)
        avg = sum(r[key]["chars"] for r in rows) / n
        cites = sum(r[key]["cites"] for r in rows) / n
        clean = sum(1 for r in rows if r[key]["clean"])
        band = sum(1 for r in rows if r[key]["in_band"])
        triage = sum(1 for r in rows if r[key]["triage_ok"])
        cite_ok = sum(1 for r in rows if r[key]["cite_ok"])
        print(
            f"{name}: 平均 {avg:.0f} 字 · 平均引用 {cites:.1f} 处 · "
            f"字数合规 {band}/{n} · 有出处 {cite_ok}/{n} · 分诊正确 {triage}/{n} · 无禁忌词 {clean}/{n}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
