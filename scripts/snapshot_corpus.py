#!/usr/bin/env python3
"""把 aad-skin-lib 的语料打成一个 checkpoint 快照，写进本仓库 corpus/<checkpoint>/。

用法:
    python3 scripts/snapshot_corpus.py --source /root/aad-library/repo
    python3 scripts/snapshot_corpus.py --source <repo> --checkpoint 2026-11-22T1730+0800

产出（corpus/<checkpoint>/）：
    zh/<page-id>.json   856 份逐页中文译文（原文 = aad-skin-lib/zh/）
    en-index.json       英文索引（id/url/slug/title/summary/words/kind/... 不含正文）
    manifest.json       页数、时间戳、逐文件哈希汇总、来源与版权说明
    README.md           快照说明（由本脚本生成，不要手改）

checkpoint 名默认取 zh 译文里最大的 translated_at（东八区），即「这批内容是什么时候定型的」。
"""
import argparse
import hashlib
import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CST = timezone(timedelta(hours=8))
ATTRIBUTION = (
    "英文原文来自美国皮肤病学会（AAD）公众科普页面，版权归 American Academy of Dermatology 所有；"
    "中文为机器翻译，仅供参考，英文原文为准。仅供个人学习，不得再分发或商用。"
)


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="aad-skin-lib 仓库目录")
    ap.add_argument("--checkpoint", help="快照目录名，默认取最大 translated_at")
    args = ap.parse_args()

    src = Path(args.source).expanduser().resolve()
    corpus_json = src / "data" / "corpus.json"
    zh_dir = src / "zh"
    if not corpus_json.is_file() or not zh_dir.is_dir():
        raise SystemExit(f"目录不对：{src} 下没有 data/corpus.json 或 zh/")

    corpus = json.loads(corpus_json.read_text(encoding="utf-8"))
    pages = corpus["pages"]
    id_field = "id"

    zh_files = sorted(p for p in zh_dir.glob("*.json"))
    zh_docs = {}
    stamps = []
    for path in zh_files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        zh_docs[doc[id_field]] = doc
        if doc.get("translated_at"):
            stamps.append(doc["translated_at"])

    known = {p[id_field] for p in pages}
    unknown = sorted(set(zh_docs) - known)
    if unknown:
        raise SystemExit(f"zh/ 里有 {len(unknown)} 个 id 不在 corpus.json 里，例如 {unknown[:3]}")
    missing = sorted(known - set(zh_docs))
    if missing:
        raise SystemExit(f"还差 {len(missing)} 页没有译文，例如 {missing[:3]}")

    if stamp := (max(stamps)[:16].replace("T", "T") if stamps else ""):
        pass
    checkpoint = args.checkpoint or (
        datetime.fromisoformat(max(stamps)).strftime("%Y-%m-%dT%H%M+0800") if stamps else ""
    )
    if not checkpoint:
        raise SystemExit("译文里没有 translated_at，请用 --checkpoint 指定目录名")

    out = ROOT / "corpus" / checkpoint
    if out.exists():
        shutil.rmtree(out)
    (out / "zh").mkdir(parents=True)

    file_hashes = {}
    for page_id, doc in zh_docs.items():
        target = out / "zh" / f"{page_id}.json"
        target.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        file_hashes[f"zh/{page_id}.json"] = sha256(target)

    index = {
        "generated_at": corpus.get("generated_at"),
        "source": corpus.get("source"),
        "pages": [{k: v for k, v in p.items() if k != "body_md"} for p in pages],
    }
    (out / "en-index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    file_hashes["en-index.json"] = sha256(out / "en-index.json")

    rolled = hashlib.sha256()
    for name in sorted(file_hashes):
        rolled.update(f"{name}:{file_hashes[name]}\n".encode())

    empty_body = sum(1 for d in zh_docs.values() if not (d.get("body_md_zh") or "").strip())
    manifest = {
        "checkpoint": checkpoint,
        "snapshot_at": datetime.now(CST).isoformat(timespec="seconds"),
        "source_repo": "https://github.com/brody715/aad-skin-lib (private)",
        "source_generated_at": corpus.get("generated_at"),
        "translated_at": {"min": min(stamps) if stamps else None, "max": max(stamps) if stamps else None},
        "counts": {
            "en_index_pages": len(pages),
            "zh_pages": len(zh_docs),
            "zh_empty_body": empty_body,
        },
        "zh_schema": ["id", "title_zh", "summary_zh", "body_md_zh", "translated_at", "batch"],
        "en_index_schema": [
            "id", "url", "slug", "title", "summary", "words", "kind",
            "updated", "reviewers", "path", "children",
        ],
        "en_full_text_included": False,
        "rolled_sha256": rolled.hexdigest(),
        "files_sha256": file_hashes,
        "attribution": ATTRIBUTION,
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    readme = f"""# 语料快照 {checkpoint}

AAD（美国皮肤病学会）公众科普语料的 {checkpoint} 版。**只随本仓库分发中文全量 + 英文索引，不含英文正文**；
英文原文需要时用 `skill/scripts/fetch_sources.py` 从 AAD.url 现拉。

## 内容

| 路径 | 内容 |
| --- | --- |
| `zh/<page-id>.json` | 逐页中文译文，{len(zh_docs)} 份（其中 {empty_body} 份是章节目录页，正文为空） |
| `en-index.json` | 英文索引 {len(pages)} 页：标题、摘要、主题路径、AAD 原始 url、字数等，不含正文 |
| `manifest.json` | 页数、时间戳、逐文件 sha256、汇总哈希、来源与版权说明 |

`page-id` 形如 `public__cosmetic__age-spots-marks__get-rid-spots`，与 `en-index.json` 的 `id` 一一对应。

## 中文文件字段

`id` / `title_zh` / `summary_zh` / `body_md_zh` / `translated_at` / `batch`。

## 怎么用

```bash
# 查一页的英文元信息（标题、url、主题路径）
python3 skill/scripts/lookup.py --url cosmetic/age-spots-marks/get-rid-spots
# 读一页中文正文（有快照时优先读快照，否则回落到 skill/sources/core 里的英文原文）
python3 skill/scripts/lookup.py --read cosmetic/age-spots-marks/get-rid-spots
```

## 来源与版权

{ATTRIBUTION}

快照是机器生成的：`python3 scripts/snapshot_corpus.py --source <aad-skin-lib 仓库>`。
要换新的一批语料时不要就地改 `corpus/<checkpoint>/`，直接跑脚本生成新的时间文件夹，旧快照留着做对照。
"""
    (out / "README.md").write_text(readme, encoding="utf-8")

    print(f"ok  {out}")
    print(f"    zh {len(zh_docs)} 页 / en 索引 {len(pages)} 页 / empty_body {empty_body}")
    print(f"    rolled_sha256 {rolled.hexdigest()[:16]}…")
    print(f"    size {sum(f.stat().st_size for f in out.rglob('*') if f.is_file()) / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
