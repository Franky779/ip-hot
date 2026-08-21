import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyOptionRename,
  buildIpBrandOptions,
  countOptionUsage,
  dedupeIpNews,
  mergeIpRecords,
  type IpBrandAdminData,
  type IpNews,
  type IpRecord,
} from './ipbrand-types.ts'

const record = (patch: Partial<IpRecord> = {}): IpRecord => ({
  id: 1,
  name_cn: '甲',
  name_en: 'A',
  initial: '#',
  cover: '',
  images: [],
  case_len: 0,
  category: '卡通动漫',
  place_origin: '日本',
  company: '甲公司',
  one_line_intro: '甲简介',
  ip_intro: '甲介绍',
  company_intro: '',
  areas: ['中国'],
  ages: ['儿童'],
  industries: ['玩具'],
  listing_date: '',
  auth_start: '',
  auth_end: '',
  licensor_case_list: [],
  news_list: [],
  source_url: '',
  ...patch,
})

const admin = (patch: Partial<IpBrandAdminData> = {}): IpBrandAdminData => ({
  deleted: [],
  edits: {},
  manuals: {},
  event_plans: {},
  new_records: [],
  options: {},
  ...patch,
})

test('derives option lists from records and admin additions/removals', () => {
  const records = [
    record(),
    record({ id: 2, category: '潮流时尚', ages: ['儿童', '青年'], industries: ['玩具', '服装'] }),
  ]
  const result = buildIpBrandOptions(records, admin({
    options: {
      category: { added: ['企业品牌'], removed: ['潮流时尚'] },
      place_origin: { added: ['中国'], removed: [] },
      ages: { added: ['成年'], removed: [] },
      industries: { added: [], removed: ['玩具'] },
    },
  }))

  assert.deepEqual(result.category, ['企业品牌', '卡通动漫'].sort((a, b) => a.localeCompare(b)))
  assert.deepEqual(result.place_origin, ['中国', '日本'].sort((a, b) => a.localeCompare(b)))
  assert.deepEqual(result.ages, ['儿童', '成年', '青年'].sort((a, b) => a.localeCompare(b)))
  assert.deepEqual(result.industries, ['服装'])
})

test('supports old admin data with no options field', () => {
  const oldAdmin = { deleted: [], edits: {}, manuals: {}, new_records: [] } as unknown as IpBrandAdminData
  assert.deepEqual(buildIpBrandOptions([record()], oldAdmin), {
    category: ['卡通动漫'],
    place_origin: ['日本'],
    ages: ['儿童'],
    industries: ['玩具'],
  })
})

test('counts scalar and array option usage once per IP', () => {
  const records = [
    record({ ages: ['儿童', '儿童'], industries: ['玩具', '服装'] }),
    record({ id: 2, category: '卡通动漫', industries: ['玩具'] }),
  ]

  assert.equal(countOptionUsage(records, 'category', '卡通动漫'), 2)
  assert.equal(countOptionUsage(records, 'ages', '儿童'), 2)
  assert.equal(countOptionUsage(records, 'industries', '玩具'), 2)
  assert.equal(countOptionUsage(records, 'industries', '服装'), 1)
})

test('renames scalar options without mutating records', () => {
  const records = [record(), record({ id: 2, category: '潮流时尚' })]
  const result = applyOptionRename(records, 'category', '卡通动漫', '企业品牌')

  assert.equal(result[0].category, '企业品牌')
  assert.equal(result[1].category, '潮流时尚')
  assert.equal(records[0].category, '卡通动漫')
})

test('renames array options and removes duplicate values', () => {
  const records = [record({ ages: ['儿童', '青年', '儿童'] }), record({ id: 2, ages: ['青年'] })]
  const result = applyOptionRename(records, 'ages', '儿童', '青年')

  assert.deepEqual(result[0].ages, ['青年'])
  assert.deepEqual(result[1].ages, ['青年'])
  assert.deepEqual(records[0].ages, ['儿童', '青年', '儿童'])
})

test('deduplicates news by id, then url, while preserving first order', () => {
  const news: IpNews[] = [
    { id: '1', title: '首条', url: 'https://a.example/1' },
    { id: '1', title: '重复 ID', url: 'https://other.example/1' },
    { title: '首条无 ID', url: 'https://b.example/1' },
    { title: '重复 URL', url: 'https://b.example/1' },
    { title: '无标识' },
    { title: '重复无标识' },
    { id: '2', title: '第二条' },
  ]

  assert.deepEqual(dedupeIpNews(news), [news[0], news[2], news[4], news[5], news[6]])
})

test('keeps every news item without an id or non-empty url', () => {
  const news: IpNews[] = [{ title: 'A' }, { title: 'B' }]
  assert.equal(dedupeIpNews(news).length, 2)
})

test('merge preserves related news override tri-state', () => {
  const base = record({ news_list: [{ title: '静态新闻' }] })
  const emptyOverride = mergeIpRecords([base], admin({ edits: { '1': { related_news: [] } } }))[0]
  const newsOverride = [{ id: 'n1', title: '管理员新闻' }]
  const populatedOverride = mergeIpRecords([base], admin({ edits: { '1': { related_news: newsOverride } } }))[0]
  const untouched = mergeIpRecords([base], admin())[0]

  assert.deepEqual(emptyOverride.related_news, [])
  assert.deepEqual(populatedOverride.related_news, newsOverride)
  assert.equal(untouched.related_news, undefined)
  assert.deepEqual(untouched.news_list, base.news_list)
})
