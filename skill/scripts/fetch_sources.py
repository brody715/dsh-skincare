#!/usr/bin/env python3
"""fetch_sources.py — 重新拉取 AAD 英文原文副本到 sources/core/

为什么需要这个脚本：AAD 页面正文有版权，本仓库**不随开源/公开版本发布**这些原文副本。
`skill/sources/core/` 只是本地离线核对用的缓存，可以随时删掉、用本脚本重建。

用法：
    python3 scripts/fetch_sources.py --check          # 只检查缺哪些，不联网
    python3 scripts/fetch_sources.py                 # 补齐缺失的核心页（默认 ~73 页）
    python3 scripts/fetch_sources.py --force         # 全部重拉
    python3 scripts/fetch_sources.py --all-in-scope  # 拉全部在范围内的页面（~323 页，慢）
    python3 scripts/fetch_sources.py --slug public-everyday-care-skin-care-basics-care --force

输出格式与 sources/core/ 现有文件一致（YAML 头 + 英文正文），
`scripts/lookup.py --url/--check/--audit` 与 `01`–`12` 模块的引用不依赖它，缺了也能跑。

只用标准库即可运行；装了 trafilatura 会用它提取正文（更干净），否则退化为内置解析器。
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(SKILL_DIR, "sources")
INDEX = os.path.join(SOURCES, "index.jsonl")
TOPICS = os.path.join(SOURCES, "topics.json")
CORE = os.path.join(SOURCES, "core")

UA = ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36")

# 页面里这些块不属正文，遇到就整块跳过
SKIP_TAGS = {"script", "style", "noscript", "nav", "header", "footer",
             "aside", "form", "button", "svg", "iframe"}
BLOCK_TAGS = {"p", "div", "section", "article", "li", "h1", "h2", "h3", "h4",
              "h5", "h6", "br", "tr", "blockquote", "ul", "ol"}


# ---------------------------------------------------------------- 索引 / 主题

def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_topics():
    with open(TOPICS, encoding="utf-8") as f:
        data = json.load(f)
    return data["topics"] if isinstance(data, dict) else data


def core_set(topics):
    """topics.json 里 core_page_ids 的并集 —— 这就是 sources/core/ 应有的文件集合。"""
    want = set()
    for t in topics:
        for pid in t.get("core_page_ids", []):
            want.add(pid)
    return want


def core_path(slug):
    return os.path.join(CORE, slug.replace("/", "-") + ".md")


def topics_of(topics, page_id):
    return [t["id"] for t in topics if page_id in t.get("page_ids", [])]


# ---------------------------------------------------------------- HTML -> 纯文本

class _TextExtractor(HTMLParser):
    """没装 trafilatura 时的兜底：丢掉脚本/导航，按块级标签断行，压掉空行。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.buf = []
        self.skip = 0
        self.in_body = False
        self.seen_h1 = False

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.in_body = True
        if tag in SKIP_TAGS:
            self.skip += 1
        elif tag in BLOCK_TAGS:
            self.buf.append("\n")
            if tag == "li":
                self.buf.append("- ")
            elif tag in ("h2", "h3", "h4"):
                self.buf.append("## ")
            elif tag == "h1":
                self.seen_h1 = True

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1
        elif tag in BLOCK_TAGS:
            self.buf.append("\n")

    def handle_data(self, data):
        if self.skip or not self.in_body:
            return
        self.buf.append(re.sub(r"\s+", " ", data))

    def text(self):
        raw = "".join(self.buf)
        lines = []
        for line in raw.split("\n"):
            line = line.strip()
            if line:
                lines.append(line)
        out = []
        for line in lines:
            if out and line == out[-1]:
                continue  # 相邻重复行（导航残留）
            out.append(line)
        return "\n\n".join(out)


def html_to_md(html):
    try:
        import trafilatura  # 可选依赖
        md = trafilatura.extract(html, output_format="markdown", include_links=False,
                                 include_images=False, favor_recall=True)
        if md and len(md.strip()) > 200:
            lines = md.strip().split("\n")
            if lines and lines[0].lstrip().startswith("#"):
                lines = lines[1:]
            return "\n".join(lines).strip()
    except Exception:
        pass
    p = _TextExtractor()
    p.feed(html)
    return p.text()


