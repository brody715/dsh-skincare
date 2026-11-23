#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mine_corpus.py —— 把 AAD 公共教育语料整理成可按主题检索、可溯源的索引。

输入（只读，不修改）：
  /root/aad-library/pages/corpus.json        抓取结果，856 页，权威来源
  /root/aad-library/pages/pages.jsonl        876 行原始抓取，只用于核对数量差
  /root/aad-library/GLOSSARY.md              英中术语表，主题名/摘要必须沿用

输出（只写 skill/sources/）：
  skill/sources/index.jsonl      每页一行的索引
  skill/sources/topics.json      主题树
  skill/sources/core/*.md        核心页英文原文（带 YAML 头）
  skill/sources/STATS.json       统计快照，供 REPORT.md 引用

用法：
  python3 mine_corpus.py            # 生成全部产物并打印统计
  python3 mine_corpus.py --check    # 只打印分类结果，不写文件
"""

import fnmatch
import hashlib
import json
import os
import re
import sys
from collections import Counter, OrderedDict

AAD = "/root/aad-library"
CORPUS = os.path.join(AAD, "pages", "corpus.json")
PAGES_JSONL = os.path.join(AAD, "pages", "pages.jsonl")
GLOSSARY = os.path.join(AAD, "GLOSSARY.md")

OUT_DIR = "/root/dsh-skincare/skill/sources"
CORE_DIR = os.path.join(OUT_DIR, "core")
INDEX = os.path.join(OUT_DIR, "index.jsonl")
TOPICS = os.path.join(OUT_DIR, "topics.json")
STATS = os.path.join(OUT_DIR, "STATS.json")

# ---------------------------------------------------------------- 读取语料


def load_pages():
    with open(CORPUS, encoding="utf-8") as f:
        raw = json.load(f)
    pages = raw["pages"]
    out = []
    for r in pages:
        words = r.get("words")
        try:
            words = int(str(words).strip())
        except (TypeError, ValueError):
            words = 0
        out.append(
            {
                "id": r.get("id") or r["slug"].replace("/", "__"),
                "slug": r["slug"],
                "url": r.get("url") or ("https://www.aad.org/" + r["slug"]),
                "title": (r.get("title") or "").strip(),
                "words": words,
                "kind": r.get("kind") or "article",
                "body_md": r.get("body_md") or "",
                "summary": (r.get("summary") or "").strip(),
                "updated": r.get("updated") or "",
            }
        )
    out.sort(key=lambda x: x["slug"])
    return raw.get("generated_at", ""), out


# ---------------------------------------------------------------- 在范围内判定
# 判定顺序：绝对排除 > 绝对包含 > 前缀包含 > 默认排除
# 结论与理由在 REPORT.md 里逐条说明；改这里就能整体重跑。

# 抓取残留/测试页，任何范围都不该收
JUNK = {
    "public/brodytest/test",
}

# 明确排除：头发/指甲/口腔/脚、美容操作细节、罕见病、与本项目无关的疾病
EXCLUDE_PREFIX = [
    "public/everyday-care/hair-scalp-care/",
    "public/everyday-care/nail-care-secrets/",
    "public/everyday-care/skin-care-basics/hair",
    "public/everyday-care/skin-care-basics/tattoos",
    "public/diseases/hair-loss/",
    "public/diseases/psoriasis/",
    "public/diseases/skin-cancer/",
    "public/darker-skin/hair-care",
    "public/darker-skin/hair-loss",
    "public/cosmetic/hair-removal",
    "public/cosmetic/wrinkles",
    "public/cosmetic/fat-removal",
    "public/cosmetic/younger-looking",
    "public/cosmetic/scars-stretch-marks",
    "public/everyday-care/injured-skin/bites",
]
EXCLUDE_EXACT = {
    # 测试/占位
    "public/diseases/a-z/seborrheic-keratoses-self-care",  # 正文为空，且脂溢性角化属良性增生
}

# 主题范围的主干（前缀包含）
INCLUDE_PREFIX = [
    "public/everyday-care/skin-care-basics/care",
    "public/everyday-care/skin-care-basics/dry",
    "public/everyday-care/skin-care-secrets/",
    "public/everyday-care/sun-protection/",
    "public/everyday-care/itchy-skin/poison-ivy",
    "public/diseases/acne/",
    "public/diseases/eczema/",
    "public/diseases/rosacea/",
    "public/darker-skin/secrets",
    "public/darker-skin/diseases",
]

# 逐页确认过的边界页（长尾）
INCLUDE_EXACT = {
    # 瘙痒/皮疹：与「何时就诊」「接触性皮炎」直接相关
    "public/everyday-care/itchy-skin/itch-relief",
    "public/everyday-care/itchy-skin/itch-relief/relieve-uncontrollably-itchy-skin",
    "public/everyday-care/itchy-skin/rash",
    "public/everyday-care/itchy-skin/rash/rash-101",
    "public/everyday-care/itchy-skin/rash/itchy-rash-contact-dermatitis",
    # 日晒/创伤：晒伤、紫外线设备、瘢痕预防
    "public/everyday-care/injured-skin/burns/treat-sunburn",
    "public/everyday-care/injured-skin/burns/uv-wands-injure-eyes-skin",
    "public/everyday-care/injured-skin/burns/wound-care-minimize-scars",
    # AAD 疾病库 a-z 里的日常护理型条目（逐条核对过标题与摘要）
    "public/diseases/a-z/benzoyl-peroxide-faqs",
    "public/diseases/a-z/diabetes-skin-care",
    "public/diseases/a-z/dry-skin-causes",
    "public/diseases/a-z/dry-skin-overview",
    "public/diseases/a-z/dry-skin-symptoms",
    "public/diseases/a-z/dry-skin-treatment",
    "public/diseases/a-z/folliculitis",
    "public/diseases/a-z/ichthyosis-vulgaris-causes",
    "public/diseases/a-z/ichthyosis-vulgaris-overview",
    "public/diseases/a-z/ichthyosis-vulgaris-self-care",
    "public/diseases/a-z/ichthyosis-vulgaris-symptoms",
    "public/diseases/a-z/ichthyosis-vulgaris-treatment",
    "public/diseases/a-z/keratosis-pilaris-causes",
    "public/diseases/a-z/keratosis-pilaris-overview",
    "public/diseases/a-z/keratosis-pilaris-self-care",
    "public/diseases/a-z/keratosis-pilaris-symptoms",
    "public/diseases/a-z/keratosis-pilaris-treatment",
    "public/diseases/a-z/melasma-causes",
    "public/diseases/a-z/melasma-overview",
    "public/diseases/a-z/melasma-self-care",
    "public/diseases/a-z/melasma-symptoms",
    "public/diseases/a-z/melasma-treatment",
    "public/diseases/a-z/perioral-dermatitis",
    "public/diseases/a-z/scars-causes",
    "public/diseases/a-z/scars-go-away",
    "public/diseases/a-z/scars-overview",
    "public/diseases/a-z/scars-symptoms",
    "public/diseases/a-z/scars-treatment",
    "public/diseases/a-z/seborrheic-dermatitis-causes",
    "public/diseases/a-z/seborrheic-dermatitis-overview",
    "public/diseases/a-z/seborrheic-dermatitis-self-care",
    "public/diseases/a-z/seborrheic-dermatitis-symptoms",
    "public/diseases/a-z/seborrheic-dermatitis-treatment",
    "public/diseases/a-z/skin-overall-health",
    "public/diseases/a-z/stress-skin-conditions",
    "public/diseases/a-z/acne-keloidalis-nuchae-causes",
    "public/diseases/a-z/acne-keloidalis-nuchae-overview",
    "public/diseases/a-z/acne-keloidalis-nuchae-self-care",
    "public/diseases/a-z/acne-keloidalis-nuchae-symptoms",
    "public/diseases/a-z/acne-keloidalis-nuchae-treatment",
    "public/diseases/a-z/keloids-causes",
    "public/diseases/a-z/keloids-overview",
    "public/diseases/a-z/keloids-self-care",
    "public/diseases/a-z/keloids-symptoms",
    "public/diseases/a-z/keloids-treatment",
    "public/diseases/a-z/mole-skin-tag-removal",
    # 美容板块只收「治疗 vs 护肤」边界的少量页面
    "public/cosmetic/age-spots-marks",
    "public/cosmetic/age-spots-marks/get-rid-spots",
    "public/cosmetic/safety/ask-questions",
    "public/cosmetic/safety/cryotherapy",
    "public/cosmetic/safety/needle-free-filler-risks",
    "public/cosmetic/safety/red-light-therapy",
    # 公共卫生板块只防晒/皮肤癌预防相关：Good Skin Knowledge 英文课程模块
    "public/public-health/good-skin-knowledge/lesson-plans/about-acne",
    "public/public-health/good-skin-knowledge/lesson-plans/daily-skin-care",
    "public/public-health/good-skin-knowledge/lesson-plans/eczema",
    "public/public-health/good-skin-knowledge/lesson-plans/intro-to-skin",
    "public/public-health/good-skin-knowledge/lesson-plans/love-your-skin",
    "public/public-health/good-skin-knowledge/lesson-plans/sun-safety",
    "public/public-health/good-skin-knowledge/lesson-plans/truth-about-skin",
}


def classify_scope(slug):
    """返回 (in_scope, reason)。reason 便于 REPORT 里复核与统计。"""
    if slug in JUNK:
        return False, "junk/test page"
    if slug in EXCLUDE_EXACT:
        return False, "explicit exclude"
    for p in EXCLUDE_PREFIX:
        p = p.rstrip("/")
        if slug == p or slug.startswith(p + "/"):
            return False, "excluded subtree: " + p
    if slug in INCLUDE_EXACT:
        return True, "explicit include (reviewed page)"
    for p in INCLUDE_PREFIX:
        p = p.rstrip("/")
        if slug == p or slug.startswith(p + "/"):
            return True, "included subtree: " + p
    return False, "out of project scope"


def apply_hub_rule(pages):
    """导航型 hub 页本身没正文，按子树在范围内占比推导。

    规则：hub 的子孙页 ≥60% 在范围内 → hub 也算在范围内（镜像目录结构），
    否则（如 public/diseases、public/everyday-care）保持排除。
    """
    by_slug = {p["slug"]: p for p in pages}
    changed = []
    for p in pages:
        if p["kind"] != "hub" or p["in_scope"]:
            continue
        prefix = p["slug"] + "/"
        kids = [q for q in pages if q["slug"].startswith(prefix)]
        if not kids:
            continue
        ratio = sum(1 for q in kids if q["in_scope"]) / len(kids)
        if ratio >= 0.60:
            p["in_scope"] = True
            p["reason"] = "hub of in-scope subtree (%.0f%%)" % (ratio * 100)
            changed.append(p["slug"])
    return changed


# ---------------------------------------------------------------- 主题路由
# 一页可属于多个主题（例如「干性皮肤」同时进 basics-moisturizing 与
# basics-skin-types）。规则写成「包含/排除」通配符，改动可追溯。

TOPIC_RULES = [
    # ---- 基础四件套 ----
    ("basics-cleansing", [
        "public/everyday-care/skin-care-basics/care",
        "public/everyday-care/skin-care-basics/care/face-washing-101",
        "public/everyday-care/skin-care-basics/care/baby-care-skin-hair-nails",
        "public/everyday-care/skin-care-basics/care/child-bathing",
        "public/everyday-care/skin-care-basics/care/newborn-bathing",
        "public/everyday-care/skin-care-basics/dry/coronavirus-handwashing",
        "public/everyday-care/skin-care-secrets/routine/clean-your-makeup-brushes",
        "public/diseases/a-z/seborrheic-dermatitis-self-care",
    ], []),
    ("basics-moisturizing", [
        "public/everyday-care/skin-care-basics/dry/pick-moisturizer",
        "public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin",
        "public/everyday-care/skin-care-basics/dry/heal-dry-chapped-lips",
        "public/everyday-care/skin-care-basics/dry/dry-heels",
        "public/everyday-care/skin-care-basics/care/winter-skin-survival-kit",
        "public/everyday-care/skin-care-secrets/routine/petroleum-jelly",
        "public/everyday-care/skin-care-secrets/routine/healthier-looking-skin",
        "public/everyday-care/skin-care-secrets/routine/facial-masks-and-skin-care",
        "public/everyday-care/skin-care-secrets/face/face-mask-skin-care",
        "public/diseases/acne/skin-care/moisturizer",
        "public/diseases/eczema/insider/moisturizer-reduce-flares",
        "public/diseases/eczema/types/atopic-dermatitis/self-care",
        "public/diseases/eczema/childhood/itch-relief/child-help-eczema",
        "public/diseases/eczema/childhood/itch-relief/home-remedies",
        "public/diseases/a-z/dry-skin-*",
        "public/diseases/a-z/ichthyosis-vulgaris-*",
        "public/diseases/a-z/keratosis-pilaris-self-care",
        "public/darker-skin/secrets/dry-skin/dry-skin-remedies-darker-skin",
    ], []),
    ("basics-sunscreen", [
        "public/everyday-care/sun-protection/*",
        "public/everyday-care/injured-skin/burns/treat-sunburn",
        "public/everyday-care/injured-skin/burns/uv-wands-injure-eyes-skin",
        "public/everyday-care/skin-care-secrets/routine/prevent-summer-skin-problems",
    ], []),
    ("basics-skin-types", [
        "public/everyday-care/skin-care-basics/dry",
        "public/everyday-care/skin-care-basics/dry/oily-skin",
        "public/diseases/a-z/dry-skin-*",
        "public/everyday-care/skin-care-secrets/face/treat-large-pores",
        "public/diseases/a-z/keratosis-pilaris-overview",
    ], []),
    # ---- 屏障与刺激 ----
    ("barrier-and-irritation", [
        "public/diseases/a-z/dry-skin-*",
        "public/diseases/a-z/ichthyosis-vulgaris-*",
        "public/diseases/a-z/keratosis-pilaris-*",
        "public/diseases/a-z/perioral-dermatitis",
        "public/everyday-care/skin-care-basics/dry/heal-dry-chapped-lips",
        "public/everyday-care/skin-care-basics/dry/dry-heels",
        "public/everyday-care/skin-care-basics/dry/coronavirus-handwashing",
        "public/everyday-care/skin-care-basics/care/winter-skin-survival-kit",
        "public/everyday-care/skin-care-secrets/routine/petroleum-jelly",
        "public/everyday-care/skin-care-secrets/face/facial-redness",
        "public/everyday-care/skin-care-secrets/face/face-mask-skin-care",
        "public/everyday-care/skin-care-secrets/face/prevent-face-mask-skin-problems",
        "public/everyday-care/itchy-skin/itch-relief/relieve-uncontrollably-itchy-skin",
        "public/everyday-care/injured-skin/burns/wound-care-minimize-scars",
    ], []),
    # ---- 日常流程 / 自我管理（自加主题，见 REPORT） ----
    ("daily-routine", [
        "public/everyday-care/skin-care-basics/care/apply-skin-care-certain-order",
        "public/everyday-care/skin-care-basics/care/skin-care-budget",
        "public/everyday-care/skin-care-basics/care/skin-care-for-men",
        "public/everyday-care/skin-care-basics/care/skin-care-in-your-*",
        "public/everyday-care/skin-care-basics/care/skin-care-tips-hands",
        "public/everyday-care/skin-care-secrets/routine/*",
        "public/everyday-care/skin-care-secrets/face/healthy-beard",
        "public/everyday-care/skin-care-secrets/face/diy-treatment-common-beard-problems",
        "public/everyday-care/skin-care-secrets/prevent-skin-problems/glp1-drugs-and-side-effects",
        "public/diseases/a-z/skin-overall-health",
        "public/diseases/a-z/stress-skin-conditions",
        "public/diseases/a-z/diabetes-skin-care",
    ], [
        # 这几条已由更专门的主题承接，避免 daily-routine 变成大杂烩
        "public/everyday-care/skin-care-secrets/routine/fade-dark-spots",
        "public/everyday-care/skin-care-secrets/routine/supplements-for-your-skin",
    ]),
    # ---- 痤疮 ----
    ("acne", [
        "public/diseases/acne/*",
        "public/diseases/a-z/folliculitis",
        "public/diseases/a-z/perioral-dermatitis",
        "public/diseases/a-z/acne-keloidalis-nuchae-*",
    ], [
        "public/diseases/acne/derm-treat/scars/*",
        "public/diseases/acne/derm-treat/scars",
    ]),
    ("acne-scars-and-marks", [
        "public/diseases/acne/derm-treat/scars",
        "public/diseases/acne/derm-treat/scars/*",
        "public/diseases/a-z/acne-keloidalis-nuchae-*",
    ], []),
    # ---- 色素 ----
    ("hyperpigmentation", [
        "public/diseases/a-z/melasma-*",
        "public/everyday-care/skin-care-secrets/routine/fade-dark-spots",
        "public/cosmetic/age-spots-marks*",
        "public/diseases/acne/diy/skin-color",
        "public/darker-skin/secrets",
        "public/darker-skin/diseases",
    ], []),
    # ---- 湿疹 / 皮炎 ----
    ("eczema-atopic", [
        "public/diseases/eczema/*",
    ], [
        "public/diseases/eczema/types/contact-dermatitis",
        "public/diseases/eczema/types/contact-dermatitis/*",
        "public/diseases/eczema/insider/nickel-allergy",
        "public/diseases/eczema/child-diseases-peanut-allergy",
        "public/diseases/eczema/childhood/treating/allergy-testing",
    ]),
    ("contact-dermatitis-allergy", [
        "public/diseases/eczema/types/contact-dermatitis",
        "public/diseases/eczema/types/contact-dermatitis/*",
        "public/diseases/eczema/insider/nickel-allergy",
        "public/diseases/eczema/child-diseases-peanut-allergy",
        "public/diseases/eczema/childhood/treating/allergy-testing",
        "public/everyday-care/itchy-skin/poison-ivy*",
        "public/everyday-care/itchy-skin/rash/itchy-rash-contact-dermatitis",
    ], []),
    ("seborrheic-dermatitis", [
        "public/diseases/a-z/seborrheic-dermatitis-*",
        "public/diseases/a-z/seborrheic-keratoses-*",
    ], [
        "public/diseases/a-z/seborrheic-keratoses-*",
    ]),
    ("rosacea", [
        "public/diseases/rosacea/*",
    ], []),
    # ---- 光老化 ----
    ("photoaging-and-prevention", [
        "public/everyday-care/sun-protection/sun-damage-skin*",
        "public/everyday-care/skin-care-secrets/anti-aging*",
        "public/everyday-care/skin-care-secrets/routine/prevent-summer-skin-problems",
        "public/everyday-care/skin-care-secrets/anti-aging/skin-care-during-menopause",
    ], []),
    # ---- 就医时机 ----
    ("when-to-see-dermatologist", [
        "public/everyday-care/itchy-skin/rash/rash-101",
        "public/diseases/acne/diy/when-derm",
        "public/diseases/acne/diy/treat-early",
        "public/diseases/eczema/childhood/treating/see-derm",
        "public/cosmetic/safety/ask-questions",
        "public/diseases/a-z/mole-skin-tag-removal",
        "public/diseases/rosacea/treatment/necessary",
        "public/diseases/a-z/scars-go-away",
    ], []),
    # ---- 产品安全 ----
    ("product-safety-and-labels", [
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/understand-sunscreen-labels",
        "public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products",
        "public/everyday-care/skin-care-secrets/prevent-skin-problems/replace-makeup-sunscreen",
        "public/everyday-care/skin-care-secrets/routine/supplements-for-your-skin",
        "public/everyday-care/skin-care-secrets/routine/whole-body-deodorant",
        "public/everyday-care/skin-care-secrets/anti-aging/selecting-anti-aging-products",
        "public/diseases/a-z/benzoyl-peroxide-faqs",
        "public/diseases/eczema/childhood/treating/products-promise",
        "public/diseases/eczema/childhood/treating/herbal-remedies",
        "public/diseases/eczema/childhood/treating/homeopathic-medicines",
        "public/diseases/eczema/childhood/treating/oils-probiotics-vitamins",
        "public/cosmetic/safety/*",
    ], []),
    # ---- 瘢痕（自加主题，见 REPORT） ----
    ("scars-and-keloids", [
        "public/diseases/a-z/scars-*",
        "public/diseases/a-z/keloids-*",
        "public/everyday-care/injured-skin/burns/wound-care-minimize-scars",
    ], []),
]

# 目录入口页（hub）与少量手工归属页：通配符 `prefix/*` 匹配不到裸 slug，
# 这里逐条补上，避免「在范围但没主题」的孤儿页。
EXTRA_TOPIC_INCLUDE = {
    "basics-cleansing": [],
    "basics-moisturizing": [],
    "basics-sunscreen": ["public/everyday-care/sun-protection"],
    "basics-skin-types": [
        "public/public-health/good-skin-knowledge/lesson-plans/intro-to-skin",
    ],
    "barrier-and-irritation": [
        "public/everyday-care/itchy-skin",
        "public/everyday-care/itchy-skin/itch-relief",
    ],
    "daily-routine": [
        "public/everyday-care/skin-care-basics",
        "public/everyday-care/skin-care-secrets",
        "public/everyday-care/skin-care-secrets/face",
        "public/everyday-care/skin-care-secrets/prevent-skin-problems",
        "public/everyday-care/skin-care-secrets/routine",
        "public/everyday-care/skin-care-secrets/prevent-skin-problems/travel-skin-care-tips",
        "public/public-health/good-skin-knowledge/lesson-plans/daily-skin-care",
        "public/public-health/good-skin-knowledge/lesson-plans/sun-safety",
        "public/public-health/good-skin-knowledge/lesson-plans/love-your-skin",
        "public/public-health/good-skin-knowledge/lesson-plans/truth-about-skin",
    ],
    "acne": [
        "public/diseases/acne",
        "public/public-health/good-skin-knowledge/lesson-plans/about-acne",
    ],
    "acne-scars-and-marks": [],
    "hyperpigmentation": [],
    "eczema-atopic": [
        "public/diseases/eczema",
        "public/public-health/good-skin-knowledge/lesson-plans/eczema",
    ],
    "contact-dermatitis-allergy": [],
    "seborrheic-dermatitis": [],
    "rosacea": ["public/diseases/rosacea"],
    "photoaging-and-prevention": [],
    "when-to-see-dermatologist": ["public/everyday-care/itchy-skin/rash"],
    "product-safety-and-labels": [],
    "scars-and-keloids": [],
}

for _tid, _slugs in EXTRA_TOPIC_INCLUDE.items():
    for _rule in TOPIC_RULES:
        if _rule[0] == _tid:
            _rule[1].extend(_slugs)

# 主题树元数据：中文名与摘要全部依据真实页面内容写成，
# 术语取自 /root/aad-library/GLOSSARY.md。
TOPIC_META = OrderedDict([
    ("basics-cleansing", {
        "title_zh": "基础清洁",
        "summary_zh": "洗脸、洗手、沐浴与化妆工具清洁的皮肤科建议，过度清洁是干痒的常见诱因。",
    }),
    ("basics-moisturizing", {
        "title_zh": "基础保湿",
        "summary_zh": "按肤质挑保湿霜，洗澡后三分钟内涂抹，缓解干燥、脱屑与皲裂。",
    }),
    ("basics-sunscreen", {
        "title_zh": "基础防晒",
        "summary_zh": "广谱防晒、SPF 与 PA 的选择、足量补涂；冬季和阴天同样需要防晒。",
    }),
    ("basics-skin-types", {
        "title_zh": "肤质与选品",
        "summary_zh": "干性、油性皮肤的护理差异，毛孔粗大与皮肤粗糙的居家改善方法。",
    }),
    ("barrier-and-irritation", {
        "title_zh": "皮肤屏障与刺激",
        "summary_zh": "干燥、泛红、口罩摩擦、过度去角质造成的屏障受损与刺痛怎么处理。",
    }),
    ("daily-routine", {
        "title_zh": "日常流程与阶段",
        "summary_zh": "护肤顺序、预算控制、各年龄阶段、孕期与旅行等日常自我管理。",
    }),
    ("acne", {
        "title_zh": "痤疮",
        "summary_zh": "痤疮的成因、分型与居家护理，含饮食、化妆品、运动与心理影响。",
    }),
    ("acne-scars-and-marks", {
        "title_zh": "痤疮瘢痕与痘印",
        "summary_zh": "痘坑、炎症后色素沉着与颈部瘢痕性痤疮的区别、预防与治疗时机。",
    }),
    ("hyperpigmentation", {
        "title_zh": "色素沉着",
        "summary_zh": "黄褐斑、晒斑与炎症后色沉的防晒、淡斑成分与治疗选择。",
    }),
    ("eczema-atopic", {
        "title_zh": "特应性皮炎与湿疹",
        "summary_zh": "特应性皮炎的诱因、保湿修复、外用药与儿童长期护理要点。",
    }),
    ("contact-dermatitis-allergy", {
        "title_zh": "接触性皮炎与过敏",
        "summary_zh": "刺激性/变应性接触性皮炎、斑贴试验，镍与毒藤等常见过敏原。",
    }),
    ("seborrheic-dermatitis", {
        "title_zh": "脂溢性皮炎",
        "summary_zh": "头皮与面部皮脂丰富部位的脱屑泛红，抗真菌洗剂与长期管理。",
    }),
    ("rosacea", {
        "title_zh": "玫瑰痤疮",
        "summary_zh": "玫瑰痤疮的分型、诱因日记、护肤要点与药物及光电治疗。",
    }),
    ("photoaging-and-prevention", {
        "title_zh": "光老化与预防",
        "summary_zh": "紫外线造成的光老化、皱纹与色斑，防晒与视黄醇的协同使用。",
    }),
    ("when-to-see-dermatologist", {
        "title_zh": "何时就诊皮肤科",
        "summary_zh": "皮疹、痤疮、色素问题何时该就医，就诊前准备与可问的问题。",
    }),
    ("product-safety-and-labels", {
        "title_zh": "产品安全与标签",
        "summary_zh": "看懂防晒与成分标签、新品试用步骤，补充剂和家用美容仪的风险。",
    }),
    ("scars-and-keloids", {
        "title_zh": "瘢痕与瘢痕疙瘩",
        "summary_zh": "外伤与术后瘢痕的护理，瘢痕疙瘩的成因、症状与治疗选择。",
    }),
])

# 每个主题 2-5 个核心页（人工挑选：内容最完整、最适合当知识底稿）
CORE_PAGES = OrderedDict([
    ("basics-cleansing", [
        "public/everyday-care/skin-care-basics/care/face-washing-101",
        "public/everyday-care/skin-care-basics/care",
        "public/everyday-care/skin-care-basics/dry/coronavirus-handwashing",
        "public/everyday-care/skin-care-secrets/routine/clean-your-makeup-brushes",
    ]),
    ("basics-moisturizing", [
        "public/everyday-care/skin-care-basics/dry/pick-moisturizer",
        "public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin",
        "public/diseases/a-z/dry-skin-treatment",
        "public/diseases/acne/skin-care/moisturizer",
        "public/diseases/eczema/insider/moisturizer-reduce-flares",
    ]),
    ("basics-sunscreen", [
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen",
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/understand-sunscreen-labels",
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-select-sunscreen",
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/common-sunscreen-mistakes",
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/what-to-wear-protect-skin-from-sun",
    ]),
    ("basics-skin-types", [
        "public/everyday-care/skin-care-basics/dry/oily-skin",
        "public/diseases/a-z/dry-skin-overview",
        "public/diseases/a-z/dry-skin-causes",
        "public/everyday-care/skin-care-secrets/face/treat-large-pores",
    ]),
    ("barrier-and-irritation", [
        "public/diseases/a-z/dry-skin-treatment",
        "public/everyday-care/skin-care-secrets/face/facial-redness",
        "public/everyday-care/skin-care-basics/care/winter-skin-survival-kit",
        "public/diseases/a-z/keratosis-pilaris-treatment",
        "public/everyday-care/skin-care-secrets/face/prevent-face-mask-skin-problems",
    ]),
    ("daily-routine", [
        "public/everyday-care/skin-care-basics/care/apply-skin-care-certain-order",
        "public/everyday-care/skin-care-secrets/routine/healthier-looking-skin",
        "public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care",
        "public/everyday-care/skin-care-basics/care/skin-care-in-your-20s",
        "public/everyday-care/skin-care-basics/care/skin-care-budget",
    ]),
    ("acne", [
        "public/diseases/acne/really-acne/overview",
        "public/diseases/acne/causes/acne-causes",
        "public/diseases/acne/skin-care/tips",
        "public/diseases/acne/derm-treat/treat",
        "public/diseases/acne/diy/types-breakouts",
    ]),
    ("acne-scars-and-marks", [
        "public/diseases/acne/derm-treat/scars",
        "public/diseases/acne/derm-treat/scars/treatment",
        "public/diseases/a-z/acne-keloidalis-nuchae-overview",
    ]),
    ("hyperpigmentation", [
        "public/diseases/a-z/melasma-overview",
        "public/diseases/a-z/melasma-treatment",
        "public/everyday-care/skin-care-secrets/routine/fade-dark-spots",
        "public/cosmetic/age-spots-marks/get-rid-spots",
    ]),
    ("eczema-atopic", [
        "public/diseases/eczema/types/atopic-dermatitis",
        "public/diseases/eczema/types/atopic-dermatitis/treatment",
        "public/diseases/eczema/types/atopic-dermatitis/self-care",
        "public/diseases/eczema/childhood/itch-relief/child-help-eczema",
        "public/diseases/eczema/insider/moisturizer-reduce-flares",
    ]),
    ("contact-dermatitis-allergy", [
        "public/diseases/eczema/types/contact-dermatitis",
        "public/diseases/eczema/types/contact-dermatitis/treatment",
        "public/diseases/eczema/types/contact-dermatitis/patch-testing-rash",
        "public/everyday-care/itchy-skin/rash/itchy-rash-contact-dermatitis",
        "public/everyday-care/itchy-skin/poison-ivy",
    ]),
    ("seborrheic-dermatitis", [
        "public/diseases/a-z/seborrheic-dermatitis-overview",
        "public/diseases/a-z/seborrheic-dermatitis-self-care",
        "public/diseases/a-z/seborrheic-dermatitis-treatment",
    ]),
    ("rosacea", [
        "public/diseases/rosacea/what-is/overview",
        "public/diseases/rosacea/triggers/tips",
        "public/diseases/rosacea/triggers/prevent",
        "public/diseases/rosacea/treatment/diagnosis-treat",
        "public/diseases/rosacea/what-is/symptoms",
    ]),
    ("photoaging-and-prevention", [
        "public/everyday-care/sun-protection/sun-damage-skin/wrinkles-sun-damage-can-be-treated",
        "public/everyday-care/skin-care-secrets/anti-aging/reduce-premature-aging-skin",
        "public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol",
        "public/everyday-care/sun-protection/sun-damage-skin/hidden-sun-damage",
        "public/everyday-care/skin-care-secrets/anti-aging/skin-care-during-menopause",
    ]),
    ("when-to-see-dermatologist", [
        "public/everyday-care/itchy-skin/rash/rash-101",
        "public/diseases/acne/diy/when-derm",
        "public/diseases/eczema/childhood/treating/see-derm",
        "public/cosmetic/safety/ask-questions",
    ]),
    ("product-safety-and-labels", [
        "public/everyday-care/sun-protection/shade-clothing-sunscreen/understand-sunscreen-labels",
        "public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products",
        "public/diseases/a-z/benzoyl-peroxide-faqs",
        "public/everyday-care/skin-care-secrets/anti-aging/selecting-anti-aging-products",
        "public/diseases/eczema/childhood/treating/products-promise",
    ]),
    ("scars-and-keloids", [
        "public/diseases/a-z/scars-overview",
        "public/diseases/a-z/scars-treatment",
        "public/diseases/a-z/keloids-overview",
        "public/diseases/a-z/keloids-treatment",
    ]),
])


def match_any(slug, patterns):
    for p in patterns:
        if fnmatch.fnmatch(slug, p) or fnmatch.fnmatch(slug, p.rstrip("/") + "/*"):
            return True
    return False


def topics_for(slug):
    hits = []
    for topic_id, inc, exc in TOPIC_RULES:
        if match_any(slug, inc) and not match_any(slug, exc):
            hits.append(topic_id)
    return hits


# ---------------------------------------------------------------- 产物写入


def section_of(slug):
    parts = slug.split("/")
    return "/".join(parts[:2])


def write_index(pages):
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(INDEX, "w", encoding="utf-8") as f:
        for p in pages:
            row = OrderedDict([
                ("id", p["id"]),
                ("slug", p["slug"]),
                ("url", p["url"]),
                ("title", p["title"]),
                ("section", section_of(p["slug"])),
                ("words", p["words"]),
                ("kind", p["kind"]),
                ("in_scope", bool(p["in_scope"])),
            ])
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return len(pages)


def build_topics(pages):
    by_slug = {p["slug"]: p for p in pages}
    topic_pages = {t: [] for t in TOPIC_META}
    for p in pages:
        if not p["in_scope"]:
            continue
        for t in p["topic_ids"]:
            if t in topic_pages:
                topic_pages[t].append(p)
    out = []
    for topic_id, meta in TOPIC_META.items():
        pages_here = sorted(topic_pages[topic_id], key=lambda x: (-x["words"], x["slug"]))
        page_ids = [q["id"] for q in pages_here]
        core = []
        for s in CORE_PAGES.get(topic_id, []):
            q = by_slug.get(s)
            if q is None:
                print("  !! CORE 页不存在: " + s, file=sys.stderr)
                continue
            if q["id"] not in page_ids:
                print("  !! CORE 页不属于该主题: %s -> %s" % (s, topic_id), file=sys.stderr)
                continue
            core.append(q["id"])
        out.append(OrderedDict([
            ("id", topic_id),
            ("title_zh", meta["title_zh"]),
            ("summary_zh", meta["summary_zh"]),
            ("page_ids", page_ids),
            ("core_page_ids", core),
            ("words_total", sum(q["words"] for q in pages_here)),
            ("page_count", len(pages_here)),
        ]))
    return out


def yaml_str(s):
    s = (s or "").replace('"', '\\"').replace("\n", " ")
    return '"' + s + '"'


def write_core(pages, topics, generated_at):
    by_id = {p["id"]: p for p in pages}
    for t in topics:
        for pid in t["core_page_ids"]:
            p = by_id[pid]
            body = p["body_md"].strip()
            text = (
                "---\n"
                "source_url: %s\n"
                "fetched_at: %s\n"
                "words: %d\n"
                "title: %s\n"
                "slug: %s\n"
                "topics: [%s]\n"
                "---\n\n"
                "# %s\n\n%s\n"
            ) % (
                p["url"],
                generated_at,
                p["words"],
                yaml_str(p["title"]),
                p["slug"],
                ", ".join(p["topic_ids"]),
                p["title"],
                body,
            )
            name = p["slug"].replace("/", "-") + ".md"
            with open(os.path.join(CORE_DIR, name), "w", encoding="utf-8") as f:
                f.write(text)


def main():
    generated_at, pages = load_pages()
    for p in pages:
        ok, reason = classify_scope(p["slug"])
        p["in_scope"] = ok
        p["reason"] = reason
    hubs = apply_hub_rule(pages)
    for p in pages:
        p["topic_ids"] = topics_for(p["slug"]) if p["in_scope"] else []

    check_only = "--check" in sys.argv

    # ---- 统计 ----
    in_scope = [p for p in pages if p["in_scope"]]
    unassigned = [p for p in in_scope if not p["topic_ids"]]
    topics = build_topics(pages) if not check_only else []
    topic_by_id = {t["id"]: t for t in topics}

    stats = OrderedDict()
    stats["corpus_generated_at"] = generated_at
    with open(CORPUS, "rb") as _f:
        _raw = _f.read()
    stats["corpus_sha256"] = hashlib.sha256(_raw).hexdigest()
    stats["corpus_bytes"] = len(_raw)
    stats["corpus_mtime"] = __import__("datetime").datetime.fromtimestamp(
        os.path.getmtime(CORPUS)).isoformat(timespec="seconds")
    stats["pages_total"] = len(pages)
    stats["in_scope_total"] = len(in_scope)
    stats["out_scope_total"] = len(pages) - len(in_scope)
    stats["in_scope_no_topic"] = [p["slug"] for p in unassigned]
    stats["in_scope_empty_body"] = [p["slug"] for p in in_scope if not p["body_md"].strip()]
    stats["hub_promoted"] = hubs
    stats["kind_counts"] = dict(Counter(p["kind"] for p in pages))
    stats["in_scope_by_section"] = dict(
        sorted(Counter(section_of(p["slug"]) for p in in_scope).items(), key=lambda kv: -kv[1])
    )
    stats["topic_sizes"] = [
        {
            "id": t["id"],
            "page_count": t["page_count"],
            "words_total": t["words_total"],
            "core_count": len(t["core_page_ids"]),
        }
        for t in topics
    ]
    core_slugs = sorted({pid for t in topics for pid in t["core_page_ids"]})
    stats["core_unique_pages"] = len(core_slugs)
    by_id = {p["id"]: p for p in pages}
    stats["core_unique_words"] = sum(by_id[i]["words"] for i in core_slugs)

    # 保湿/清洁/防晒内容藏在哪里（写 REPORT 用）
    def hides(kw, title_needs=("moistur",)):
        rows = []
        for p in in_scope:
            body = p["body_md"].lower()
            title = p["title"].lower()
            if kw in body and not any(k in title for k in title_needs):
                rows.append((p["slug"], p["words"]))
        return sorted(rows, key=lambda x: -x[1])

    stats["moisturizer_hidden_in"] = hides("moistur")
    stats["cleanser_hidden_in"] = hides("cleanser", ("cleans", "wash"))
    stats["barrier_hidden_in"] = hides("skin barrier", ("barrier",))
    stats["sensitive_skin_hidden_in"] = hides("sensitive skin", ("sensitive",))

    if check_only:
        print(json.dumps({k: stats[k] for k in ("pages_total", "in_scope_total", "out_scope_total")},
                         ensure_ascii=False, indent=2))
        print("in_scope 无主题:", stats["in_scope_no_topic"])
        print("hub 提升:", hubs)
        return

    os.makedirs(CORE_DIR, exist_ok=True)
    # 清掉上次生成的核心页，保证可重跑
    for fn in os.listdir(CORE_DIR):
        if fn.endswith(".md"):
            os.remove(os.path.join(CORE_DIR, fn))

    write_index(pages)
    with open(TOPICS, "w", encoding="utf-8") as f:
        json.dump(
            OrderedDict([
                ("source", "https://www.aad.org public education corpus"),
                ("corpus_generated_at", generated_at),
                ("topic_count", len(topics)),
                ("topics", topics),
            ]),
            f, ensure_ascii=False, indent=2,
        )
        f.write("\n")
    write_core(pages, topics, generated_at)
    with open(STATS, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # ---- 打印人看得懂的统计 ----
    print("语料生成时间:", generated_at)
    print("总页数: %d  在范围内: %d  范围外: %d" % (len(pages), len(in_scope), len(pages) - len(in_scope)))
    print("在范围内但没归主题:", len(unassigned), [p["slug"] for p in unassigned][:10])
    print("\n在范围内页面分布（section）:")
    for k, v in stats["in_scope_by_section"].items():
        print("  %-46s %3d" % (k, v))
    print("\n主题规模（页数 / 词数 / 核心页）:")
    for t in topics:
        print("  %-28s %3d 页  %6d 词  core=%d" % (t["id"], t["page_count"], t["words_total"], len(t["core_page_ids"])))
    print("\ncore 去重页数: %d（合计 %d 词）" % (stats["core_unique_pages"], stats["core_unique_words"]))
    print("core 文件数:", len(os.listdir(CORE_DIR)))
    print("\n埋在正文里的保湿内容（题名不含 moisturizer，取前 15）:")
    for s, w in stats["moisturizer_hidden_in"][:15]:
        print("  %5d  %s" % (w, s))


if __name__ == "__main__":
    main()
