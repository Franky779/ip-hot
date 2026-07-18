export const INDUSTRY_SCOPE_RULES = `【目标赛道与行业范围】
1. 内容资产：文创、动漫IP、影视IP、游戏IP、文学IP、博物馆及传统文化IP、文旅IP、体育IP、艺术家IP、明星及虚拟角色IP、企业品牌IP。
2. 核心业务：IP授权、品牌授权、版权交易、内容改编、授权代理、品牌联名、联合营销、商品化开发，以及二次元、ACG产业动态。
3. IP衍生商品：玩具、潮玩、盲盒、手办、模型、积木、毛绒、卡牌及收藏品；服装鞋帽、箱包、珠宝配饰；母婴、儿童用品及教育产品；文具办公、图书绘本、音像出版物；礼赠品、促销品、纪念品、节庆及企业定制；食品饮料、糖果烘焙、餐饮酒水；美妆个护、香氛日化；家居家纺、寝具厨餐具、家具生活用品；手机电脑、数码、智能硬件、家电及配件；运动户外、宠物、汽车和园艺用品。
4. 体验与数字授权：IP主题展览、快闪店、主题乐园、商业空间、文旅项目、酒店餐饮、沉浸式娱乐、舞台演出、虚拟偶像、数字商品、游戏皮肤。
5. 产业链：授权商、被授权商、品牌方、授权代理、设计公司、生产制造、供应链、零售商、电商平台、行业协会、专业展会，以及与本行业直接相关的投资并购、产业政策、版权保护和消费趋势。

【收录边界】
- 上述消费品、企业和产业链本身不是自动收录理由。新闻必须明确涉及IP、版权、授权、改编、联名、联合营销、商品化、二次元/ACG，或明确属于IP衍生品、体验型/数字型授权业务。
- 普通新品、普通促销、一般零售、泛消费趋势、常规企业经营、纯融资财报，以及与IP业务无明确关系的食品、服装、母婴、家电、宠物、汽车等资讯，均为间接相关或无关，最高3分。
- 投资并购、政策、版权和供应链新闻，必须以目标行业企业、项目、权利或产品为直接对象，才允许达到7分。`

const GENERIC_ADJACENT_PATTERN = /(?:\bAI\b|人工智能|大模型|生成式AI|AIGC|智能体|芯片|算力|机器人|OpenAI|NVIDIA|英伟达|融资|财报|营收|并购|收购|食品|饮料|餐饮|酒水|服装|鞋帽|箱包|珠宝|母婴|家电|数码|宠物|汽车|园艺|美妆|香氛|日化|家居|家具)/i

const DIRECT_INDUSTRY_PATTERN = /(?:动漫|动画|漫画|二次元|ACG|\bIP\b|影视IP|游戏IP|文学IP|体育IP|艺术家IP|明星IP|企业品牌IP|虚拟角色|虚拟偶像|授权|版权交易|内容改编|联名|联合营销|商品化|衍生品|潮玩|盲盒|谷子|手办|模型|积木|毛绒玩具|卡牌|收藏品|文创|文旅|博物馆|文化遗产|传统文化IP|非遗|旅游纪念品|主题乐园|城市IP|主题展览|快闪店|沉浸式娱乐|舞台演出|数字商品|游戏皮肤|电竞|anime|animation|manga|licens(?:e|ing)|collectible|toy|museum|tourism|theme park)/i

/** 泛AI/科技标题如果没有明确的目标行业对象，只能算间接相关。 */
export function isClearlyIndirectTechTitle(title: string, category?: string | null): boolean {
  const needsDirectEvidence = category === 'AI/新技术' || GENERIC_ADJACENT_PATTERN.test(title)
  return needsDirectEvidence && !DIRECT_INDUSTRY_PATTERN.test(title)
}

export function enforceDirectIndustryScore(
  title: string,
  category: string | null,
  score: number
): number {
  return isClearlyIndirectTechTitle(title, category) ? Math.min(score, 3) : score
}
