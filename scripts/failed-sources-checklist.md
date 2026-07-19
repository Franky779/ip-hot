# 待修复/待测试数据源清单

## 一、RSS失败源（11个）

| 名称 | URL | 失败原因 | 优先级 | 修复建议 |
|------|-----|----------|--------|----------|
| Anime News Network | https://www.animenewsnetwork.com/ | RSS 格式损坏/服务器拦截 | P0 | 已改为本地 CDP 分流 |
| Crunchyroll News | https://feeds.feedburner.com/crunchyroll/animenews | 超时 | P0 | 重试/CDP |
| Animation World Network | https://www.awn.com/news.xml | 403 | P0 | CDP/Scrapling |
| Deadline | https://deadline.com/feed | 超时 | P0 | 重试/CDP |
| Polygon | https://www.polygon.com/feed/ | 旧 RSS 地址失效 | P0 | 已修复，RSS 三次各 10 条 |
| Kotaku | https://kotaku.com/rss | 403 | P0 | CDP/Scrapling |
| The Art Newspaper | https://www.theartnewspaper.com/rss.xml | 超时 | P0 | 重试/CDP |
| Anime Anime | https://animeanime.jp/rss20.xml | 404 | P0 | 地址可能失效 |
| Famitsu | https://www.famitsu.com/rss/news.rdf | 404 | P0 | 地址可能失效 |
| 36氪 | https://36kr.com/feed | XML解析错误 | P1 | 手动检查RSS格式 |
| 虎嗅 | https://article-api.huxiu.com/web/channel/articleList | 旧 RSS 超时 | P1 | 已改第一方 JSON API，三次各 10 条 |

## 二、CDP失败源（2个）

| 名称 | URL | 失败原因 | 优先级 | 修复建议 |
|------|-----|----------|--------|----------|
| KidScreen | https://kidscreen.com/category/screen/ | 提取0条 | P0 | 调整选择器 |
| 澎湃新闻 | https://www.thepaper.cn/list_25462 | 提取0条 | P1 | 调整选择器 |

## 三、WEB失败源（9个）

| 名称 | URL | 失败原因 | 优先级 | 修复建议 |
|------|-----|----------|--------|----------|
| 中外玩具网 | http://www.ctoy.com.cn | 403 | P1 | CDP/Scrapling |
| 玩具产业网 | https://www.wjyt-china.org/ | 无有效条目 | P1 | 调整选择器 |
| LCEXPO | http://www.lcexpo.com.cn | fetch失败 | P1 | 检查DNS/网络 |
| 中国文化报 | http://www.ccdy.cn | 无有效条目 | P1 | 调整选择器 |
| 搜狐网 | https://www.sohu.com | 无有效条目 | P2 | 调整选择器 |
| 京报网 | https://www.bjd.com.cn | 无有效条目 | P2 | 调整选择器 |
| 新闻晨报 | https://www.shxwcb.com | 无有效条目 | P2 | 调整选择器 |
| 浙江日报 | http://www.zjol.com.cn | 无有效条目 | P2 | 调整选择器 |
| 金羊网 | https://www.ycwb.com | 无有效条目 | P2 | 调整选择器 |

## 四、需登录跳过（2个）

| 名称 | URL | 说明 |
|------|-----|------|
| 知乎雷报 | https://www.jiemian.com/account/2079.html | 已改已认证“雷报”账号公开 API，三次各 10 条 |
| 小红书 | https://www.xiaohongshu.com/explore | 需小红书登录 |

## 五、政府源（40个）- 每周跑一次

