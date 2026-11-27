// Optional Go surface: a stateless doorway into the existing agent.
// No profile reads/writes, model calls, automatic messages or private memory.
const PANEL = 'skin-care-panel'

function english(value) { return String(value ?? '').toLowerCase().startsWith('en') }
const prompts = {
  question: {
    zh: '我有一个护肤问题：',
    en: 'I have a skin-care question: ',
  },
  explore: {
    zh: '我想弄懂一个护肤概念，请结合我的问题解释并核对依据：',
    en: 'Help me understand this skin-care concept, with evidence: ',
  },
  review: {
    zh: '请根据护肤知识帮我核对下面的说法，区分依据、适用条件和不确定之处：',
    en: 'Check this skin-care claim: distinguish evidence, applicability and uncertainty: ',
  },
}

function draft(key, event = {}) {
  return { insert: prompts[key][english(event.locale) ? 'en' : 'zh'] }
}

export function buildView(scope, caps = {}) {
  const en = english(caps.locale)
  return {
    type: 'stack', title: en ? 'Skin-care knowledge' : '护肤知识', children: [
      { type: 'text', text: en
        ? 'Ask your existing assistant. It can consult cited knowledge, explain concepts and check claims as needed.'
        : '直接和你的助手讨论。它会按需要查证知识、解释概念、核对说法，不必建档或选择课程。' },
      { type: 'actions', items: [
        { label: en ? 'Ask' : '提出问题', action: 'question', icon: 'chat' },
        { label: en ? 'Understand' : '弄懂概念', action: 'explore', icon: 'book' },
        { label: en ? 'Check a claim' : '核对说法', action: 'review', icon: 'search' },
      ] },
      { type: 'text', tone: 'muted', text: en
        ? 'These actions only prepare a draft. Personal context stays with your host assistant; this panel does not read or save a profile.'
        : '按钮只填写草稿，不会自动发送。个人上下文由宿主助手管理；这个面板不读写个人档案。' },
    ],
  }
}

export function registerPanel(ctx) {
  ctx.inject(['dshGo'], (ctx) => {
    ctx.dshGo.panel(PANEL, {
      view: buildView,
      actions: Object.fromEntries(Object.keys(prompts).map(key => [key, (_scope, event) => draft(key, event)])),
    })
  })
}
