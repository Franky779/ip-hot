#!/usr/bin/env python3
"""用 Scrapling StealthyFetcher 抓取 RSS/XML 内容，绕过反爬"""
import sys
import os
import io
import re

# Windows 控制台 UTF-8 编码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 使用 venv 内的 scrapling
sys.path.insert(0, r'D:\claudecode\.venv-scrapling\Lib\site-packages')

from scrapling.fetchers import StealthyFetcher

def main():
    if len(sys.argv) < 3:
        print('Usage: fetch-rss-scrapling.py <url> <output_file>', file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    out_path = sys.argv[2]
    try:
        fetcher = StealthyFetcher()
        response = fetcher.fetch(url)
        html = response.html_content
        # scrapling 会把 XML 包装在 <html><body> 里，提取原始 RSS
        m = re.search(r'(<?xml[^\n]*\n)?<(rss|feed)[^\n]*>.*?</\2>', html, re.DOTALL)
        xml = m.group(0) if m else html
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(xml)
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
