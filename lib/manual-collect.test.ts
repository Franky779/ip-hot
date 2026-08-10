import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLECT_SOURCE_TYPE,
  MANUAL_SELECTION_THRESHOLD,
  resolveManualClassification,
} from './manual-collect.ts'
import { AUTO_CLEANUP_LOW_SCORE_SQL } from './pending-classification.ts'
import { extractWechatUrl, parseWechatHtml, WechatFetchError } from './wechat-article.ts'

// ====== resolveManualClassification：必收录规则 ======

test('resolveManualClassification rewrites 待分类 to 待人工复核（防止被空正文重跑队列覆盖）', () => {
  const result = resolveManualClassification({
    title_cn: '标题', summary_cn: '摘要', category: '待分类',
    relevance_score: 5, is_selected: false, commentary: '', safety_blocked: false,
  })
  assert.equal(result.category, '待人工复核')
})

test('resolveManualClassification keeps LLM category and score as-is', () => {
  const result = resolveManualClassification({
    title_cn: '标题', summary_cn: '摘要', category: '潮玩谷子',
    relevance_score: 8, is_selected: true, commentary: '点评', safety_blocked: false,
  })
  assert.equal(result.category, '潮玩谷子')
  assert.equal(result.relevance_score, 8)
})

test('resolveManualClassification always marks selected and uses the manual threshold', () => {
  const result = resolveManualClassification({
    title_cn: '标题', summary_cn: '摘要', category: '游戏/体育',
    relevance_score: 2, is_selected: false, commentary: '', safety_blocked: false,
  })
  assert.equal(result.is_selected, true)
  assert.equal(result.selection_threshold, MANUAL_SELECTION_THRESHOLD)
  assert.equal(result.selection_threshold, 4)
})

// ====== 低分自动清理 SQL 必须豁免手动精选（防回归） ======

test('AUTO_CLEANUP_LOW_SCORE_SQL excludes manual articles', () => {
  assert.ok(AUTO_CLEANUP_LOW_SCORE_SQL.includes('is_manual = false'))
})

// ====== extractWechatUrl：链接提取与规范化 ======

test('extractWechatUrl accepts a bare short-path link', () => {
  assert.equal(
    extractWechatUrl('https://mp.weixin.qq.com/s/abc123_Xy'),
    'https://mp.weixin.qq.com/s/abc123_Xy'
  )
})

test('extractWechatUrl extracts link from pasted text and strips fragment/tracking', () => {
  assert.equal(
    extractWechatUrl('快来看看 https://mp.weixin.qq.com/s/abc123_Xy?xtrack=1#rd 写得真好'),
    'https://mp.weixin.qq.com/s/abc123_Xy'
  )
})

test('extractWechatUrl keeps identity params and drops session params in long form', () => {
  assert.equal(
    extractWechatUrl('https://mp.weixin.qq.com/s?__biz=MzA1&mid=100&idx=1&sn=abcdef&chksm=xyz&scene=21#wechat_redirect'),
    'https://mp.weixin.qq.com/s?__biz=MzA1&mid=100&idx=1&sn=abcdef'
  )
})

test('extractWechatUrl rejects non-wechat links, fake domains and incomplete params', () => {
  assert.equal(extractWechatUrl('https://www.36kr.com/p/123'), null)
  assert.equal(extractWechatUrl('https://mp.weixin.qq.com.evil.com/s/abc'), null)
  assert.equal(extractWechatUrl('https://mp.weixin.qq.com/s?__biz=MzA1&mid=100'), null)
  assert.equal(extractWechatUrl('随便一段没有链接的文字'), null)
})

// ====== parseWechatHtml：页面解析（三种 fixture） ======

const NORMAL_HTML = `<html><head>
<meta property="og:title" content="备用标题">
<meta property="og:image" content="https://mmbiz.qpic.cn/cover/0">
</head><body>
<h1 id="activity-name">  测试文章标题  </h1>
<span id="js_name"> 测试公众号 </span>
<em id="publish_time">2026年8月9日 08:00</em>
<div id="js_content"><p>正文第一段。</p><p>正文第二段。</p></div>
</body></html>`

test('parseWechatHtml parses title, account, time, content and cover', () => {
  const article = parseWechatHtml(NORMAL_HTML)
  assert.equal(article.title, '测试文章标题')
  assert.equal(article.accountName, '测试公众号')
  assert.equal(article.publishedAt, '2026-08-09T00:00:00.000Z')
  assert.ok(article.content.includes('正文第一段'))
  assert.equal(article.coverUrl, 'https://mmbiz.qpic.cn/cover/0')
})

test('parseWechatHtml throws deleted for removed articles', () => {
  assert.throws(
    () => parseWechatHtml('<html><body><div>该内容已被发布者删除</div></body></html>'),
    (error) => error instanceof WechatFetchError && error.kind === 'deleted'
  )
})

test('parseWechatHtml throws blocked for environment-verification pages', () => {
  assert.throws(
    () => parseWechatHtml('<html><body><div>当前环境异常，请完成验证后重试</div></body></html>'),
    (error) => error instanceof WechatFetchError && error.kind === 'blocked'
  )
})

test('parseWechatHtml throws parse_failed for unrecognized pages', () => {
  assert.throws(
    () => parseWechatHtml('<html><head><title></title></head><body><div>随机页面</div></body></html>'),
    (error) => error instanceof WechatFetchError && error.kind === 'parse_failed'
  )
})

test('COLLECT_SOURCE_TYPE is the machine-readable marker used by source-repair', () => {
  assert.equal(COLLECT_SOURCE_TYPE, '公众号（随手收）')
})
