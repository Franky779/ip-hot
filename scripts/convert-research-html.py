#!/usr/bin/env python3
"""Convert markdown research reports to baogua-styled HTML."""
import re, sys, os, json

def baogua_css():
    return """<style>
:root {
  --primary: #1a1a2e; --primary-light: #2d3a5c; --accent: #c45c26;
  --accent-light: #e07a3e; --accent-warm: #d4a045; --success: #4a8c6f;
  --bg: #f8f7f5; --bg-card: #ffffff; --text: #1f1a17;
  --text-secondary: #5a5047; --text-muted: #8a7e72; --border: #e5dfd8;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06); --shadow: 0 4px 20px rgba(0,0,0,0.06);
  --shadow-lg: 0 8px 40px rgba(0,0,0,0.1); --radius: 12px; --radius-sm: 8px;
  --font-display: "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, serif;
  --font-body: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-body); background: var(--bg); color: var(--text);
  line-height: 1.8; font-size: 15px;
}
.cover {
  background: var(--primary);
  background-image: radial-gradient(ellipse at 20% 50%, rgba(45,58,92,0.5) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(196,92,38,0.2) 0%, transparent 50%);
  color: #fff; padding: 140px 32px 80px; text-align: center; position: relative; overflow: hidden;
}
.cover::before {
  content: ''; position: absolute; top: -60%; left: -50%; width: 200%; height: 200%;
  background: repeating-linear-gradient(45deg, transparent, transparent 80px, rgba(255,255,255,0.012) 80px, rgba(255,255,255,0.012) 81px);
  pointer-events: none;
}
.cover-content { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; }
.cover-badge {
  display: inline-block; padding: 6px 20px; border: 1px solid rgba(255,255,255,0.2);
  border-radius: 30px; font-size: 12px; letter-spacing: 2px; margin-bottom: 24px; color: rgba(255,255,255,0.6);
}
.cover h1 {
  font-family: var(--font-display); font-size: 42px; font-weight: 700; margin-bottom: 12px; line-height: 1.25;
}
.cover .subtitle { font-size: 17px; opacity: 0.7; margin-bottom: 40px; font-weight: 300; }
.cover-meta { display: flex; justify-content: center; gap: 36px; flex-wrap: wrap; font-size: 13px; opacity: 0.55; }
.cover-meta span::before { content: ''; display: inline-block; width: 5px; height: 5px; background: var(--accent); border-radius: 50%; margin-right: 8px; vertical-align: middle; }

.kpi-section { max-width: 1200px; margin: -40px auto 0; padding: 0 24px; position: relative; z-index: 10; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.kpi-card {
  background: var(--bg-card); border-radius: var(--radius); padding: 28px 20px;
  box-shadow: var(--shadow-lg); text-align: center; transition: transform 0.2s;
}
.kpi-card:hover { transform: translateY(-2px); }
.kpi-number { font-size: 36px; font-weight: 800; color: var(--primary); line-height: 1; }
.kpi-label { font-size: 13px; color: var(--text-muted); margin-top: 8px; }
.kpi-sub { font-size: 12px; margin-top: 4px; color: var(--accent); font-weight: 600; }

.container { max-width: 1200px; margin: 0 auto; padding: 48px 24px 64px; }
.section { margin-bottom: 56px; }
.section-header { margin-bottom: 28px; border-bottom: 2px solid var(--border); padding-bottom: 12px; }
.section-num {
  display: inline-block; width: 32px; height: 32px; background: var(--primary);
  color: #fff; border-radius: 8px; text-align: center; line-height: 32px;
  font-weight: 700; font-size: 14px; margin-right: 12px; vertical-align: middle;
}
.section-title { font-family: var(--font-display); font-size: 24px; font-weight: 700; color: var(--primary); display: inline; vertical-align: middle; }
.section-desc { color: var(--text-secondary); margin-top: 12px; font-size: 14px; line-height: 1.7; }

.chart-box { background: var(--bg-card); border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow); margin-bottom: 20px; }
.chart-title { font-size: 15px; font-weight: 700; color: var(--primary); margin-bottom: 4px; }
.chart-subtitle { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
.chart-area { width: 100%; height: 380px; }
.chart-area-sm { height: 300px; }
.chart-footer { font-size: 12px; color: var(--text-muted); margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.three-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.col-span-2 { grid-column: span 2; }

.table-wrap { overflow-x: auto; border-radius: var(--radius-sm); box-shadow: var(--shadow); margin-bottom: 20px; }
.data-table {
  width: 100%; border-collapse: collapse; background: var(--bg-card); font-size: 13px; min-width: 500px;
}
.data-table thead th {
  background: var(--primary); color: #fff; padding: 12px 14px; text-align: left;
  font-weight: 600; font-size: 12px; letter-spacing: 0.5px; white-space: nowrap;
}
.data-table tbody td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: rgba(26,26,46,0.02); }
.data-table tbody tr:nth-child(even) { background: rgba(0,0,0,0.012); }

.tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-right: 4px; }
.tag-primary { background: rgba(26,26,46,0.08); color: var(--primary); }
.tag-accent { background: rgba(196,92,38,0.08); color: var(--accent); }
.tag-success { background: rgba(74,140,111,0.08); color: var(--success); }
.tag-warm { background: rgba(212,160,69,0.08); color: var(--accent-warm); }

.highlight-box {
  background: rgba(196,92,38,0.04); border: 1px solid rgba(196,92,38,0.12);
  border-radius: var(--radius-sm); padding: 16px 20px; margin: 16px 0;
}
.highlight-box p { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.7; }
.highlight-box strong { color: var(--accent); }
.highlight-box ul { padding-left: 20px; margin-top: 8px; font-size: 14px; color: var(--text-secondary); line-height: 2; }

.info-box {
  background: rgba(45,58,92,0.04); border: 1px solid rgba(45,58,92,0.12);
  border-radius: var(--radius-sm); padding: 16px 20px; margin: 16px 0;
}
.info-box p, .info-box div { font-size: 14px; color: var(--text-secondary); line-height: 1.7; }

.warning-box {
  background: rgba(196,92,38,0.03); border-left: 4px solid var(--accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0; padding: 16px 20px; margin: 12px 0;
}
.warning-box p { font-size: 14px; color: var(--text-secondary); line-height: 1.7; }
.warning-box strong { color: var(--accent); }

.key-box {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 16px 20px; margin: 12px 0;
  box-shadow: var(--shadow-sm);
}
.key-box p { font-size: 14px; color: var(--text); line-height: 1.7; }
.key-box strong { color: var(--primary); }

.text-card {
  background: var(--bg-card); border-radius: var(--radius); padding: 20px 24px;
  box-shadow: var(--shadow); margin-bottom: 16px;
}
.text-card h3 { font-size: 16px; color: var(--primary); margin-bottom: 12px; }
.text-card h4 { font-size: 15px; color: var(--primary); margin-bottom: 8px; }
.text-card p { font-size: 14px; color: var(--text-secondary); line-height: 1.7; }
.text-card ul { padding-left: 20px; font-size: 14px; color: var(--text-secondary); line-height: 2; }
.text-card li { margin-bottom: 4px; }
.text-card strong { color: var(--text); }

.prose { font-size: 14px; color: var(--text-secondary); line-height: 1.9; }
.prose h2 { font-family: var(--font-display); font-size: 22px; color: var(--primary); margin: 36px 0 16px; }
.prose h3 { font-size: 17px; color: var(--primary); margin: 28px 0 12px; }
.prose h4 { font-size: 15px; color: var(--text); margin: 20px 0 8px; }
.prose p { margin-bottom: 14px; }
.prose ul, .prose ol { padding-left: 24px; margin-bottom: 14px; line-height: 2; }
.prose li { margin-bottom: 4px; }
.prose strong { color: var(--text); }
.prose em { color: var(--accent); }
.prose table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
.prose table thead th { background: var(--primary); color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; }
.prose table tbody td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.prose table tbody tr:nth-child(even) { background: rgba(0,0,0,0.012); }
.prose hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }

.footer {
  text-align: center; padding: 40px 24px; color: var(--text-muted);
  font-size: 12px; border-top: 1px solid var(--border); background: var(--bg-card);
}
@media (max-width: 900px) {
  .two-col, .three-col { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .cover h1 { font-size: 28px; }
  .cover { padding: 100px 20px 60px; }
}
@media (max-width: 600px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .container { padding: 32px 16px; }
}
</style>"""
def fix_html_classes(html):
    """Map research-callout classes to baogua classes."""
    # KPI grids
    html = html.replace('<div class="research-kpi-grid">', '<div class="kpi-grid">')
    html = html.replace('<div class="research-kpi-card">', '<div class="kpi-card">')
    
    # Callout boxes
    html = re.sub(r'<div class="research-callout research-callout-highlight">', '<div class="highlight-box">', html)
    html = re.sub(r'<div class="research-callout research-callout-info">', '<div class="info-box">', html)
    html = re.sub(r'<div class="research-callout research-callout-key">', '<div class="key-box">', html)
    html = re.sub(r'<div class="research-callout research-callout-profile">', '<div class="text-card"><h4>基础信息</h4>', html)
    html = re.sub(r'<div class="research-callout research-callout-warning">', '<div class="warning-box">', html)
    
    # Close tags
    html = re.sub(r'</div>\s*\n?\s*<div class="(?:highlight-box|info-box|key-box|warning-box)">', '', html)
    
    # Tags
    html = re.sub(r'<span class="research-tag">', '<span class="tag tag-accent">', html)
    
    # KPI card internals
    html = re.sub(r'<strong>(\d[\d,.]*[万]?)</strong>\s*<span>', r'<div class="kpi-number">\1</div><div class="kpi-label">', html)
    html = re.sub(r'(?<=<div class="kpi-label">)(.+?)</div>', r'\1</div>', html)
    html = html.replace('</span></div>', '</div>')
    
    # Fix remaining </span> after kpi-label
    html = re.sub(r'(<div class="kpi-label">[^<]+)</span>', r'\1', html)
    
    # Table wrapping
    html = re.sub(r'(\|.+\|[\r\n]+\|[-| ]+\|[\r\n]+(?:\|.+\|[\r\n]*)+)', r'<div class="table-wrap"><table class="data-table">\n\1\n</table></div>', html)
    
    # Bold text in callouts
    html = re.sub(r'<strong>(.*?)</strong>', r'<strong>\1</strong>', html)
    
    return html

