const json = (res: any, status: number, body: any) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' })

  const appid =
    (process.env.WECHAT_APPID ? String(process.env.WECHAT_APPID).trim() : '') ||
    ((req.headers?.['x-wechat-appid'] as string | undefined) || '') ||
    ((req.headers?.['X-WECHAT-APPID'] as string | undefined) || '') ||
    ''
  const secret =
    (process.env.WECHAT_APPSECRET ? String(process.env.WECHAT_APPSECRET).trim() : '') ||
    ((req.headers?.['x-wechat-appsecret'] as string | undefined) || '') ||
    ((req.headers?.['X-WECHAT-APPSECRET'] as string | undefined) || '') ||
    ''

  const code = req.body?.code
  if (!appid || !secret) return json(res, 400, { error: 'WeChat credentials are not configured' })
  if (!code || typeof code !== 'string') return json(res, 400, { error: 'Invalid code' })

  try {
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
    url.searchParams.set('appid', appid)
    url.searchParams.set('secret', secret)
    url.searchParams.set('code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    const resp = await fetch(url.toString(), { method: 'GET' })
    const text = await resp.text()

    if (!resp.ok) {
      return json(res, 502, { error: 'WeChat exchange failed', detail: text })
    }

    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      return json(res, 502, { error: 'WeChat exchange failed', detail: text })
    }

    if (data?.errcode) {
      return json(res, 400, { error: 'WeChat exchange failed', detail: data })
    }

    return json(res, 200, {
      access_token: data?.access_token,
      expires_in: data?.expires_in,
      refresh_token: data?.refresh_token,
      openid: data?.openid,
      scope: data?.scope,
      unionid: data?.unionid,
    })
  } catch (e: any) {
    return json(res, 502, { error: 'WeChat exchange failed', detail: String(e?.message || e) })
  }
}
