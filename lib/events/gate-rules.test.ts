// lib/events/gate-rules.test.ts — 热点榜闸门与去重的回归测试
//
// 用例直接取自 2026-10-04 线上热榜的真实条目（用户逐条标注过）：
// 第 2/3/7/8/9 条与 IP 授权无关，第 1/4 条有关，第 4/5 条重复。
// 这些是真实判错样本，比人造用例更能防止回归。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefilterGate, normalizeTitle, dedupeByTitle } from './gate-rules.ts'

test('栏目化内容一律判无关（用户点名的第 3、9 条）', () => {
  const columnTitles = [
    '这个周末大家都在玩什么',
    '每月推荐｜本月值得关注的十件大事',
    '每周推荐：本周精选资讯',
    '今日推荐 | 编辑部今日五条',
    '一周回顾：本周十大新闻',
    '新闻速览：今日早报',
  ]
  for (const title of columnTitles) {
    const verdict = prefilterGate(title, null)
    assert.equal(verdict?.relevant, false, `「${title}」应判为栏目化无关内容`)
  }
})

test('明确的授权与联名判为相关（用户认可的第 1、4 条）', () => {
  const relevant = [
    '某潮玩品牌与知名动漫 IP 达成联名合作',
    '这家 IP 方宣布授权合作，授权品类覆盖服饰与食品',
    'IP 授权展今日开幕，参展方公布新授权模式',
    '品牌方就商标侵权提起诉讼',
  ]
  for (const title of relevant) {
    const verdict = prefilterGate(title, null)
    assert.equal(verdict?.relevant, true, `「${title}」应判为有授权价值`)
  }
})

test('体育赛事与普通新品发布不进榜（用户点名的第 7、8 条）', () => {
  // 这两条没有授权信号，交给模型判定；此处只保证预过滤不误放行
  const ambiguous = [
    'UFC 332：如何免费观看 Natalia Silva 对战王聪直播',
    '耐克辛辛那提红人发布这个东西',
    'Air Jordan 3 中东西列换新发布',
  ]
  for (const title of ambiguous) {
    assert.equal(
      prefilterGate(title, null),
      null,
      `「${title}」应交给模型判定，而不是被预过滤直接定案`,
    )
  }
})

test('影视票房与明星动态不进榜（用户点名的第 2 条同类）', () => {
  const ambiguous = [
    '《真相》首周票房超 3300 万美元',
    '《黑暗边缘》制片人去世，享年 87 岁',
    '阿伦·索尔金：杰西·艾森伯格未回归令我意外',
  ]
  for (const title of ambiguous) {
    assert.equal(prefilterGate(title, null), null, `「${title}」应交给模型判定`)
  }
})

test('无信号的普通内容交给模型判定（返回 null）', () => {
  assert.equal(prefilterGate('某地举办文旅消费促进活动', null), null)
})

test('栏目化判定优先于授权信号：推荐文里出现「联名」也不放行', () => {
  // 顺序错误会让「本周推荐：十大联名盘点」这类内容混进榜单
  const verdict = prefilterGate('每周推荐：十大品牌联名盘点', null)
  assert.equal(verdict?.relevant, false)
  assert.match(verdict?.reason ?? '', /栏目化/)
})

test('摘要里的栏目化信号同样生效', () => {
  const verdict = prefilterGate('某品牌联名官宣', '本文是本周汇总，值得一看')
  assert.equal(verdict?.relevant, false)
})

test('normalizeTitle 忽略标点、空格与大小写差异', () => {
  assert.equal(normalizeTitle('Nike Air Max 联名款发布'), normalizeTitle('NIKE air max联名款发布！'))
  assert.equal(normalizeTitle('某品牌 官宣 联名'), normalizeTitle('某品牌官宣联名'))
  assert.notEqual(normalizeTitle('某品牌联名官宣'), normalizeTitle('另一品牌联名官宣'))
})

test('榜单去重：标题写法不同但同一件事只留一条（用户点名的第 4/5 条重复）', () => {
  const events = [
    { title_cn: 'Nike Air Max 1 联名发售', canonical_title: 'Nike Air Max 1 联名发售' },
    { title_cn: 'Nike Air Max 1联名发售！', canonical_title: 'Nike Air Max 1联名发售！' },
    { title_cn: '某潮玩与动漫 IP 达成联名', canonical_title: 'x' },
  ]
  const deduped = dedupeByTitle(events)
  assert.equal(deduped.length, 2, '归一化后相同的两条应合并为一条')
  assert.equal(deduped[0].title_cn, 'Nike Air Max 1 联名发售', '应保留传入顺序里的第一条（即热度最高那条）')
})

test('去重时优先用 title_cn，缺失则回退 canonical_title', () => {
  const events = [
    { title_cn: null, canonical_title: 'Disney Netflix partner' },
    { title_cn: null, canonical_title: 'Disney  Netflix  partner!!' },
  ]
  assert.equal(dedupeByTitle(events).length, 1)
})

test('归一化不做词元裁剪：and 与 & 不等价，不会误合并', () => {
  // 归一化只处理标点与大小写，不做停用词裁剪。
  // 好处是保守——宁可留两条，也不把不同的事合并成一条。
  const events = [
    { title_cn: 'Disney and Netflix partner', canonical_title: 'a' },
    { title_cn: 'Disney & Netflix partner', canonical_title: 'b' },
  ]
  assert.equal(dedupeByTitle(events).length, 2)
})

test('空标题不会把所有事件去重成一条', () => {
  const events = [
    { title_cn: '', canonical_title: '' },
    { title_cn: null, canonical_title: '' },
    { title_cn: '正常标题', canonical_title: '正常标题' },
  ]
  assert.equal(dedupeByTitle(events).length, 3)
})
