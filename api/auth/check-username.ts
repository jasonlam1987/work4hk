const json = (res: any, status: number, body: any) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

const BACKEND_ORIGIN = 'http://119.91.50.192'
const DEFAULT_LIMIT = 2000

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' })

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  if (!username) return json(res, 400, { error: 'Invalid username' })

  const token =
    (process.env.AUTH_PRECHECK_TOKEN ? String(process.env.AUTH_PRECHECK_TOKEN) : '') ||
    (req.headers?.['x-auth-precheck-token'] as string | undefined) ||
    (req.headers?.['X-AUTH-PRECHECK-TOKEN'] as string | undefined) ||
    ''

  if (!token) {
    return json(res, 501, { error: 'Precheck is not configured' })
  }

  try {
    const url = new URL(`${BACKEND_ORIGIN}/api/users`)
    url.searchParams.set('limit', String(DEFAULT_LIMIT))

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
      },
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      return json(res, 502, { error: 'Upstream precheck failed', status: upstream.status, detail: text })
    }

    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      return json(res, 502, { error: 'Upstream precheck failed', detail: 'Invalid JSON' })
    }

    const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
    const exists = list.some((u: any) => String(u?.username || '').trim() === username)
    return json(res, 200, { exists })
  } catch (e: any) {
    return json(res, 502, { error: 'Upstream precheck failed', detail: String(e?.message || e) })
  }
}