def grab_title(html, fallback):
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    if m:
        t = re.sub(r"<[^>]+>", " ", m.group(1))
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            return t
    m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip().split("|")[0].strip()
    return fallback


# ---------------------------------------------------------------- 抓取 / 写盘

def fetch(url, retries=3, timeout=30):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "ignore")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def yaml_str(s):
    s = (s or "").replace('"', '\\"').replace("\n", " ")
    return '"' + s + '"'


def render(row, title, body, topics, fetched_at):
    tids = topics_of(topics, row["id"])
    words = len(re.findall(r"[A-Za-z']+", body))
    return (
        "---\n"
        "source_url: %s\n"
        "fetched_at: %s\n"
        "words: %d\n"
        "title: %s\n"
        "slug: %s\n"
        "topics: [%s]\n"
        "---\n\n"
        "# %s\n\n%s\n"
    ) % (row["url"], fetched_at, words, yaml_str(title), row["slug"],
         ", ".join(tids), title, body.strip())


def main():
    ap = argparse.ArgumentParser(description="重新拉取 AAD 英文原文副本到 sources/core/")
    ap.add_argument("--check", action="store_true", help="只报告缺失，不联网")
    ap.add_argument("--force", action="store_true", help="已有文件也重拉")
    ap.add_argument("--all-in-scope", action="store_true", help="拉全部 in_scope 页面（默认只拉核心页）")
    ap.add_argument("--slug", help="只处理这一页（右边是 slug，含斜杠）")
    ap.add_argument("--limit", type=int, help="最多拉几页（试跑用）")
    ap.add_argument("--delay", type=float, default=1.0, help="每页之间停顿秒数，默认 1.0")
    args = ap.parse_args()

    rows = load_jsonl(INDEX)
    topics = load_topics()

    if args.slug:
        want = {r["id"] for r in rows if r["slug"] == args.slug.strip("/")}
        if not want:
            print("找不到这个 slug: %s" % args.slug, file=sys.stderr)
            return 2
    elif args.all_in_scope:
        want = {r["id"] for r in rows if r.get("in_scope")}
    else:
        want = core_set(topics)

    targets = [r for r in rows if r["id"] in want]
    targets.sort(key=lambda r: r["slug"])

    os.makedirs(CORE, exist_ok=True)
    todo, have = [], 0
    for r in targets:
        if os.path.exists(core_path(r["slug"])):
            have += 1
            if not (args.force or args.slug):
                continue
        todo.append(r)

    if args.check:
        print("目标页面 %d，已有 %d，缺失 %d" % (len(targets), have, len(todo)))
        for r in todo[:20]:
            print("  缺 %s" % r["slug"])
        if len(todo) > 20:
            print("  ... 另有 %d 页" % (len(todo) - 20))
        print("重建：python3 scripts/fetch_sources.py")
        return 0

    if args.limit:
        todo = todo[:args.limit]
    if not todo:
        print("全部就绪：%d 页已在 sources/core/" % have)
        return 0

    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    ok = fail = skipped = 0
    for i, r in enumerate(todo, 1):
        url = r["url"]
        try:
            html = fetch(url)
        except Exception as e:
            fail += 1
            print("[%d/%d] 失败 %s — %s" % (i, len(todo), r["slug"], e))
            continue
        body = html_to_md(html)
        if len(re.findall(r"[A-Za-z']+", body)) < 120:
            skipped += 1
            print("[%d/%d] 跳过（正文太短，可能是跳转页）%s" % (i, len(todo), r["slug"]))
            continue
        title = grab_title(html, r.get("title") or r["slug"])
        with open(core_path(r["slug"]), "w", encoding="utf-8") as f:
            f.write(render(r, title, body, topics, fetched_at))
        ok += 1
        print("[%d/%d] ok %s (%d words)" % (i, len(todo), r["slug"],
                                            len(re.findall(r"[A-Za-z']+", body))))
        time.sleep(max(0.0, args.delay))

    print("\n完成：写入 %d，跳过 %d，失败 %d" % (ok, skipped, fail))
    print("目录：%s" % CORE)
    if fail:
        print("失败的多半是网络问题或页面已改版，可以重跑一次。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
