import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const PANEL = 'skin-care-panel'
const QUICK = 'skin-care-ask'
const CHECK_IN = 'skin-care-done'
const LEVELS = ['L0', 'L1', 'L2', 'L3']
const MAX_PROFILE_BYTES = 256 * 1024
const MAX_VIEW_BYTES = 8000

/** 常见步骤键的中文名：档案里存的是 cleanse/moisturize/protect 这类键，面板要给中文。 */
const STEP_NAME = {
  cleanse: { zh: '洁面', en: 'Wash' },
  clean: { zh: '洁面', en: 'Wash' },
  cleansing: { zh: '洁面', en: 'Wash' },
  moisturize: { zh: '保湿', en: 'Moisturize' },
  moisturise: { zh: '保湿', en: 'Moisturize' },
  moisturizer: { zh: '保湿', en: 'Moisturize' },
  protect: { zh: '防晒', en: 'Sunscreen' },
  sunscreen: { zh: '防晒', en: 'Sunscreen' },
  treat: { zh: '功效', en: 'Treat' },
}

function stepLabel(step, loc) {
  const raw = String(step ?? '')
  const hit = STEP_NAME[raw.toLowerCase()]
  return hit ? hit[loc] ?? hit.zh : raw
}

const LEVEL_NAME = {
  L0: { zh: '入门', en: 'basics' },
  L1: { zh: '基础', en: 'foundation' },
  L2: { zh: '进阶', en: 'advanced' },
  L3: { zh: '熟练', en: 'fluent' },
}

const COMPLEXITY_NAME = {
  minimal: { zh: '极简', en: 'minimal' },
  clean: { zh: '温和基础', en: 'clean' },
  stacked: { zh: '多步叠加', en: 'stacked' },
  overloaded: { zh: '过载', en: 'overloaded' },
}

const LEARNING_NAME = {
  todo: { zh: '未开始', en: 'not started' },
  in_progress: { zh: '学习中', en: 'learning' },
  done: { zh: '已完成', en: 'done' },
}

const TRIAGE_NAME = {
  'self-care': { zh: '自行护理', en: 'self care', tone: 'good' },
  'see-doctor': { zh: '建议就诊', en: 'see a doctor', tone: 'warn' },
  urgent: { zh: '尽快就诊', en: 'see a doctor soon', tone: 'bad' },
}

/** 面板、提示语与退化命令文案。 */
function text(locale) {
  const en = String(locale ?? '').toLowerCase().startsWith('en')
  const loc = en ? 'en' : 'zh'
  return {
    en,
    loc,
    noProfile: en
      ? 'No profile yet. Say “帮我看看我的护肤流程” to start.'
      : '还没建档，跟我说一句「帮我看看我的护肤流程」',
    noProfileHint: en
      ? 'Once built, this panel shows your stage, routine, check-ins and goals.'
      : '建好之后，这里显示你的阶段、流程、打卡和目标',
    stage: en ? 'Stage' : '认知阶段',
    complexity: en ? 'Complexity' : '护理复杂度',
    triage: en ? 'Triage' : '分诊',
    concerns: en ? 'Concerns' : '近期主诉',
    routine: en ? 'Routine' : '今日流程',
    goals: en ? 'Goals' : '目标',
    goalActive: en ? 'active' : '进行中',
    learning: en ? 'Lessons · tap one when done' : '学习进度 · 点一行标记已完成',
    checkIn: en ? 'Check in today' : '今日打卡',
    checkInDone: en ? 'Checked in today' : '今天已经打过卡了',
    noSteps: en ? 'Your routine has no steps yet' : '流程里还没有步骤',
    noProfileToast: en ? 'Build your profile first' : '先建档再打卡',
    unknown: en ? 'not recorded' : '未记录',
    noRoutine: en ? 'Routine: not recorded' : '流程：（未记录）',
    saved: en ? 'Logged today’s steps' : '已记下今天的打卡',
    learned: en ? 'Lesson marked done' : '这一课标记为已完成',
    failed: en ? 'Could not write the profile file' : '档案写入失败，检查一下文件权限',
    tooBig: en ? 'Profile is too large to show' : '档案太大，先整理一下再看',
    noProfilePrompt: en
      ? 'Help me sort out my skin-care routine — I have no profile yet, ask me a few questions first.'
      : '帮我看看我的护肤流程：我还不知道自己的情况，先问我几个问题。',
  }
}

// ---------------------------------------------------------------- 路径

