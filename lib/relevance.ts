const GENERIC_TECH_PATTERN = /(?:\bAI\b|人工智能|大模型|生成式AI|AIGC|智能体|芯片|算力|机器人|OpenAI|NVIDIA|英伟达)/i

const DIRECT_INDUSTRY_PATTERN = /(?:动漫|动画|漫画|二次元|\bIP\b|授权|联名|衍生品|潮玩|盲盒|谷子|手办|卡牌|玩具|文创|文旅|博物馆|文化遗产|非遗|旅游|纪念品|主题乐园|城市IP|游戏|电竞|anime|animation|manga|licens(?:e|ing)|collectible|toy|museum|tourism|theme park)/i

/** 泛AI/科技标题如果没有明确的目标行业对象，只能算间接相关。 */
export function isClearlyIndirectTechTitle(title: string, category?: string | null): boolean {
  const isTech = category === 'AI/新技术' || GENERIC_TECH_PATTERN.test(title)
  return isTech && !DIRECT_INDUSTRY_PATTERN.test(title)
}

export function enforceDirectIndustryScore(
  title: string,
  category: string | null,
  score: number
): number {
  return isClearlyIndirectTechTitle(title, category) ? Math.min(score, 3) : score
}
