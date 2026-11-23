English | [中文](README.md)

# DSH Skin Care

A **DeepSeek Harness (DSH) plugin package** that turns the American Academy of Dermatology's (AAD) public
skin-care guidance into a skill you can *look up in, learn from, be assessed by, and track with* — shipped
with the plugin.

Install the plugin and the `dsh-skincare` skill is simply there; nothing to copy into `~/.dsh/skills`.
The same package also carries an optional native panel for the dsh-go phone app — that part is secondary,
and its absence changes nothing.

```
package root
├─ lib/            plugin entry (Cordis plugin: registers the skill provider, plus the optional panel)
├─ skill/          the skill: SKILL.md, 13 knowledge modules, expert roles, source index, scripts
├─ cordis.patch.yml  install patch
├─ icon.svg
├─ docs/           design notes, panel reference, research
├─ scripts/        maintenance scripts (corpus mining; local only, not shipped)
└─ THIRD_PARTY_NOTICES.md  third-party content boundary (what is not shipped, and why)
```

## What it is for

Skin care does not lack information; it lacks **judgement**. Marketing blends "basic maintenance / problem
solving / medical boundary" into one blur, and the most profitable words are always "repair" and "fade".

This project does exactly four things:

1. **Look up** — every factual claim carries an AAD citation you can open.
2. **Learn** — a staged L0→L3 path, 3–5 minutes per lesson, with self-checks.
3. **Assess** — your current knowledge stage, routine complexity, and whether a complaint is self-care or
   a doctor visit.
4. **Track** — goals broken into checkable behaviours, reviewed weekly.

A good outcome might be **buying two fewer products** — or **booking a dermatologist**.

## Install

Requires a DSH host (the `dsh` command). The package is on npm: `@brody715/dsh-skincare`.

```sh
dsh plugin --profile web add @brody715/dsh-skincare
```

Without the CLI, have the host call `plugin_manager` with `install_bundle` and `target` set to the
package name `@brody715/dsh-skincare`; to install a local working copy instead, clone
`https://github.com/brody715/dsh-skincare.git` and point `target` at that directory. Installation reads
`dsh.bundle.patch` from `package.json` and merges the `insert` entries of `cordis.patch.yml` into the
profile; the plugin name is `@brody715/dsh-skincare`.

**Do not hand-edit the profile's `package.json` / `cordis.patch.yml`, and do not `pnpm add` inside
`$DSH_HOME`** — the host owns those. Uninstall with the same tool's `remove_bundle`.

Verify the skill arrived: open a new session and ask a skin-care question, or check the session's skill
catalog for `dsh-skincare`.

> If you previously installed the skill by hand at `~/.dsh/skills/dsh-skincare`, that copy still wins
> (user layer 400 ranks ahead of bundled 600). No conflict — it is the same content. Delete that directory
> if you want only the packaged copy.

The dsh-go native panel is documented in [docs/panel.md](docs/panel.md) (same package, nothing extra to install).

## Boundaries

- Science education and triage support — **not a diagnosis, not a prescription**.
- No product reviews, no price comparison, no affiliate links.
- Red-flag symptoms (`skill/references/10-何时就医.md`) lead straight to "see a doctor", with no
  self-treatment plan.
- Any skin condition should ultimately be seen by a licensed dermatologist.

## Where the knowledge comes from

Three layers, with a clear boundary:

| Layer | Where | Shipped | Purpose |
| --- | --- | --- | --- |
| Chinese knowledge modules | `skill/references/*.md` | yes | the answer body: mechanisms, numbers, triage rules, common mistakes |
| Source index (metadata only) | `skill/sources/index.jsonl` | yes | one line per page: `slug / url / title / section`, used to validate citations and fetch URLs |
| AAD page copies and translations | generated locally | **no** | for verification. Third-party content, not redistributable |

The index holds links and titles — no body text, no translation. Modules are checked against the original
pages by URL when needed (English original is fine):

```sh
python3 skill/scripts/lookup.py --url acne          # get the original URL for a page
python3 skill/scripts/lookup.py "sunscreen stick"   # search the index for a slug
```

If you generated page copies locally (`skill/sources/core/`) or machine translations (`corpus/`),
`--read <slug>` prints the body directly; when neither exists it prints the title and original URL so you
can read it yourself. Rationale: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Sources and copyright

Knowledge is based on AAD public pages (`aad.org/public/...`); citations carry the slug and original URL.
**AAD content is copyright AAD**: this project does not copy, translate or redistribute its body text —
it references links and facts, and is neither licensed nor endorsed by AAD.

The Chinese modules are written by this project, not translated from AAD: mechanisms and numbers are
sourced, while wording, structure and triage rules are rewritten here. Boundary details (what is not
shipped, and why): [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); full provenance and use terms:
[ATTRIBUTION.md](ATTRIBUTION.md).

## Development

Zero build, zero dependencies: `lib/` is plain ESM and takes effect directly in the host (manifest edits
reload automatically, code edits need an engine restart).

```sh
node --test tests/smoke.mjs               # plugin entry + skill provider smoke tests
python3 skill/scripts/lookup.py --audit   # validate every [s:slug] citation in the knowledge modules
python3 eval/run.py                       # evaluation cases
```

Design notes: [docs/design.md](docs/design.md). Acceptance evidence: [eval/rubric.md](eval/rubric.md).
"With skill vs plain chat" comparison: [eval/ab-v0.1.md](eval/ab-v0.1.md).

## License

Code is MIT ([LICENSE](LICENSE)). Text content terms are in [ATTRIBUTION.md](ATTRIBUTION.md).