/** $DSH_HOME，缺省退回 ~/.dsh。 */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 与 profile.py 保持一致：环境变量优先，其次 ~/.dsh/skin-care/profile.json。 */
function profilePaths() {
  const list = []
  if (process.env.DSH_SKIN_PROFILE) list.push(process.env.DSH_SKIN_PROFILE)
  list.push(join(dshHome(), 'skin-care', 'profile.json'))
  const fallback = join(homedir(), '.dsh', 'skin-care', 'profile.json')
  if (!list.includes(fallback)) list.push(fallback)
  return list
}

/** 写入用的档案路径：环境变量优先，其次 $DSH_HOME/skin-care/profile.json。 */
function profileWritePath() {
  if (process.env.DSH_SKIN_PROFILE) return process.env.DSH_SKIN_PROFILE
  return join(dshHome(), 'skin-care', 'profile.json')
}

// ---------------------------------------------------------------- 档案读取

function loadProfile() {
  for (const path of profilePaths()) {
    let raw
    try {
      if (!existsSync(path)) continue
      raw = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    if (raw.length > MAX_PROFILE_BYTES) return { empty: false, tooBig: true }
    try {
      const data = JSON.parse(raw)
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null
      return data
    } catch {
      return null
    }
  }
  return null
}

const asArray = (value) => (Array.isArray(value) ? value : [])
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const asText = (value) => (typeof value === 'string' ? value.trim() : '')

function dayNumber(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000
}

function todayNumber() {
  const now = new Date()
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000
}

/** 把 profile.json 收成面板要用的几项，顺手截断，别把整份档案塞进视图。 */
function summarize(profile) {
  const stage = asObject(profile.stage)
  const routine = asArray(profile.routine)
    .map((item) => ({
      step: asText(item?.step),
      type: asText(item?.product_type),
      freq: asText(item?.freq),
    }))
    .filter((item) => item.step !== '')
    .slice(0, 12)

  const concerns = asArray(profile.concerns)
    .map(asText)
    .filter((item) => item !== '')
    .slice(0, 5)

  const goals = asArray(profile.goals)
    .map((goal) => ({ id: asText(goal?.id), text: asText(goal?.text), status: asText(goal?.status) }))
    .filter((goal) => goal.text !== '' && goal.status === 'active')
    .slice(0, 3)

  const learning = asObject(profile.learning)
  const log = asArray(profile.log)
    .map((entry) => ({ date: asText(entry?.date), done: asArray(entry?.done).map(asText).filter(Boolean) }))
    .filter((entry) => dayNumber(entry.date) !== null)

  const today = todayNumber()
  const todayEntry = log.find((entry) => dayNumber(entry.date) === today)
  const recent = new Set(log.filter((entry) => {
    const day = dayNumber(entry.date)
    return day !== null && day <= today && day > today - 7
  }).map((entry) => entry.date))

  return {
    knowledge: LEVELS.includes(asText(stage.knowledge)) ? asText(stage.knowledge) : '',
    complexity: asText(stage.care_complexity),
    triage: asText(stage.triage),
    routine,
    concerns,
    goals,
    learning,
    doneToday: todayEntry ? todayEntry.done : [],
    recentDays: recent.size,
  }
}

// ---------------------------------------------------------------- 视图

function stageRow(labels, summary) {
  return {
    type: 'keyValue',
    items: [
      {
        label: labels.stage,
        value: summary.knowledge
          ? `${summary.knowledge} · ${LEVEL_NAME[summary.knowledge][labels.loc]}`
          : labels.unknown,
      },
      {
        label: labels.complexity,
        value: COMPLEXITY_NAME[summary.complexity]?.[labels.loc] ?? (summary.complexity || labels.unknown),
      },
      {
        label: labels.triage,
        value: TRIAGE_NAME[summary.triage]?.[labels.loc] ?? (summary.triage || labels.unknown),
        tone: TRIAGE_NAME[summary.triage]?.tone,
      },
    ],
  }
}

function routineBlock(labels, summary) {
  if (summary.routine.length === 0) {
    return { type: 'text', tone: 'muted', text: labels.noRoutine }
  }
  const done = new Set(summary.doneToday)
  return {
    type: 'steps',
    items: summary.routine.slice(0, 8).map((item) => {
      const detail = [item.type, item.freq].filter(Boolean).join(' · ')
      const node = { label: stepLabel(item.step, labels.loc), status: done.has(item.step) ? 'done' : 'todo' }
      if (detail) node.detail = detail.slice(0, 24)
      return node
    }),
  }
}

function learningBlock(labels, summary) {
  return {
    type: 'list',
    items: LEVELS.map((level) => {
      const state = asText(summary.learning[level])
      const done = state === 'done'
      const row = {
        title: `${level} · ${LEVEL_NAME[level][labels.loc]}`,
        trailing: LEARNING_NAME[state]?.[labels.loc] ?? LEARNING_NAME.todo[labels.loc],
        tone: done ? 'good' : state === 'in_progress' ? 'info' : 'muted',
        icon: done ? 'done' : 'book',
      }
      if (!done) row.action = `learn-${level}`
      return row
    }),
  }
}

function goalBlock(labels, summary) {
  if (summary.goals.length === 0) return null
  return {
    type: 'list',
    items: summary.goals.map((goal) => ({ title: goal.text.slice(0, 40), trailing: labels.goalActive, icon: 'flag' })),
  }
}

function buildView(scope, caps) {
  const labels = text(caps?.locale ?? scope?.locale)
  const profile = loadProfile()

  if (!profile) {
    return {
      type: 'stack',
      children: [
        { type: 'callout', tone: 'info', text: labels.noProfile },
        { type: 'text', tone: 'muted', text: labels.noProfileHint },
      ],
    }
  }
  if (profile.tooBig) {
    return {
      type: 'stack',
      children: [
        { type: 'callout', tone: 'warn', text: labels.tooBig },
        { type: 'text', tone: 'muted', text: labels.noProfileHint },
      ],
    }
  }

  const summary = summarize(profile)
  const children = [stageRow(labels, summary)]

  if (summary.concerns.length > 0) {
    children.push({ type: 'text', tone: 'muted', text: `${labels.concerns}：${summary.concerns.join('、')}` })
  }

  children.push(routineBlock(labels, summary))
  children.push({
    type: 'progress',
    label: labels.en ? 'Check-ins · last 7 days' : '打卡 · 近 7 天',
    value: summary.recentDays,
    max: 7,
    caption: `${summary.recentDays} / 7`,
  })

  const goals = goalBlock(labels, summary)
  if (goals) children.push(goals)

  children.push({ type: 'text', tone: 'muted', text: labels.learning })
  children.push(learningBlock(labels, summary))
  children.push({
    type: 'actions',
    items: [{ label: labels.checkIn, action: CHECK_IN, icon: 'check', style: 'primary' }],
  })

  const view = { type: 'stack', children }
  // 万一档案太长，退回只讲状态的两行，面板不能因此空白或报错。
  if (JSON.stringify(view).length > MAX_VIEW_BYTES) {
    return {
      type: 'stack',
      children: [
        stageRow(labels, summary),
        {
          type: 'progress',
          label: labels.en ? 'Check-ins · last 7 days' : '打卡 · 近 7 天',
          value: summary.recentDays,
          max: 7,
        },
        { type: 'actions', items: [{ label: labels.checkIn, action: CHECK_IN, icon: 'check', style: 'primary' }] },
      ],
    }
  }
  return view
}

// ---------------------------------------------------------------- 写档案（纯文件写入，不起子进程）

const LEARNING_STATES = ['todo', 'in_progress', 'done']
const LOG_KEEP = 180

/** 与 profile.py 一致的时间戳：2026-11-23T01:55:06Z（UTC，秒级）。 */
function stamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

/** 本地日期（用户感知的「今天」）。 */
function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function emptyProfile() {
  const learning = {}
  for (const level of LEVELS) learning[level] = 'todo'
  return {
    version: 1,
    updated_at: stamp(),
    stage: { knowledge: 'L0', care_complexity: 'minimal', triage: 'self-care' },
    concerns: [],
    routine: [],
    goals: [],
    log: [],
    learning,
  }
}

/** 原子写：先写同目录临时文件再 rename，避免写一半留下坏档案。 */
function saveProfile(data) {
  data.updated_at = stamp()
  const target = profileWritePath()
  const dir = dirname(target)
  try {
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `.profile.${process.pid}.tmp`)
    try {
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      renameSync(tmp, target)
    } catch {
      try {
        unlinkSync(tmp)
      } catch {}
      return false
    }
    return true
  } catch {
    return false
  }
}

