const json = (res: any, status: number, body: any) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' })

  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : ''
  const openid = typeof req.body?.openid === 'string' ? req.body.openid.trim() : ''
  const lang = typeof req.body?.lang === 'string' ? req.body.lang.trim() : 'zh_CN'

  if (!accessToken || !openid) return json(res, 400, { error: 'Invalid access_token/openid' })

  try {
    const url = new URL('https://api.weixin.qq.com/sns/userinfo')
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('openid', openid)
    url.searchParams.set('lang', lang)

    const resp = await fetch(url.toString(), { method: 'GET' })
    const text = await resp.text()

    if (!resp.ok) {
      return json(res, 502, { error: 'WeChat userinfo failed', detail: text })
    }

    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      return json(res, 502, { error: 'WeChat userinfo failed', detail: text })
    }

    if (data?.errcode) {
      return json(res, 400, { error: 'WeChat userinfo failed', detail: data })
    }

    return json(res, 200, {
      openid: data?.openid,
      unionid: data?.unionid,
      nickname: data?.nickname,
      sex: data?.sex,
      province: data?.province,
      city: data?.city,
      country: data?.country,
      headimgurl: data?.headimgurl,
      privilege: data?.privilege,
    })
  } catch (e: any) {
    return json(res, 502, { error: 'WeChat userinfo failed', detail: String(e?.message || e) })
  }
}
