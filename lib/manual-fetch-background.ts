export const MANUAL_FETCH_ASYNC_QUERY = 'async'
export const MANUAL_FETCH_BACKGROUND_QUERY = 'background'

export function buildManualFetchBackgroundRequest(request: Request): Request {
  const url = new URL(request.url)
  url.searchParams.delete(MANUAL_FETCH_ASYNC_QUERY)
  url.searchParams.set(MANUAL_FETCH_BACKGROUND_QUERY, '1')

  const password = request.headers.get('x-admin-password') || ''
  return new Request(url, {
    headers: password ? { 'x-admin-password': password } : undefined,
  })
}
