import { createServiceClient } from '@/lib/supabase'
import { prepareResearchHtmlDocument, researchHtmlResponseHeaders } from '@/lib/research-html'
import { previewReports, researchPreviewEnabled } from '@/lib/research-preview'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (researchPreviewEnabled()) {
    const report = previewReports().find((item) => item.slug === id)
    if (!report || report.content_format !== 'html') return new Response('Not Found', { status: 404 })
    return new Response(prepareResearchHtmlDocument(report.markdown_content), { headers: researchHtmlResponseHeaders(new URL(request.url).origin) })
  }

  const result = await createServiceClient().from('research_reports').select('markdown_content, content_format').eq('slug', id).maybeSingle()
  if (result.error) return new Response(result.error.message, { status: 500 })
  if (!result.data || result.data.content_format !== 'html') return new Response('Not Found', { status: 404 })
  return new Response(prepareResearchHtmlDocument(result.data.markdown_content), { headers: researchHtmlResponseHeaders(new URL(request.url).origin) })
}
