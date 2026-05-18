#!/usr/bin/env python3
"""通用爬虫：批量抓取国内网站文章列表"""
import sys
import os
import io
import re
import json
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

sys.path.insert(0, r'D:\claudecode\.venv-scrapling\Lib\site-packages')

from scrapling.fetchers import StealthyFetcher
from bs4 import BeautifulSoup

SUPABASE_URL = "https://rbjygwpoxuutmxmkzkqz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJianlnd3BveHV1dG14bWt6a3F6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM5NzA2MCwiZXhwIjoyMDkzOTczMDYwfQ.YX7z8Ps6qhSRIdvRb3cIaiXkz35U5QwG4T8RmKwL_yk"

fetcher = StealthyFetcher()

SITE_RULES = {
    'gamersky.com': {'selectors': ['.tit a', '.con .tt a'], 'title_from': 'text'},
    'ithome.com': {'selectors': ['.plc .new-list li a'], 'title_from': 'text'},
    'youxituoluo.com': {'selectors': ['.article-list .item h2 a', '.post-title a'], 'title_from': 'text'},
    '36kr.com': {'selectors': ['.article-item-title a'], 'title_from': 'text'},
    'huxiu.com': {'selectors': ['.article-item__title a'], 'title_from': 'text'},
    'tmtpost.com': {'selectors': ['.post-title a'], 'title_from': 'text'},
    'jiemian.com': {'selectors': ['.news-item h3 a'], 'title_from': 'text'},
    'thepaper.cn': {'selectors': ['.news_li h2 a'], 'title_from': 'text'},
    '1905.com': {'selectors': ['.news-list li a', '.item h3 a'], 'title_from': 'text'},
    'ctoy.com.cn': {'selectors': ['.list li a'], 'title_from': 'text'},
    'people.com.cn': {'selectors': ['.list li a'], 'title_from': 'text'},
    'xinhuanet.com': {'selectors': ['.news-list li a'], 'title_from': 'text'},
    'gmw.cn': {'selectors': ['.list-item h3 a'], 'title_from': 'text'},
    'yicai.com': {'selectors': ['.m-feed-item__title a'], 'title_from': 'text'},
    'bjnews.com.cn': {'selectors': ['.news-list li a'], 'title_from': 'text'},
    'sohu.com': {'selectors': ['.news-list h4 a'], 'title_from': 'text'},
    '163.com': {'selectors': ['.news-item h3 a'], 'title_from': 'text'},
    'qq.com': {'selectors': ['.news-item h3 a'], 'title_from': 'text'},
}

def get_sources():
    """从JSON文件读取国内信息源"""
    with open('_domestic_sources.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def fetch_html(target_url):
    try:
        response = fetcher.fetch(target_url)
        return response.html_content
    except Exception as e:
        return None

# 拦截关键词（链接预检用）
BLOCK_KEYWORDS = [
    '您的请求可能存在威胁', '已被拦截', '访问被拒绝', '拦截',
    'blocked', 'WAF', '安全检查', '安全验证', '您的访问被限制',
    'Access Denied', 'Forbidden', '请求过于频繁', '请稍后重试',
    '服务不可用', 'Service Unavailable',
]

def check_link(target_url, timeout=6):
    """检查单个链接是否可用，返回 (ok, reason)"""
    if not target_url or not target_url.startswith('http'):
        return False, 'invalid url'

    req = urllib.request.Request(
        target_url,
        method='HEAD',
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'}
    )

    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        # HEAD 成功，状态码正常
        if resp.status >= 400:
            return False, f'HTTP {resp.status}'
        return True, None
    except urllib.error.HTTPError as e:
        # HEAD 返回错误状态码，尝试 GET 确认
        if e.code == 405:  # Method Not Allowed
            pass
        else:
            return False, f'HTTP {e.code}'
    except Exception:
        pass

    # HEAD 失败，尝试 GET
    try:
        req_get = urllib.request.Request(
            target_url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'}
        )
        resp = urllib.request.urlopen(req_get, timeout=timeout)
        html = resp.read(8192).decode('utf-8', errors='ignore')
        for kw in BLOCK_KEYWORDS:
            if kw in html:
                return False, 'blocked by WAF/security'
        if resp.status >= 400:
            return False, f'HTTP {resp.status}'
        return True, None
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}'
    except Exception as e:
        return False, str(e)

def check_links_batch(urls, concurrency=5, timeout=6):
    """批量检查链接，返回 [(url, ok, reason), ...]"""
    import concurrent.futures
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_to_url = {executor.submit(check_link, url, timeout): url for url in urls}
        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            try:
                ok, reason = future.result()
                results.append((url, ok, reason))
            except Exception as e:
                results.append((url, False, str(e)))
    return results

def extract_articles(html, base_url, site_domain):
    soup = BeautifulSoup(html, 'html.parser')
    articles = []

    for script in soup(['script', 'style', 'nav', 'footer', 'aside']):
        script.decompose()

    domain = None
    for d in SITE_RULES:
        if d in site_domain:
            domain = d
            break

    if domain:
        rules = SITE_RULES[domain]
        for selector in rules['selectors']:
            links = soup.select(selector)
            for link in links:
                href = link.get('href', '')
                title = link.get_text(strip=True)
                if href and title and len(title) > 8:
                    full_url = urllib.parse.urljoin(base_url, href)
                    articles.append({'title': title, 'url': full_url})

    if not articles:
        all_links = soup.find_all('a', href=True)
        seen = set()
        for link in all_links:
            href = link.get('href', '')
            title = link.get_text(strip=True)
            if not href or not title:
                continue
            if len(title) < 10 or len(title) > 100:
                continue
            if href.startswith('#') or href.startswith('javascript:'):
                continue
            skip = ['login', 'register', 'about', 'contact', 'privacy', 'terms',
                    'rss', 'feed', 'sitemap', 'search', 'tag', 'author', 'category',
                    '.jpg', '.png', '.gif', '.pdf', '.zip', 'video', 'photo']
            if any(p in href.lower() for p in skip):
                continue
            full_url = urllib.parse.urljoin(base_url, href)
            if full_url in seen:
                continue
            seen.add(full_url)
            articles.append({'title': title, 'url': full_url})

    return articles[:10]

def main():
    print("获取国内信息源列表...")
    sources = get_sources()
    print(f"共 {len(sources)} 个\n")

    all_results = []

    for i, s in enumerate(sources, 1):
        name = s['name']
        url = s['url']
        section = s['section_title']

        print(f"[{i}/{len(sources)}] {name}")

        html = fetch_html(url)
        if not html:
            print(f"    抓取失败\n")
            continue

        domain = urllib.parse.urlparse(url).netloc
        articles = extract_articles(html, url, domain)

        # 链接有效性预检
        dead_count = 0
        if articles:
            link_results = check_links_batch([a['url'] for a in articles], concurrency=5, timeout=6)
            valid_urls = {url for url, ok, _ in link_results if ok}
            articles = [a for a in articles if a['url'] in valid_urls]
            dead_count = len(link_results) - len(valid_urls)

            for url, ok, reason in link_results:
                if not ok:
                    print(f"      [死链] {url[:80]}... ({reason})")

        print(f"    提取 {len(articles)} 条 (过滤 {dead_count} 条失效链接)")
        for a in articles[:3]:
            print(f"      - {a['title'][:60]}")
        print()

        all_results.append({
            'source': name,
            'section': section,
            'url': url,
            'articles': articles
        })

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_crawl_results.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"\n结果已保存到: {output_path}")
    total = sum(len(r['articles']) for r in all_results)
    print(f"共提取 {total} 条文章链接")

if __name__ == '__main__':
    main()
