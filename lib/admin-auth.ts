// lib/admin-auth.ts — 管理员认证工具
export function isAdminAuthenticated(input: string | Request | { headers?: Headers }): boolean {
  let password: string | null = null

  if (typeof input === 'string') {
    password = input
  } else if (input instanceof Request) {
    password = input.headers.get('x-admin-password')
    if (!password) {
      const auth = input.headers.get('authorization') || ''
      const match = auth.match(/^Bearer\s+(.+)$/)
      if (match && match[1] === process.env.CRON_SECRET) {
        return true
      }
    }
  } else if (input.headers) {
    password = input.headers.get('x-admin-password')
  }

  return password === process.env.ADMIN_PASSWORD
}
