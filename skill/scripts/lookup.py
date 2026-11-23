#!/usr/bin/env python3
"""AAD 语料检索 / 引用校验。

用法:
    python3 scripts/lookup.py "sunscreen stick spray"        # 全库搜（标题优先）
    python3 scripts/lookup.py --topic acne                   # 看主题下有哪些页面
    python3 scripts/lookup.py --check skin-care-basics/care  # 校验 slug 是否真实存在
    python3 scripts/lookup.py --url skin-care-basics/care    # 取 AAD 原始地址
    python3 scripts/lookup.py --topics                       # 列出主题树
    python3 scripts/lookup.py --read skin-care-basics/care   # 读整页：本地有语料副本就读，没有就给原文地址

设计原则：引用只能来自 index.jsonl 里真实存在的 slug，杜绝凭记忆编引用。
slug 不存在就返回非 0，调用方必须如实说「没有查到」。

语料边界：AAD 原文副本（sources/core/）与其中文机翻（corpus/）属第三方内容，不随包分发，
只在本地生成。所以 --read 在两者都缺时不算失败：打印标题与原文地址后正常返回，
由人（或模型）去读原文（英文即可）。
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SOURCES = SKILL_DIR / "sources"
INDEX = SOURCES / "index.jsonl"
TOPICS = SOURCES / "topics.json"
CORE = SOURCES / "core"
PKG_ROOT = SKILL_DIR.parent


def load_index():
    if not INDEX.exists():
        sys.exit(f"找不到索引文件: {INDEX}（索引由仓库维护脚本 scripts/mine_corpus.py 生成）")
    rows = []
    with INDEX.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_topics():
    if not TOPICS.exists():
        sys.exit(f"找不到主题树: {TOPICS}")
    return json.loads(TOPICS.read_text(encoding="utf-8"))


def core_path(slug):
    """core 原文文件名：slug 里的 / 换成 -。"""
    if not CORE.is_dir():
        return None
    cand = CORE / (slug.replace("/", "-") + ".md")
    return cand if cand.exists() else None


def id_map():
    """topics.json 里的 page_ids 存的是 id（__ 形式），这里建 id -> row。"""
    return {r["id"]: r for r in load_index()}


def cmd_topics():
    topics = load_topics()
    items = topics["topics"] if isinstance(topics, dict) else topics
    for t in items:
        print(f"{t['id']:<32} {t['title_zh']:<18} {len(t.get('page_ids', [])):>3} 页  {t.get('summary_zh','')}")
    print(f"\n共 {len(items)} 个主题")


def cmd_topic(tid):
    topics = load_topics()
    items = topics["topics"] if isinstance(topics, dict) else topics
    hit = next((t for t in items if t["id"] == tid), None)
    if not hit:
        sys.exit(f"没有这个主题: {tid}。可用: {', '.join(t['id'] for t in items)}")
    byid = id_map()
    core = set(hit.get("core_page_ids", []))
    print(f"# {hit['title_zh']} ({hit['id']})\n{hit.get('summary_zh','')}\n")
    miss = 0
    for pid in hit.get("page_ids", []):
        row = byid.get(pid)
        if not row:
            print(f"  [缺] {pid}")
            miss += 1
            continue
        mark = "★" if pid in core else " "
        print(f" {mark} {row['slug']:<68} {row.get('words', 0):>5}w  {row['title'][:44]}")
    if miss:
        print(f"\n警告: {miss} 个 page_id 在 index.jsonl 里找不到（topics.json 与索引不一致）")
    print("\n★ = 核心页（英文原文副本在 sources/core/，引用用 slug 尾部）")


def resolve(fragment, idx):
    """把引用片段解析成唯一 slug。允许写 slug 的尾部，要求唯一。"""
    fragment = fragment.strip().strip("/")
    if fragment in idx:
        return fragment, []
    cands = [s for s in idx if s == fragment or s.endswith("/" + fragment)]
    if len(cands) == 1:
        return cands[0], []
    return None, cands


def cmd_check(fragment):
    idx = {r["slug"]: r for r in load_index()}
    slug, cands = resolve(fragment, idx)
    if slug:
        row = idx[slug]
        print(slug)
        print(f"  {row['url']}")
        return 0
    if cands:
        print(f"引用有歧义: {fragment}", file=sys.stderr)
        print("候选:\n  " + "\n  ".join(cands[:10]), file=sys.stderr)
        return 1
    tail = fragment.split("/")[-1]
    near = [s for s in idx if tail and tail in s][:8]
    print(f"slug 不存在: {fragment}", file=sys.stderr)
    if near:
        print("相近候选:\n  " + "\n  ".join(near), file=sys.stderr)
    return 1


def cmd_url(fragment):
    idx = {r["slug"]: r for r in load_index()}
    slug, _ = resolve(fragment, idx)
    if not slug:
        sys.exit(f"slug 无法解析: {fragment}")
    print(idx[slug]["url"])
    return 0


def corpus_root():
    """包内语料快照目录：<包根>/corpus/<checkpoint>/。可用 DSH_SKIN_CARE_CORPUS 覆盖。"""
    env = os.environ.get("DSH_SKIN_CARE_CORPUS")
    if env:
        return Path(env).expanduser()
    base = PKG_ROOT / "corpus"
    if not base.is_dir():
        return None
    snaps = sorted((d for d in base.iterdir() if d.is_dir()), reverse=True)
    return snaps[0] if snaps else None


def cmd_read(fragment):
    """读一页正文。

    本地有语料副本（中文机翻 / 英文原文）就直接给出；
    两者都没有（公开发布后的常态）就打印标题 + 原文地址，让人自己去读原文。
    """
    idx = {r["slug"]: r for r in load_index()}
    slug, cands = resolve(fragment, idx)
    if not slug:
        print(f"slug 无法解析: {fragment}" + ("（有歧义）" if cands else ""), file=sys.stderr)
        return 1
    row = idx[slug]

    root = corpus_root()
    if root is not None:
        zh_file = root / "zh" / f"{row['id']}.json"
        if zh_file.exists():
            page = json.loads(zh_file.read_text(encoding="utf-8"))
            body = (page.get("body_md_zh") or "").strip()
            if body:
                print(f"# {page.get('title_zh') or row['title']}\n")
                if page.get("summary_zh"):
                    print(f"> {page['summary_zh'].strip()}\n")
                print(body)
                print(f"\n---\n中文由机器翻译（{root.name}），原文 {row['url']}")
                return 0

    core = core_path(slug)
    if core is not None:
        print(core.read_text(encoding="utf-8"))
        print(f"\n---\n英文原文副本，取自 {row['url']}")
        return 0

    print(f"# {row['title']}\n")
    print(f"- slug: `{slug}`")
    print(f"- 栏目: {row.get('section', '-')}")
    print(f"- 原文: {row['url']}")
    print()
    print("这一页的原文不在包内（第三方内容不随包分发）。")
    print("读法：打开上面的地址读英文原文；需要整段核对时把链接转给读者，不要凭记忆复述细节。")
    return 0


CITE_RE = re.compile(r"\[s:([^\]]+)\]")
# 文档里用来演示格式的占位符，不算真引用
PLACEHOLDER = {"slug", "<slug>", "...", "…", "slug>", "xxx"}


def cmd_audit():
    """扫描 references/ 与 agents/ 里所有 [s:slug] 引用，逐个校验。"""
    idx = {r["slug"]: r for r in load_index()}
    files = sorted((SKILL_DIR / "references").glob("*.md")) + sorted((SKILL_DIR / "agents").glob("*.md")) \
        + [SKILL_DIR / "SKILL.md"]
    total = bad = 0
    seen = {}
    for fp in files:
        if not fp.exists():
            continue
        text = fp.read_text(encoding="utf-8", errors="ignore")
        for frag in CITE_RE.findall(text):
            if frag.strip().lower() in PLACEHOLDER or frag.strip().startswith("<"):
                continue
            total += 1
            seen.setdefault(frag, []).append(fp.name)
            slug, cands = resolve(frag, idx)
            if slug:
                continue
            bad += 1
            reason = "歧义" if cands else "不存在"
            print(f"✗ {fp.name}: [s:{frag}] -> {reason}")
            for c in cands[:5]:
                print(f"    候选: {c}")
    print(f"\n引用总数 {total}，唯一片段 {len(seen)}，问题 {bad}")
    unused = [s for s in idx if not any(resolve(f, idx)[0] == s for f in seen)]
    if total:
        print(f"未被引用的页面 {len(unused)}（库大，正常）")
    return 1 if bad else 0



def snippet(text, pattern, width=120):
    m = re.search(pattern, text, re.I)
    if not m:
        return ""
    a = max(0, m.start() - width // 2)
    b = min(len(text), m.end() + width)
    return re.sub(r"\s+", " ", text[a:b]).strip()


def cmd_search(query, limit=8, scope="all"):
    idx = load_index()
    rows = [r for r in idx if r.get("in_scope", True)] if scope == "in_scope" else idx
    terms = [t for t in re.split(r"[\s,，]+", query.strip()) if t]
    if not terms:
        sys.exit("查询为空")

    scored = []
    for r in rows:
        hay_title = (r["title"] + " " + r["slug"]).lower()
        body = ""
        cp = core_path(r["slug"])
        if cp:
            body = cp.read_text(encoding="utf-8", errors="ignore").lower()
        score = 0
        for t in terms:
            tl = t.lower()
            if tl in hay_title:
                score += 10
            if body and tl in body:
                score += 3
        if score:
            scored.append((score, r, body))
    scored.sort(key=lambda x: -x[0])

    if not scored:
        print(f"没有命中: {query}\n提示：换英文关键词，或 --topics 看主题树。", file=sys.stderr)
        return 1

    for score, r, body in scored[:limit]:
        print(f"[{score:>3}] {r['slug']}")
        print(f"      {r['title']}  ({r.get('words',0)}w)  ★原文" if core_path(r["slug"]) else f"      {r['title']}  ({r.get('words',0)}w)")
        if body:
            sn = snippet(body, re.escape(terms[0]))
            if sn:
                print(f"      … {sn[:220]} …")
        print(f"      url: {r['url']}")
    return 0


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("query", nargs="*", help="搜索关键词（优先用英文）")
    ap.add_argument("--topic")
    ap.add_argument("--topics", action="store_true")
    ap.add_argument("--check")
    ap.add_argument("--url")
    ap.add_argument("--read", metavar="SLUG", help="读整页正文（中文全译优先，退回英文原文）")
    ap.add_argument("--audit", action="store_true", help="校验 references/ 里所有 [s:slug] 引用")
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--in-scope", action="store_true", help="只搜护肤相关页面")
    a = ap.parse_args()

    if a.audit:
        return cmd_audit()
    if a.topics:
        return cmd_topics()
    if a.topic:
        return cmd_topic(a.topic)
    if a.check:
        return cmd_check(a.check)
    if a.url:
        return cmd_url(a.url)
    if a.read:
        return cmd_read(a.read)
    if not a.query:
        ap.print_help()
        return 2
    return cmd_search(" ".join(a.query), a.limit, "in_scope" if a.in_scope else "all")


if __name__ == "__main__":
    sys.exit(main() or 0)
