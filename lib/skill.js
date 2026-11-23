/**
 * 把包内的 skill/ 作为一个「随包分发的技能提供者」注册给 Harness。
 *
 * 做法照抄 Harness 自带的能力包（如 @deepseek-ai/dsh-skill-badge）：
 * 实现 SkillProvider（list + get），由 ctx.skills.registerProvider 挂上。
 * 好处是不往 $DSH_HOME/skills 写东西，插件删掉技能也跟着消失。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const SKILL_FILE = 'SKILL.md'

/**
 * 随包技能的优先级，与 @deepseek-ai/dsh-skill 的 BUNDLED_SKILL_RANK 同值。
 * 不直接 import 那个包：它只存在于宿主环境里，插件按路径解析不到，硬引会加载失败。
 * 数值越小越优先；用户自己放在 ~/.dsh/skills 的同名技能是 400，会盖过这一层。
 */
const BUNDLED_RANK = 600

/** 只认 frontmatter 里这三个单行标量，够用且不需要引 YAML 解析器。 */
const FIELDS = new Set(['name', 'description', 'whenToUse'])

function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end < 0) return {}
  const out = {}
  for (const line of text.slice(3, end).split('\n')) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    if (!FIELDS.has(key)) continue
    let value = line.slice(at + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) out[key] = value
  }
  return out
}

/**
 * @param {{ name?: string, dir: string }} options skill 目录（含 SKILL.md）
 * @returns SkillProvider
 */
export function createSkillProvider({ name = 'dsh-skincare', dir }) {
  const bodyUrl = join(dir, SKILL_FILE)
  const resourceBase = { kind: 'directory', path: dir }
  let meta

  async function readMeta() {
    if (meta) return meta
    const raw = await readFile(bodyUrl, 'utf8')
    const parsed = parseFrontmatter(raw)
    meta = {
      name: parsed.name ?? name,
      description: parsed.description ?? '护肤知识库与分诊助手',
      ...(parsed.whenToUse ? { whenToUse: parsed.whenToUse } : {}),
      raw,
    }
    return meta
  }

  return {
    name,

    async list() {
      const { raw, ...fields } = await readMeta()
      return [
        {
          ...fields,
          invocation: { modelInvocable: true, userInvocable: true },
          provider: name,
          source: 'bundled',
          rank: BUNDLED_RANK,
          resourceBase,
          locator: bodyUrl,
        },
      ]
    },

    async get() {
      const { raw, ...fields } = await readMeta()
      return {
        ...fields,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: name,
        source: 'bundled',
        resourceBase,
        content: raw,
      }
    },
  }
}