def simple_md_to_html(text):
    """Convert basic markdown to HTML, preserving existing HTML blocks."""
    lines = text.split('\n')
    result = []
    in_html_block = False
    html_depth = 0
    
    for line in lines:
        stripped = line.strip()
        
        if '<div' in stripped and not in_html_block:
            in_html_block = True
            html_depth = 1
            result.append(line)
            if '</div>' in stripped:
                in_html_block = False
            continue
        
        if in_html_block:
            result.append(line)
            html_depth += stripped.count('<div') - stripped.count('</div>')
            if html_depth <= 0:
                in_html_block = False
                html_depth = 0
            continue
        
        if not stripped:
            result.append('')
            continue
        
        # Table row
        if stripped.startswith('|') and stripped.endswith('|'):
            result.append(line)
            continue
        
        # Headings
        if stripped.startswith('#### '):
            result.append(f'<h4>{stripped[5:]}</h4>')
        elif stripped.startswith('### '):
            result.append(f'<h3>{stripped[4:]}</h3>')
        elif stripped.startswith('## '):
            result.append(f'<h2>{stripped[3:]}</h2>')
        elif stripped.startswith('# '):
            result.append(f'<h1>{stripped[2:]}</h1>')
        else:
            # Bold
            processed = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', stripped)
            # Italic
            processed = re.sub(r'\*(.+?)\*', r'<em>\1</em>', processed)
            # Inline code
            processed = re.sub(r'`([^`]+)`', r'<code>\1</code>', processed)
            
            # List item
            if re.match(r'^[-*]\s', processed):
                result.append(f'<li>{processed[2:]}</li>')
            elif re.match(r'^\d+\.\s', processed):
                result.append(f'<li>{re.sub(r"^\d+\.\s", "", processed)}</li>')
            else:
                result.append(f'<p>{processed}</p>')
    
    html = '\n'.join(result)
    
    # Wrap consecutive <li> in <ul>
    html = re.sub(r'(<li>.*?</li>\n(?=<li>))', r'\1', html)
    html = re.sub(r'((?:<li>.*?</li>\n)+)', r'<ul>\n\1</ul>\n', html)
    
    # Convert markdown tables to HTML
    def table_replacer(m):
        rows = m.group(0).strip().split('\n')
        if len(rows) < 2:
            return m.group(0)
        # Filter out separator row
        data_rows = [r for r in rows if not re.match(r'^\|[-| :]+\|$', r.strip())]
        if len(data_rows) < 2:
            return m.group(0)
        
        html_rows = []
        for i, row in enumerate(data_rows):
            cells = [c.strip() for c in row.split('|')[1:-1]]
            tag = 'th' if i == 0 else 'td'
            html_rows.append('<tr>' + ''.join(f'<{tag}>{c}</{tag}>' for c in cells) + '</tr>')
        
        thead = '<thead>' + html_rows[0] + '</thead>'
        tbody = '<tbody>' + '\n'.join(html_rows[1:]) + '</tbody>'
        return f'<div class="table-wrap"><table class="data-table">\n{thead}\n{tbody}\n</table></div>'
    
    html = re.sub(r'(\|.+\|[\r\n]+\|[-| :]+\|[\r\n]+(?:\|.+\|[\r\n]*)+)', table_replacer, html)
    
    return html