/** 读-改-写。档案不存在时按 profile.py init 的默认结构新建。 */
function updateProfile(mutate) {
  const current = loadProfile()
  if (current && current.tooBig) return false
  const data = current ?? emptyProfile()
  try {
    if (mutate(data) === false) return false
  } catch {
    return false
  }
  return saveProfile(data)
}

function logDone(steps) {
  const day = localDate()
  const incoming = steps.map((step) => String(step).trim()).filter(Boolean)
  if (incoming.length === 0) return false
  return updateProfile((data) => {
    if (!Array.isArray(data.log)) data.log = []
    let entry = data.log.find((item) => item && item.date === day)
    if (!entry) {
      entry = { date: day, done: [] }
      data.log.push(entry)
    }
    if (!Array.isArray(entry.done)) entry.done = []
    for (const step of incoming) {
      if (!entry.done.includes(step)) entry.done.push(step)
    }
    data.log.sort((a, b) => String(a?.date ?? '').localeCompare(String(b?.date ?? '')))
    data.log = data.log.slice(-LOG_KEEP)
  })
}

function setLearning(level, state) {
  if (!LEVELS.includes(level) || !LEARNING_STATES.includes(state)) return false
  return updateProfile((data) => {
    if (!data.learning || typeof data.learning !== 'object' || Array.isArray(data.learning)) {
      data.learning = {}
    }
    data.learning[level] = state
  })
}

