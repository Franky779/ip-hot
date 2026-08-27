import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveIpInitials, normalizeIpName, pinyinInitial } from './pinyin-initial.ts'
import type { IpRecord } from './ipbrand-types.ts'

test('去掉书名号族字符', () => {
  assert.equal(normalizeIpName('《故宫里的大怪兽》'), '故宫里的大怪兽')
  assert.equal(normalizeIpName('《白蛇：缘起》'), '白蛇：缘起')
  assert.equal(normalizeIpName('《我们的少年时代》、《流星花园》'), '我们的少年时代、流星花园')
  assert.equal(normalizeIpName('【RAPTONG】模式英语会话'), 'RAPTONG模式英语会话')
  assert.equal(normalizeIpName('『你们先走我断后』，于是'), '你们先走我断后，于是')
  assert.equal(normalizeIpName('  普通名称  '), '普通名称')
  assert.equal(normalizeIpName(''), '')
})

test('中文名 → 拼音首字母', () => {
  assert.equal(pinyinInitial('怪神话：山海'), 'G')
  assert.equal(pinyinInitial('肥肥鲨'), 'F')
  assert.equal(pinyinInitial('澳洲虎'), 'A')
  assert.equal(pinyinInitial('梦宝奇游记'), 'M')
  assert.equal(pinyinInitial('小突兔'), 'X')
  assert.equal(pinyinInitial('软萌兔'), 'R')
  assert.equal(pinyinInitial('米糕狗'), 'M')
  assert.equal(pinyinInitial('甜宝小猪'), 'T')
  assert.equal(pinyinInitial('卡皮巴拉小黄豚'), 'K')
  assert.equal(pinyinInitial('奥特曼'), 'A')
  assert.equal(pinyinInitial('盗墓笔记'), 'D')
  assert.equal(pinyinInitial('三体'), 'S')
})

test('书名号开头的按里面第一个汉字归类', () => {
  assert.equal(pinyinInitial('《故宫里的大怪兽》'), 'G')
  assert.equal(pinyinInitial('《白蛇：缘起》'), 'B')
  assert.equal(pinyinInitial('《魔兽世界®》'), 'M')
  assert.equal(pinyinInitial('《 炉石传说® 》'), 'L')
})

test('英文名取首字母大写', () => {
  assert.equal(pinyinInitial('Doraemon'), 'D')
  assert.equal(pinyinInitial('Smiley'), 'S')
  assert.equal(pinyinInitial('smiley'), 'S')
  assert.equal(pinyinInitial('Miffy 米菲'), 'M')
})

test('多音字按实际常用读音修正', () => {
  assert.equal(pinyinInitial('嚣搞'), 'X') // 嚣=xiāo（叫嚣/喧嚣）
  assert.equal(pinyinInitial('耙老师'), 'B') // 耙=bà（农具耙子）
})

test('数字/符号/非中日韩字符归 #', () => {
  assert.equal(pinyinInitial('2233娘的日常'), '#')
  assert.equal(pinyinInitial('1001夜'), '#')
  assert.equal(pinyinInitial('마법소녀 디디'), '#')
  assert.equal(pinyinInitial('チャックま'), '#')
  assert.equal(pinyinInitial('⽆谓君'), '#')
  assert.equal(pinyinInitial(''), '#')
  assert.equal(pinyinInitial('   '), '#')
})

test('deriveIpInitials 重算改名记录的 initial，且未变记录保持引用', () => {
  const base: IpRecord = {
    id: 4, name_cn: '怪神话：山海', name_en: 'Oddmyth', initial: 'G',
    cover: '', images: [], case_len: 0, category: '', place_origin: '', company: '',
    one_line_intro: '', ip_intro: '', company_intro: '', areas: [], ages: [], industries: [],
    listing_date: '', auth_start: '', auth_end: '', licensor_case_list: [], news_list: [], source_url: '',
  }
  const renamed: IpRecord = { ...base, name_cn: '三体', initial: 'G' } // 改名但 initial 还是旧值 G
  const [fixed] = deriveIpInitials([renamed])
  assert.equal(fixed.initial, 'S')

  const untouched = base
  const [kept] = deriveIpInitials([base])
  assert.equal(kept, untouched) // 未变化时复用原对象

  const bracketed: IpRecord = { ...base, name_cn: '《故宫里的大怪兽》', initial: '#' }
  const [sb] = deriveIpInitials([bracketed])
  assert.equal(sb.initial, 'G')
})