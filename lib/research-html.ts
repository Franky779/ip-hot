export const RESEARCH_HTML_HEIGHT_MESSAGE = 'ip-hot-research-height'

const heightBridge = `<script data-ip-hot-height-bridge>
(() => {
  let lastHeight = 0;
  const reportHeight = () => {
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    if (height === lastHeight) return;
    lastHeight = height;
    parent.postMessage({ type: '${RESEARCH_HTML_HEIGHT_MESSAGE}', height }, '*');
  };
  addEventListener('load', () => {
    reportHeight();
    setTimeout(reportHeight, 100);
    setTimeout(reportHeight, 500);
  });
  addEventListener('resize', reportHeight);
  new ResizeObserver(reportHeight).observe(document.documentElement);
})();
</script>`

const echartsResize = `<script data-ip-hot-echarts-resize>
(() => {
  function resizeCharts() {
    if (typeof echarts === 'undefined') return
    const containers = document.querySelectorAll('[id*="chart-"]')
    containers.forEach((el) => {
      const inst = echarts.getInstanceByDom(el)
      if (inst && !inst.isDisposed()) inst.resize()
    })
  }
  let resizeTimer = 0
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resizeCharts, 150) })
  if (window.parent !== window) {
    new MutationObserver(resizeCharts).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    addEventListener('load', () => { setTimeout(resizeCharts, 300) })
  }
})();
</script>`

const responsiveFix = `<script data-ip-hot-responsive-fix>
(() => {
  const wrapTables = () => {
    document.querySelectorAll('.data-table').forEach((table) => {
      if (!table.parentElement || table.parentElement.classList.contains('data-table-scroll')) return
      const wrapper = document.createElement('div')
      wrapper.className = 'data-table-scroll'
      wrapper.style.cssText = 'overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch;'
      table.parentNode.insertBefore(wrapper, table)
      wrapper.appendChild(table)
    })
  }
  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', wrapTables)
  } else {
    wrapTables()
  }
})();
</script>`

const responsiveCss = `<style data-ip-hot-responsive>
@media (max-width: 900px) {
  .cover-content, .container, .kpi-section, .chart-box, .text-card {
    padding-left: 14px !important;
    padding-right: 14px !important;
  }
  .cover-title { font-size: 30px !important; }
  .cover-subtitle { font-size: 14px !important; }
  .kpi-section { margin-top: -24px !important; }
  .chart-box { box-shadow: none !important; border: 1px solid var(--border) !important; }
  .chart-area { height: 280px !important; }
  .chart-area-sm { height: 240px !important; }
  .data-table-scroll { margin-top: 12px; border: 1px solid var(--border); border-radius: 8px; }
  .data-table-scroll .data-table { min-width: 500px; }
}
@media (min-width: 1440px) {
  .container, .kpi-section { max-width: 1440px !important; }
}
</style>`

export function prepareResearchHtmlDocument(source: string): string {
  const withLocalEcharts = source.replace(
    /(<script\b[^>]*\bsrc\s*=\s*["'])(?:\.\/)?echarts(?:\.min)?\.js(["'][^>]*>)/gi,
    '$1/research-assets/echarts.min.js$2',
  )
  if (withLocalEcharts.includes('data-ip-hot-height-bridge')) {
    return withLocalEcharts.replace(/<\/head>/i, `${responsiveCss}</head>`)
  }
  const withCss = withLocalEcharts.replace(/<\/head>/i, `${responsiveCss}</head>`)
  if (/<\/body>/i.test(withCss)) return withCss.replace(/<\/body>/i, `${heightBridge}${responsiveFix}${echartsResize}</body>`)
  return `${withCss}${heightBridge}${responsiveFix}${echartsResize}`
}

// In-memory cache for prepared HTML documents (slug -> document string)
const htmlDocumentCache = new Map<string, string>()
const HTML_CACHE_MAX = 5

export function getCachedResearchHtmlDocument(slug: string): string | undefined {
  return htmlDocumentCache.get(slug)
}

export function setCachedResearchHtmlDocument(slug: string, document: string): void {
  if (htmlDocumentCache.size >= HTML_CACHE_MAX) { const first = htmlDocumentCache.keys().next().value; if (first) htmlDocumentCache.delete(first) }
  htmlDocumentCache.set(slug, document)
}

export function researchHtmlResponseHeaders(origin: string): Record<string, string> {
  const localOrigins = ['http://localhost:3010', 'http://127.0.0.1:3010'].filter((item) => item !== origin).join(' ')
  return {
    'Cache-Control': 'public, max-age=3600',
    'Content-Security-Policy': `default-src 'none'; script-src 'unsafe-inline' 'self' ${origin} ${localOrigins}; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
}