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

export function prepareResearchHtmlDocument(source: string): string {
  const withLocalEcharts = source.replace(
    /(<script\b[^>]*\bsrc\s*=\s*["'])(?:\.\/)?echarts(?:\.min)?\.js(["'][^>]*>)/gi,
    '$1/research-assets/echarts.min.js$2',
  )
  if (withLocalEcharts.includes('data-ip-hot-height-bridge')) return withLocalEcharts
  if (/<\/body>/i.test(withLocalEcharts)) return withLocalEcharts.replace(/<\/body>/i, `${heightBridge}</body>`)
  return `${withLocalEcharts}${heightBridge}`
}

export function researchHtmlResponseHeaders(origin: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'unsafe-inline' 'self' ${origin}; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
}
