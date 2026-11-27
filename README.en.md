English | [中文](<README.md>)

# DSH Skin Care

An **agent-native skin-care domain package for DeepSeek Harness (DSH)**. It equips the existing host agent with Chinese knowledge modules, AAD source metadata, evidence-checking methods and medical safety boundaries—not a new persona or a separate assistant.

The plugin provides the `dsh-skincare` skill without manually copying a skill directory. An optional dsh-go native panel offers lightweight knowledge navigation and conversation entry points; the skill works without it.

## What it helps with

Start from the user's question: explain cleansing, moisturizing, sunscreen and skin-health concepts; examine claims and sources; discuss a routine, learning topics or visit preparation. Clarify, read or search when useful, rather than routing every request through fixed modes.

No mandatory assessment, profile, check-in or course completion. No requirement to reduce steps, cite every sentence or keep a fixed word count. Facts must be checkable, and evidence, inference and uncertainty must remain distinct. Method references do not switch the agent's identity.

## Install: DSH-first

Use a DSH and Node.js host meeting the requirements in the [package manifest](<package.json>). The npm package name is `@brody715/dsh-skincare`:

```sh
dsh plugin --profile web add @brody715/dsh-skincare
```

The CLI command adds a dependency; it alone is not proof of bundle registration. Prefer asking the host to call `plugin_manager` with `install_bundle` and that package name as `target` to install and register the bundle. To test a local working copy, clone the repository and use its absolute directory as `target`:

```sh
git clone https://github.com/brody715/dsh-skincare.git
```

The host reads `dsh.bundle.patch` from the [manifest](<package.json>) and loads the [install patch](<cordis.patch.yml>). Do not hand-edit host profile dependencies or patches, or run `pnpm add` inside `$DSH_HOME`. Uninstall through the host's `remove_bundle`.

Check the session skill catalog for `dsh-skincare`, opening a new session if needed. An older manually installed skill may shadow the bundled copy: inspect it before deciding to remove it, and do not assume their contents match.

**Repository changes are not proof of publication or deployment.** npm installs the published release. To verify this working copy, install its local directory through the host and inspect what actually loads. This document does not claim installation, an update or panel verification has completed on the current host.

## Knowledge and evidence

- **13 Chinese modules** cover foundations, cleansing, moisturizing, sun protection, skin types, irritation, acne, marks and pigmentation, inflammatory conditions, labels, medical care, learning topics and photoaging. See the [skill entry](<skill/SKILL.md>).
- **Linked knowledge navigation**: the [concept map](<skill/knowledge-map.md>) and named module relationships explain where and why to continue reading. Search provides an entry point; the agent follows mechanisms, conditions, exceptions and evidence rather than retrieving a complete answer in one query.
- The [source index](<skill/sources/index.jsonl>) and [topic index](<skill/sources/topics.json>) contain metadata, including links and titles—not AAD article bodies or machine translations.
- Prefer the host's existing web-reading or search tools to check originals. If unavailable, disclose that limitation instead of presenting local notes as freshly verified source text.

From the repository root:

```sh
node skill/scripts/lookup.mjs "sunscreen stick"
node skill/scripts/lookup.mjs --url <slug-or-fragment>
node skill/scripts/lookup.mjs --check <slug-or-fragment>
node skill/scripts/lookup.mjs --read <slug-or-fragment>
node skill/scripts/lookup.mjs --audit
```

Use `--references --json --limit 5` for bounded paragraph search with section and line ranges. `--read` returns metadata and the original URL only; it does not read cached bodies or access the network. Use host web tools to check originals. Related claims may share a citation when its scope is clear; never invent slugs or confuse an index match with reading a source.

## Continuity without another profile system

Reuse the Harness host's existing memory policies and tools without requiring a particular memory service. Do not write every turn or infer mastery because the assistant explained something. Without host memory, use the conversation, or provide a summary when requested; do not create replacement storage.

Only when the user explicitly requests their old profile, use the read-only compatibility command:

```sh
node skill/scripts/legacy-profile.mjs show --confirm-user-request --json
```

It reads the old `~/.dsh/skin-care/profile.json`; it does not automatically read, write, create or migrate it. Historical records are not current diagnoses or evidence of mastery. The optional Go panel does not use that profile or maintain check-ins, levels or course-completion state. See the [panel reference](<docs/panel.md>).

## Medical and copyright boundaries

Education and risk support—**not diagnosis or prescribing**. No lesion diagnosis, disease scoring, cosmetic-procedure decisions, brand rankings, price comparisons or sales recommendations. Urgent warning signs take priority over skin-care experimentation; see the [medical-care reference](<skill/references/10-何时就医.md>).

Knowledge primarily draws on [AAD public education](https://www.aad.org/public). AAD owns its content. The package distributes neither original articles nor machine translations and implies no AAD authorization or endorsement. The Chinese modules are independently organized notes, not article translations. See [third-party notices](<THIRD_PARTY_NOTICES.md>) and [attribution and text terms](<ATTRIBUTION.md>).

## Development and design

The published runtime is JavaScript/Node.js. Maintainer corpus tooling and historical evaluation scripts may still use Python; this is not a claim that the entire repository is Python-free. Optional methods cover [clarification](<skill/agents/assessor.md>), [learning support](<skill/agents/coach.md>), [routine discussion](<skill/agents/routine-review.md>) and [visit preparation](<skill/agents/visit-prep.md>); none is a separate agent.

```sh
node --test tests/*.mjs
node skill/scripts/lookup.mjs --audit
```

See the [design document](<docs/design.md>) for architecture. Knowledge review, retrieval regressions and clean-context agent trials are recorded in the [reliability review](<eval/reliability-review.md>) (repository-only). The [behavioral cases](<eval/agent-native.md>) guide continued regression testing; cross-model comparisons and real learner outcomes remain untested.

Code: [MIT](<LICENSE>). Text terms: [ATTRIBUTION](<ATTRIBUTION.md>).
