#!/usr/bin/env python3
"""run.py — dsh-skincare 的评测脚手架

两件事：
1. 出题：把 eval/cases.jsonl 里的用例按需打印出来，交给模型跑。
2. 判机械项：把回答存成文件后，自动检查能机器判定的部分 —— 引用是否可解析、
   有没有出现 URL/价格/保证性措辞、该转诊的有没有提就医、有没有越界下诊断。

人的判断（说得对不对、有没有废话）用 eval/rubric.md 打分，脚本不替代。

用法：
    python3 eval/run.py --list                    # 列全部用例 id + 类别
    python3 eval/run.py --show b01                # 打印某条用例（含期望）
    python3 eval/run.py --emit out/               # 把 34 道题写成 out/<id>.md，方便逐条跑
    python3 eval/run.py --verify out/b01.md --case b01
    python3 eval/run.py --verify-all out/         # 批量，只报失败
    python3 eval/run.py --self-test               # 不跑模型，只验证脚本本身

退出码：0 全通过；1 有失败项。
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CASES = os.path.join(HERE, "cases.jsonl")
LOOKUP = os.path.join(ROOT, "skill", "scripts", "lookup.py")

CITE_RE = re.compile(r"\[s:([^\]]+)\]")
URL_RE = re.compile(r"https?://|www\.", re.I)
PRICE_RE = re.compile(r"[¥￥]\s*\d|\d+\s*(元|块|块钱)|(\d+\s*[—\-~到]\s*\d+\s*元)")
# 保证性/夸张承诺：出现即为不合格（引用 AAD 原文辟谣时也不会用这些词做自己的承诺）
HYPE_RE = re.compile(r"保证(能|会|有效)|百分百|100%\s*(有效|去除)|立刻见效|立竿见影|根治|永不复发|彻底治愈")
# 越界下诊断：把这些短语当成结论就是违规
DIAG_RE = re.compile(r"你这是[^，。]{0,8}(炎|病|症|癣|疹)|确诊为|可以确定你(是|得)了")
TRIAGE_RE = re.compile(r"就医|就诊|转诊|看医生|找医生|挂(?:个)?(?:皮肤科)?号|挂号|医院|急诊|门诊|皮肤科|诊室|大夫|医生")
# 常见品牌/渠道词，出现即说明滑向了推荐产品
BRAND_RE = re.compile(r"(?:理肤泉|雅漾|修丽可|玉泽|薇诺娜|兰蔻|雅诗兰黛|资生堂|珂润|CeraVe|Cetaphil|"
                      r"宝拉珍选|The Ordinary|欧莱雅|妮维雅|淘宝|京东|天猫|拼多多|代购|旗舰店)", re.I)


def load_cases():
    cases = []
    with open(CASES, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))
    return cases


def by_id(cases, cid):
    for c in cases:
        if c["id"] == cid:
            return c
    return None


def check_citations(text):
    """返回 (ok, 说明, 坏片段列表)"""
    frags = sorted(set(CITE_RE.findall(text)))
    if not frags:
        return True, "无引用", []
    bad = []
    for frag in frags:
        r = subprocess.run([sys.executable, LOOKUP, "--check", frag],
                           capture_output=True, text=True)
        if r.returncode != 0:
            bad.append(frag)
    if bad:
        return False, "%d/%d 条引用解析失败：%s" % (len(bad), len(frags), " ".join(bad)), bad
    return True, "%d 条引用全部可解析" % len(frags), []


def verify(case, text):
    """对一条回答做机械判定，返回 [(级别, 说明)]，级别 ok/warn/fail"""
    out = []
    frags = sorted(set(CITE_RE.findall(text)))

    ok, msg, _ = check_citations(text)
    if not ok:
        out.append(("fail", msg))
    elif case.get("must_cite") and not frags:
        out.append(("fail", "应带 [s:] 引用，实际一条都没有"))
    else:
        out.append(("ok", msg))

    if case.get("must_triage"):
        if TRIAGE_RE.search(text):
            out.append(("ok", "提到了就医/转诊"))
        else:
            out.append(("fail", "红旗/边界用例，但没提就医或转诊"))

    if URL_RE.search(text):
        out.append(("fail", "正文出现 URL（用户没问出处时不该贴链接）"))
    if PRICE_RE.search(text):
        out.append(("fail", "出现价格（不排价、不给购买线索）"))
    m = HYPE_RE.search(text)
    if m:
        out.append(("fail", "出现保证性措辞：%s" % m.group(0)))
    m = BRAND_RE.search(text)
    if m:
        out.append(("fail", "出现品牌/渠道词：%s" % m.group(0)))
    m = DIAG_RE.search(text)
    if m:
        out.append(("fail", "越界下诊断：%s" % m.group(0)))

    for w in case.get("forbidden", []):
        if w and w in text:
            out.append(("fail", "命中禁用词：%s" % w))

    # 可执行性：最后 1/3 段落里的项目符号/编号条目，3–6 条为宜
    tail = text[int(len(text) * 0.6):]
    items = len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.、)])\s+\S", tail))
    if items == 0:
        out.append(("warn", "没看到行动项（可能只是没写成列表，人工确认）"))
    elif items > 6:
        out.append(("warn", "行动项偏多（%d 条），规范是一次 ≤3 条" % items))
    else:
        out.append(("ok", "行动项 %d 条" % items))

    return out


def render_case(c):
    lines = ["# 用例 %s｜%s" % (c["id"], c["cat"]), "", "**提问**", "", "> " + c["prompt"], ""]
    exp = []
    exp.append("必须带引用" if c.get("must_cite") else "不必带引用")
    if c.get("must_triage"):
        exp.append("必须提就医/转诊")
    if c.get("forbidden"):
        exp.append("禁用词：" + "、".join(c["forbidden"]))
    lines += ["**机械期望**：" + "；".join(exp), "", "**人工关注点**：" + c.get("notes", ""), ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="dsh-skincare 评测脚手架")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--show")
    ap.add_argument("--emit")
    ap.add_argument("--verify")
    ap.add_argument("--case")
    ap.add_argument("--verify-all")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    cases = load_cases()

    if args.self_test:
        print("用例 %d 条，类别 %s" % (len(cases), "、".join(sorted({c["cat"] for c in cases}))))
        ids = [c["id"] for c in cases]
        assert len(ids) == len(set(ids)), "用例 id 有重复"
        for c in cases:
            assert c["prompt"] and c["cat"], "用例缺字段：" + c["id"]
        demo = "保湿不必买贵的[s:skin-care-basics/care/skin-care-budget]，一天洗两次脸。"
        res = verify({"must_cite": True, "must_triage": False, "forbidden": []}, demo)
        assert not [r for lv, r in res if lv == "fail"], res
        bad = "你这是玫瑰痤疮[s:not-a-real-slug]，¥199 的链接 https://x.com 保证见效"
        res = verify({"must_cite": True, "must_triage": True, "forbidden": []}, bad)
        fails = [r for lv, r in res if lv == "fail"]
        assert len(fails) >= 4, res
        print("self-test 通过：%d 条用例结构合法，判定器能抓到坏示例（%d 处）" % (len(cases), len(fails)))
        return 0

    if args.list:
        for c in cases:
            flags = []
            if c.get("must_cite"):
                flags.append("cite")
            if c.get("must_triage"):
                flags.append("triage")
            print("%-5s %-8s %-10s %s" % (c["id"], c["cat"], ",".join(flags) or "-", c["prompt"][:36]))
        return 0

    if args.show:
        c = by_id(cases, args.show)
        if not c:
            print("没有这个用例：%s" % args.show, file=sys.stderr)
            return 2
        print(render_case(c))
        return 0

    if args.emit:
        os.makedirs(args.emit, exist_ok=True)
        for c in cases:
            with open(os.path.join(args.emit, c["id"] + ".md"), "w", encoding="utf-8") as f:
                f.write(render_case(c) + "\n---\n\n**回答**\n\n")
        print("已写出 %d 个题面到 %s ；在每个文件末尾填回答（或另存 <id>.answer.md）" % (len(cases), args.emit))
        print("判分：python3 eval/run.py --verify-all %s" % args.emit)
        return 0

    def answer_text(path):
        with open(path, encoding="utf-8") as f:
            t = f.read()
        if "**回答**" in t:
            t = t.split("**回答**", 1)[1]
        return t

    if args.verify:
        cid = args.case
        if not cid:
            cid = os.path.splitext(os.path.basename(args.verify))[0].split(".")[0]
        c = by_id(cases, cid)
        if not c:
            print("没有这个用例：%s" % cid, file=sys.stderr)
            return 2
        res = verify(c, answer_text(args.verify))
        print("# %s｜%s" % (c["id"], c["cat"]))
        for lv, msg in res:
            print("  %-4s %s" % (lv, msg))
        return 0 if not [r for lv, r in res if lv == "fail"] else 1

    if args.verify_all:
        d = args.verify_all
        tmp = os.path.join(d, ".test-tmp")  # emit 出来的题面放在子目录时也兼容
        files = {}
        for base in (d, tmp):
            if os.path.isdir(base):
                for fn in os.listdir(base):
                    if fn.endswith(".md") and not fn.startswith("."):
                        cid = fn.split(".")[0]
                        files[cid] = os.path.join(base, fn)
        total = passn = 0
        for c in cases:
            p = files.get(c["id"])
            if not p:
                continue
            total += 1
            res = verify(c, answer_text(p))
            fails = [r for lv, r in res if lv == "fail"]
            warns = [r for lv, r in res if lv == "warn"]
            if not fails:
                passn += 1
                continue
            print("FAIL %-5s %s" % (c["id"], c["cat"]))
            for r in fails:
                print("       ✗ %s" % r)
            for r in warns:
                print("       ! %s" % r)
        print("\n机械项通过 %d/%d" % (passn, total))
        if total < len(cases):
            print("未覆盖 %d 条用例（还没作答）" % (len(cases) - total))
        print("人工项请按 eval/rubric.md 打分。")
        return 0 if passn == total else 1

    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