async function handleCheckIn(scope, event) {
  const labels = text(event?.locale)
  const profile = loadProfile()
  if (!profile || profile.tooBig) return { toast: labels.noProfileToast }

  const summary = summarize(profile)
  if (summary.routine.length === 0) return { toast: labels.noSteps }

  const done = new Set(summary.doneToday)
  const steps = summary.routine.map((item) => item.step).filter((step) => !done.has(step))
  if (steps.length === 0) return { toast: labels.checkInDone }

  return logDone(steps) ? { toast: labels.saved, refresh: true } : { toast: labels.failed }
}

function learnHandler(level) {
  return (scope, event) => handleLearn(level, scope, event)
}

async function handleLearn(level, scope, event) {
  const labels = text(event?.locale)
  return setLearning(level, 'done') ? { toast: labels.learned, refresh: true } : { toast: labels.failed }
}

// ---------------------------------------------------------------- 「今天怎么护肤」：只填输入框，不自动发

function quickPrompt(scope, event) {
  const labels = text(event?.locale)
  const profile = loadProfile()
  if (!profile || profile.tooBig) return { insert: labels.noProfilePrompt }

  const summary = summarize(profile)
  const bracket = (body) => (labels.en ? ` (${body})` : `（${body}）`)
  const joinList = (items) => items.join(labels.en ? ', ' : '、')
  const knowledge = summary.knowledge
    ? `${summary.knowledge}${bracket(LEVEL_NAME[summary.knowledge][labels.loc])}`
    : labels.unknown
  const complexity = COMPLEXITY_NAME[summary.complexity]?.[labels.loc] ?? labels.unknown
  const concerns = summary.concerns.length > 0
    ? joinList(summary.concerns)
    : (labels.en ? 'none recorded' : '暂无主诉')
  const routine = summary.routine.length > 0
    ? `${summary.routine.length}${labels.en ? ' steps' : ' 步'}${bracket(joinList(summary.routine.slice(0, 4).map((item) => stepLabel(item.step, labels.loc))))}`
    : (labels.en ? 'not recorded' : '还没记录')

  const prompt = labels.en
    ? `Use the skin-care knowledge base to plan today's routine. My stage is ${knowledge}, complexity ${complexity}, concerns: ${concerns}, routine: ${routine}. What should I do today?`
    : `用护肤知识库帮我看看今天怎么护肤。我目前认知阶段 ${knowledge}，护理复杂度 ${complexity}，主诉 ${concerns}，流程 ${routine}。今天该怎么安排？`
  return { insert: prompt }
}

// ---------------------------------------------------------------- 注册

/**
 * 只在 dsh-go（手机原生界面）里注册面板；Harness 网页版 / 桌面版没有 dshGo 服务，
 * 这个 inject 永远不触发，等于这个模块什么也不做。
 */
export function registerPanel(ctx) {
  ctx.inject(['dshGo'], (ctx) => {
    ctx.dshGo.panel(PANEL, {
      view: (scope, caps) => buildView(scope, caps),
      actions: {
        [CHECK_IN]: handleCheckIn,
        'learn-L0': learnHandler('L0'),
        'learn-L1': learnHandler('L1'),
        'learn-L2': learnHandler('L2'),
        'learn-L3': learnHandler('L3'),
      },
    })

    ctx.dshGo.on(QUICK, quickPrompt)
  })
}
