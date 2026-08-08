export type ResearchCategory = '品类报告' | '深度分析'

export type MigratedResearch = {
  id: string
  category: ResearchCategory
  title: string
  publishedAt: string | null
  sourceUrl: string | null
  sourceLabel: string
  status: '外链阅读' | '待确认原文件'
  note?: string
}

export type LaojiaTalk = {
  id: string
  title: string
  publishedAt: string
  sourceUrl: string
}

export const RESEARCH_CATEGORIES: ResearchCategory[] = ['品类报告', '深度分析']

export const RESEARCH_ITEMS: MigratedResearch[] = [
  { id: 'cotton-doll-20260710', category: '品类报告', title: '【品类报告】棉花娃娃产业深度研究报告', publishedAt: '2026-07-10', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E3%80%90%E5%93%81%E7%B1%BB%E6%8A%A5%E5%91%8A%E3%80%91%E6%A3%89%E8%8A%B1%E5%A8%83%E5%A8%83%E6%B7%B1%E5%BA%A6%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，后续可迁移为站内正文。' },
  { id: 'figure-20260630', category: '品类报告', title: '【品类报告】手办/FIGURE行业深度研究报告', publishedAt: '2026-06-30', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E6%89%8B%E5%8A%9EFIGURE%E8%A1%8C%E4%B8%9A%E6%B7%B1%E5%BA%A6%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A_2026-06-30.html', sourceLabel: '查看原文件', status: '外链阅读', note: '使用实际存在的文件链接。' },
  { id: 'bjd-20260617', category: '品类报告', title: '【品类报告】BJD可动关节人偶深度研究报告', publishedAt: '2026-06-17', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/BJD%E5%8F%AF%E5%8A%A8%E5%85%B3%E8%8A%82%E4%BA%BA%E5%81%B6%E6%B7%B1%E5%BA%A6%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A_2026-06-17.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，文件体积较大。' },
  { id: 'ai-toy-20260604', category: '品类报告', title: '【品类报告】AI潮玩行业深度研究报告', publishedAt: '2026-06-04', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/AI%E6%BD%AE%E7%8E%A9%E6%B7%B1%E5%BA%A6%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A_2026-06-04.html', sourceLabel: '查看原文件', status: '外链阅读', note: '迁移正文前需清洗部分标题标签。' },
  { id: 'card-20260531', category: '品类报告', title: '【品类报告】中国卡牌行业深度研究报告', publishedAt: '2026-05-31', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/20260531-card-industry-report.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含 12 个主要章节。' },
  { id: 'toy-20260529', category: '品类报告', title: '【品类报告】潮玩全行业深度研究报告（52个品牌）', publishedAt: '2026-05-29', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E6%BD%AE%E7%8E%A9%E8%A1%8C%E4%B8%9A%E7%AB%9E%E5%93%81%E5%88%86%E6%9E%90_%E5%85%A8%E8%A1%8C%E4%B8%9A%E5%AE%8C%E6%95%B4%E6%8A%A5%E5%91%8A.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含约 61 个主要章节。' },
  { id: 'plush-blindbox-20260529', category: '品类报告', title: '【品类报告】纯毛绒盲盒赛道深度研究报告', publishedAt: '2026-05-29', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E7%BA%AF%E6%AF%9B%E7%BB%92%E7%9B%B2%E7%9B%92%E8%B5%9B%E9%81%93%E6%B7%B1%E5%BA%A6%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A_2026-05-29.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含 14 个主要章节。' },
  { id: 'blindbox-20260508', category: '品类报告', title: '【品类报告】盲盒赛道深度研究报告', publishedAt: '2026-05-08', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E7%9B%B2%E7%9B%92%E8%B5%9B%E9%81%93%E6%B7%B1%E5%BA%A6%E8%B0%83%E7%A0%94%E6%8A%A5%E5%91%8A_2026-05-08.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含 10 个主要章节。' },
  { id: 'adoudou-20260716', category: '深度分析', title: '阿豆豆 Adoudou 小红书内容打法拆解', publishedAt: '2026-07-16', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E3%80%90IP%E8%AF%84%E4%BC%B0%E6%8A%A5%E5%91%8A%E3%80%91%E9%98%BF%E8%B1%86%E8%B1%86_2026-07-16.html', sourceLabel: '查看原文件', status: '外链阅读', note: '原索引名称为 IP 评估报告，现归入账号运营分析。' },
  { id: 'xiaomogu', category: '深度分析', title: '小蘑菇秃秃短视频深度分析报告', publishedAt: null, sourceUrl: null, sourceLabel: '待确认原文件', status: '待确认原文件', note: '原文件未进入网站索引，文件名存在编码异常。' },
  { id: 'hatsune-miku-20260529', category: '深度分析', title: '【IP评估报告】初音未来', publishedAt: '2026-05-29', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E3%80%8AIP%E8%AF%84%E4%BC%B0%E6%8A%A5%E5%91%8A-%E5%88%9D%E9%9F%B3%E6%9C%AA%E6%9D%A5%E3%80%8B.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含 5 个主要部分。' },
  { id: 'line-puppy-20260529', category: '深度分析', title: '【IP评估报告】线条小狗', publishedAt: '2026-05-29', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E7%BA%BF%E6%9D%A1%E5%B0%8F%E7%8B%97-IP%E8%AF%84%E4%BC%B0%E6%8A%A5%E5%91%8A.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含 5 个主要部分。' },
  { id: 'capybara-20260514', category: '深度分析', title: '【IP评估报告】水豚噜噜', publishedAt: '2026-05-14', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/%E6%B0%B4%E8%B1%9A%E5%99%9C%E5%99%9C-IP%E6%B7%B1%E5%BA%A6%E8%AF%84%E4%BC%B0%E6%8A%A5%E5%91%8A.html', sourceLabel: '查看原文件', status: '外链阅读', note: '正文存在，迁移时需重新识别章节结构。' },
  { id: 'jotoys-ukio-20260624', category: '深度分析', title: 'JOTOYS UKIO城市印象系列盲盒小红书营销推广分析', publishedAt: '2026-06-24', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/JOTOYS-UKIO%E5%9F%8E%E5%B8%82%E5%8D%B0%E8%B1%A1%E7%B3%BB%E5%88%97%E7%9B%B2%E7%9B%92%E5%B0%8F%E7%BA%A2%E4%B9%A6%E8%90%A5%E9%94%80%E6%8E%A8%E5%B9%BF%E5%88%86%E6%9E%90.html', sourceLabel: '查看原文件', status: '外链阅读', note: '完整 HTML，包含 7 个主要部分。' },
]

export const LAOJIA_TALKS: LaojiaTalk[] = [
  { id: 'talk-20260605', title: '【深度】30天，4万+字，我手搓了一份卡牌赛道深度报告，让我发现了7个行业真相和6个预判', publishedAt: '2026-06-05', sourceUrl: 'https://mp.weixin.qq.com/s/pt6ZZS62KScygA3Wf2dFvg' },
  { id: 'talk-20260518', title: 'Q1烧掉20亿，瑞幸KFC们的联名还卖得动吗？', publishedAt: '2026-05-18', sourceUrl: 'https://mp.weixin.qq.com/s/BmG6xWl54BpZRiDXZJ4UAA' },
  { id: 'talk-20260515', title: '当人人都能一键AI出图，IP行业最大的谎言被戳穿了', publishedAt: '2026-05-15', sourceUrl: 'https://mp.weixin.qq.com/s/V7SiPgaqkf8BpFm3YVstCw' },
  { id: 'talk-20260507', title: '别碰二次元，碰就是死！', publishedAt: '2026-05-07', sourceUrl: 'https://mp.weixin.qq.com/s/YCv7oSVyU94J8W8agSHb8A' },
  { id: 'talk-20260506', title: '满大街都是“类似Labubu”和“类似娃三岁”，你们到底在恶心谁？', publishedAt: '2026-05-06', sourceUrl: 'https://mp.weixin.qq.com/s/lr1kbxn6ldMSKYg7gwZ1AA' },
  { id: 'talk-20260501', title: '【盘点】五一期间上新的IP授权案例', publishedAt: '2026-05-01', sourceUrl: 'https://mp.weixin.qq.com/s/xvVBZ8MS97gxRYeHmFm9Fw' },
  { id: 'talk-20260428', title: '【深度盘点分析】哆啦A梦2026年IP授权联名案例。这世上根本就没有“新IP红利”！', publishedAt: '2026-04-28', sourceUrl: 'https://mp.weixin.qq.com/s/4ldB2hyuWNgx2WAp6RiI6g' },
  { id: 'talk-20260419', title: '笑死！那个拿下哪吒1亿订单的工厂，现在要倒闭了……真相远比你想的残酷', publishedAt: '2026-04-19', sourceUrl: 'https://mp.weixin.qq.com/s/qaS1yz2OTUxx0JgaUGyRsA' },
]