| 名称 | URL |
|------|-----|
| 文化和旅游部 | https://www.mct.gov.cn/ |
| 国家广播电视总局 | https://www.nrta.gov.cn/ |
| 中国动漫集团 | http://www.acgg.cn/ |
| 国务院 | https://www.gov.cn/zhengce/zhengceku/bmwj/home.htm（已修复） |
| 国家发改委 | https://www.ndrc.gov.cn/ |
| 工业和信息化部 | https://www.miit.gov.cn/ |
| 国家知识产权局 | https://www.cnipa.gov.cn/ |
| 财政部 | https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/（已修复） |
| 浙江省文旅厅 | https://www.mct.gov.cn/whzx/qgwhxxlb/zj/（官方转载栏目，已修复） |
| 东莞市人民政府 | https://wglt.dg.gov.cn/（本机可读、Vercel fetch failed，已转本地 CDP） |
| 杭州西湖区政府 | https://www.hzxh.gov.cn/（WAF，本地 CDP） |
| 新疆文旅厅 | https://wlt.xinjiang.gov.cn/ |
| 北京市文旅局 | https://whlyj.beijing.gov.cn/ |
| 天津市文旅局 | https://whly.tj.gov.cn/（本机可读、Vercel 403，已转本地 CDP） |
| 上海市文旅局 | https://whlyj.sh.gov.cn/ |
| 重庆市文旅委 | https://wlt.cq.gov.cn/ |
| 河北省文旅厅 | https://wlt.hebei.gov.cn/ |
| 山西省文旅厅 | https://wlt.shanxi.gov.cn/ |
| 辽宁省文旅厅 | https://wlt.ln.gov.cn/ |
| 吉林省文旅厅 | https://wlt.jl.gov.cn/ |
| 黑龙江省文旅厅 | https://wlt.hlj.gov.cn/ |
| 江苏省文旅厅 | https://wlt.jiangsu.gov.cn/ |
| 安徽省文旅厅 | https://wlt.ah.gov.cn/ |
| 福建省文旅厅 | https://wlt.fujian.gov.cn/ |
| 江西省文旅厅 | https://wlt.jiangxi.gov.cn/ |
| 山东省文旅厅 | https://wlt.shandong.gov.cn/ |
| 河南省文旅厅 | https://wlt.henan.gov.cn/ |
| 湖北省文旅厅 | https://wlt.hubei.gov.cn/ |
| 湖南省文旅厅 | https://whhly.hunan.gov.cn/ |
| 广东省文旅厅 | https://wlt.gd.gov.cn/ |
| 广西文旅厅 | https://wlt.gxzf.gov.cn/ |
| 海南省旅文厅 | https://lwt.hainan.gov.cn/ |
| 四川省文旅厅 | https://wlt.sc.gov.cn/ |
| 贵州省文旅厅 | https://wlt.guizhou.gov.cn/ |
| 云南省文旅厅 | https://wlt.yn.gov.cn/ |
| 西藏文旅厅 | https://wlt.xizang.gov.cn/ |
| 陕西省文旅厅 | https://wlt.shaanxi.gov.cn/ |
| 甘肃省文旅厅 | https://www.mct.gov.cn/whzx/qgwhxxlb/gs/（官方转载栏目，已修复） |
| 青海省文旅厅 | https://wlt.qinghai.gov.cn/ |
| 宁夏文旅厅 | https://wlt.nx.gov.cn/ |

## 六、2026-07-19 生产失败纠错记录

| 原错误类型 | 信息源 | 最终动作 | 状态 |
|---|---|---|---|
| 选择器无有效资讯 | 北青网、红星新闻、财政部 | 改具体栏目/文章路径选择器；北青、红星因 Vercel 403/405 再转本地 CDP | 本地三连测通过，生产分流通过 |
| 选择器无有效资讯 | 艺恩网、猫眼专业版 | 非持续资讯源，从生产库清退 | 已清退 |
| RSS 15 秒超时 | 虎嗅 | 改第一方 JSON API | 三连测通过 |
| 403/405/412/fetch failed | 国务院、北青、红星、浙江、东莞、天津、甘肃 | 换可访问官方栏目或文旅部官方省级栏目；云端仍拦截的转本地 CDP | 直连源三连测通过，受保护源分流通过 |
| 需登录 | 知乎雷报 | 改界面新闻已认证“雷报”账号 API | 三连测通过 |
| XML 损坏/Feed 不识别 | Licensing International、Polygon | 前者改官方新闻 HTML，后者改当前 RSS | 三连测通过 |
| RSS 可访问但无条目 | ICOM、Museums Association | 改官方新闻 HTML | 三连测通过 |
| 404 | IGN Anime | 更新当前栏目并分流本地 CDP | 已配置，待 CDP dry-run |
| 空 URL | RSSHub、Tiny Tiny RSS、The Old Reader、飞书订阅 | 属于工具而非资讯发布方，从生产库清退 | 已清退 |