def build_cover(title, subtitle, badge, meta_items, accent_color=None):
    """Build cover section HTML."""
    ac = accent_color or "var(--accent)"
    metas = ''.join(f'<span>{m}</span>' for m in meta_items)
    return f'''<section class="cover">
  <div class="cover-content">
    <div class="cover-badge">{badge}</div>
    <h1>{title}</h1>
    <p class="subtitle">{subtitle}</p>
    <div class="cover-meta">{metas}</div>
  </div>
</section>'''

def build_html(title, cover_html, body_html, extra_head=''):
    """Build complete HTML document."""
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
{extra_head}
{baogua_css()}
</head>
<body>
{cover_html}

<div class="container">
<div class="prose">
{body_html}
</div>
</div>

<footer class="footer">
  <p>报告由新文创老贾聊IP公众号出品 · 基于公开数据与行业体感整理 · 仅供参考</p>
</footer>
</body>
</html>'''

def wrap_kpi_section(kpi_html):
    """If there's a kpi-grid, wrap it in kpi-section."""
    if 'kpi-grid' in kpi_html:
        return f'<div class="kpi-section">\n{kpi_html}\n</div>\n'
    return kpi_html

# Report definitions
reports = {
    "adoudou": {
        "slug": "adoudou-20260716",
        "title": "阿豆豆 Adoudou",
        "subtitle": "小红书内容打法拆解 — 基于191条笔记数据的深度复盘",
        "badge": "IP内容复盘",
        "meta": ["报告日期：2026年7月16日", "样本：191条笔记", "覆盖周期：2024.11 - 2026.07"],
    },
    "jotoys-ukio": {
        "slug": "jotoys-ukio-20260624",
        "title": "UKIO 城市印象",
        "subtitle": "基于小红书44条UGC笔记的逆向营销分析",
        "badge": "品牌营销复盘",
        "meta": ["报告日期：2026年6月24日", "样本：44条UGC笔记", "覆盖周期：2025.10 - 2026.06"],
    },
    "line-puppy": {
        "slug": "line-puppy-20260529",
        "title": "线条小狗 Maltese",
        "subtitle": "IP授权价值评估报告 — 韩国插画IP·2020年问世",
        "badge": "IP授权价值评估",
        "meta": ["报告日期：2026年4月27日", "评估有效期：90天", "出品：老贾聊IP授权评估"],
    },
    "hatsune-miku": {
        "slug": "hatsune-miku-20260529",
        "title": "初音未来 Hatsune Miku",
        "subtitle": "IP授权价值评估报告 — 全球长青虚拟偶像IP",
        "badge": "IP授权价值评估",
        "meta": ["报告日期：2026年5月1日", "评估有效期：90天", "出品：新文创老贾聊IP"],
    },
}

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: convert.py <name> <input.md> <output.html>")
        sys.exit(1)
    
    name = sys.argv[1]
    input_file = sys.argv[2]
    output_file = sys.argv[3]
    
    with open(input_file, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    r = reports.get(name, {"title": "报告", "subtitle": "", "badge": "研究报告", "meta": [], "slug": ""})
    
    body = simple_md_to_html(md_content)
    body = fix_html_classes(body)
    
    cover = build_cover(r["title"], r["subtitle"], r["badge"], r["meta"])
    
    kpi_section = ""
    # Extract KPI grid if present
    if '<div class="kpi-grid">' in body:
        kpi_match = re.search(r'(<div class="kpi-grid">.*?</div>\s*</div>)', body, re.DOTALL)
        if kpi_match:
            kpi_html = kpi_match.group(1)
            body = body.replace(kpi_html, '')
            kpi_section = wrap_kpi_section(kpi_html)
    
    html = build_html(r["title"], cover + '\n' + kpi_section, body)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"Generated {output_file} ({len(html)} bytes)")
