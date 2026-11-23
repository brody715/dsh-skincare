#!/usr/bin/env python3
"""皮肤档案读写（Skill 与 dsh-go 插件共用）。

档案默认路径: ~/.dsh/skin-care/profile.json
可用环境变量 DSH_SKIN_PROFILE 覆盖。

用法:
    python3 scripts/profile.py init [--force]
    python3 scripts/profile.py show [--json]
    python3 scripts/profile.py set-stage --knowledge L1 --complexity clean --triage self-care
    python3 scripts/profile.py set-concerns acne-marks,dryness
    python3 scripts/profile.py add-routine "cleanse:氨基酸洁面:2/day"
    python3 scripts/profile.py del-routine 2
    python3 scripts/profile.py add-goal "连续 4 周保持 3 步"
    python3 scripts/profile.py goal-status g1 done
    python3 scripts/profile.py log-done cleanse moisturize sunscreen [--date 2026-11-22]
    python3 scripts/profile.py set-learning L1 in_progress

设计原则：只走脚本写，原子落盘，字段校验，避免手写 JSON 把档案写坏。
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT = Path.home() / ".dsh" / "skin-care" / "profile.json"
KNOWLEDGE = ["L0", "L1", "L2", "L3"]
COMPLEXITY = ["minimal", "clean", "stacked", "overloaded"]
TRIAGE = ["self-care", "see-doctor", "urgent"]
STATUS = ["active", "done", "dropped"]
LEARNING_STATE = ["todo", "in_progress", "done"]


def path():
    return Path(os.environ.get("DSH_SKIN_PROFILE") or DEFAULT)


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today():
    """本地日期：面板与脚本都用用户感知的「今天」。"""
    return datetime.now().strftime("%Y-%m-%d")


def empty():
    return {
        "version": 1,
        "updated_at": now(),
        "stage": {"knowledge": "L0", "care_complexity": "minimal", "triage": "self-care"},
        "concerns": [],
        "routine": [],
        "goals": [],
        "log": [],
        "learning": {k: "todo" for k in KNOWLEDGE},
    }


def load(strict=True):
    p = path()
    if not p.exists():
        if strict:
            sys.exit(f"档案不存在: {p}\n先跑: python3 scripts/profile.py init")
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"档案损坏: {p} — {e}")


def save(data):
    data["updated_at"] = now()
    p = path()
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=".profile.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, p)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    print(f"已更新 {p}")


def require(value, allowed, field):
    if value not in allowed:
        sys.exit(f"{field} 只能是 {'/'.join(allowed)}，收到: {value}")
    return value


def cmd_init(a):
    p = path()
    if p.exists() and not a.force:
        sys.exit(f"档案已存在: {p}（要重建加 --force，会覆盖）")
    save(empty())
    print("字段说明: stage(knowledge/care_complexity/triage) concerns routine goals log learning")


def cmd_show(a):
    d = load()
    if a.json:
        print(json.dumps(d, ensure_ascii=False, indent=2))
        return
    st = d["stage"]
    lr = d["learning"]
    print(f"档案: {path()}")
    print(f"更新: {d['updated_at']}")
    print(f"阶段: 认知 {st['knowledge']} | 护理 {st['care_complexity']} | 分诊 {st['triage']}")
    print(f"主诉: {', '.join(d['concerns']) or '（未记录）'}")
    print(f"学习: " + "  ".join(f"{k}={v}" for k, v in lr.items()))
    print(f"方案: {len(d['routine'])} 步")
    for i, r in enumerate(d["routine"], 1):
        print(f"  {i}. {r['step']} — {r.get('product_type','')} {r.get('freq','')}")
    goals = [g for g in d["goals"] if g["status"] == "active"]
    print(f"目标: {len(goals)} 个进行中")
    for g in goals:
        print(f"  [{g['id']}] {g['text']} (since {g['since']})")
    print(f"打卡: {len(d['log'])} 天" + (f"，最近 {d['log'][-1]['date']}" if d["log"] else ""))


def cmd_set_stage(a):
    d = load()
    if a.knowledge:
        d["stage"]["knowledge"] = require(a.knowledge, KNOWLEDGE, "knowledge")
    if a.complexity:
        d["stage"]["care_complexity"] = require(a.complexity, COMPLEXITY, "complexity")
    if a.triage:
        d["stage"]["triage"] = require(a.triage, TRIAGE, "triage")
    save(d)


def cmd_set_concerns(a):
    d = load()
    d["concerns"] = [c.strip() for c in a.concerns.split(",") if c.strip()]
    save(d)


def cmd_add_routine(a):
    d = load()
    parts = a.spec.split(":")
    if len(parts) < 2:
        sys.exit('格式: "步骤:产品类型:频率"，例 "cleanse:氨基酸洁面:2/day"')
    step, ptype = parts[0].strip(), parts[1].strip()
    freq = parts[2].strip() if len(parts) > 2 else ""
    d["routine"].append({"step": step, "product_type": ptype, "freq": freq})
    save(d)


def cmd_del_routine(a):
    d = load()
    if not 1 <= a.index <= len(d["routine"]):
        sys.exit(f"序号超范围: 1–{len(d['routine'])}")
    removed = d["routine"].pop(a.index - 1)
    print(f"已移除: {removed['step']}")
    save(d)


def cmd_add_goal(a):
    d = load()
    n = len(d["goals"]) + 1
    gid = f"g{n}"
    while any(g["id"] == gid for g in d["goals"]):
        n += 1
        gid = f"g{n}"
    d["goals"].append({"id": gid, "text": a.text, "since": today(), "status": "active"})
    print(f"新建目标 {gid}: {a.text}")
    save(d)


def cmd_goal_status(a):
    d = load()
    g = next((x for x in d["goals"] if x["id"] == a.goal_id), None)
    if not g:
        sys.exit(f"没有目标 {a.goal_id}")
    g["status"] = require(a.status, STATUS, "status")
    save(d)


def cmd_log_done(a):
    d = load()
    day = a.date or today()
    entry = next((x for x in d["log"] if x["date"] == day), None)
    if not entry:
        entry = {"date": day, "done": []}
        d["log"].append(entry)
    for s in a.steps:
        s = s.strip()
        if s and s not in entry["done"]:
            entry["done"].append(s)
    d["log"].sort(key=lambda x: x["date"])
    d["log"] = d["log"][-180:]
    print(f"{day} 完成: {', '.join(entry['done'])}")
    save(d)


def cmd_set_learning(a):
    d = load()
    require(a.level, KNOWLEDGE, "level")
    d["learning"][a.level] = require(a.state, LEARNING_STATE, "state")
    save(d)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init"); p.add_argument("--force", action="store_true"); p.set_defaults(f=cmd_init)
    p = sub.add_parser("show"); p.add_argument("--json", action="store_true"); p.set_defaults(f=cmd_show)
    p = sub.add_parser("set-stage")
    p.add_argument("--knowledge"); p.add_argument("--complexity"); p.add_argument("--triage")
    p.set_defaults(f=cmd_set_stage)
    p = sub.add_parser("set-concerns"); p.add_argument("concerns"); p.set_defaults(f=cmd_set_concerns)
    p = sub.add_parser("add-routine"); p.add_argument("spec"); p.set_defaults(f=cmd_add_routine)
    p = sub.add_parser("del-routine"); p.add_argument("index", type=int); p.set_defaults(f=cmd_del_routine)
    p = sub.add_parser("add-goal"); p.add_argument("text"); p.set_defaults(f=cmd_add_goal)
    p = sub.add_parser("goal-status"); p.add_argument("goal_id"); p.add_argument("status"); p.set_defaults(f=cmd_goal_status)
    p = sub.add_parser("log-done"); p.add_argument("steps", nargs="+"); p.add_argument("--date"); p.set_defaults(f=cmd_log_done)
    p = sub.add_parser("set-learning"); p.add_argument("level"); p.add_argument("state"); p.set_defaults(f=cmd_set_learning)

    a = ap.parse_args()
    a.f(a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
