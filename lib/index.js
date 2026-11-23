/**
 * dsh-skincare —— DSH 插件包入口。
 *
 * 这个包的两层交付，按重要性排：
 *   1. 技能随包分发（主）：包内 skill/ 通过 ctx.skills.registerProvider 挂成一个
 *      随包技能提供者，装好插件就有 dsh-skincare 技能，不用手动 cp 到 ~/.dsh/skills。
 *   2. dsh-go 原生面板（次）：在 dsh-go 手机 App 里多一个护肤面板，见 lib/panel.js。
 *      Harness 网页版 / 桌面版没有 dshGo 服务，那一层内部 inject 不触发，等于不存在。
 *
 * 约定：apply 里任何失败都只记日志，绝不抛出 —— 插件装坏不该拖垮宿主启动。
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerPanel } from './panel.js'
import { createSkillProvider } from './skill.js'

/** Cordis 插件名（只要求插件内唯一，与 npm 包名无关）。 */
export const name = 'dsh-skincare'

/** 依赖 Harness 的技能服务；没有它的宿主里这个插件不加载。 */
export const inject = ['skills']

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export function apply(ctx) {
  const dir = join(PACKAGE_ROOT, 'skill')
  if (existsSync(join(dir, 'SKILL.md'))) {
    try {
      ctx.skills.registerProvider(() => createSkillProvider({ dir }))
    } catch (error) {
      ctx?.logger?.warn?.(`技能提供者注册失败：${error?.message ?? error}`)
    }
  } else {
    ctx?.logger?.warn?.(`包内缺少 skill/SKILL.md（${dir}），技能不会出现`)
  }

  try {
    registerPanel(ctx)
  } catch (error) {
    ctx?.logger?.warn?.(`dsh-go 面板注册失败：${error?.message ?? error}`)
  }
}
