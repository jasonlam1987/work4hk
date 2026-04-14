import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../store/authStore'

const WeChatCallback: React.FC = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [message, setMessage] = useState('正在處理微信授權…')
  const [detailText, setDetailText] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    const run = async () => {
      const code = params.get('code') || ''
      const state = params.get('state') || ''
      const savedState = sessionStorage.getItem('wechat_oauth_state') || ''

      if (!code) {
        setMessage('微信授權失敗：缺少 code')
        return
      }
      if (!state || !savedState || state !== savedState) {
        setMessage('微信授權失敗：state 校驗不通過，請重新發起登錄')
        return
      }

      setMessage('正在與微信伺服器交換授權資訊…')

      const exchangeResp = await fetch('/api/wechat/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      })

      if (!exchangeResp.ok) {
        const text = await exchangeResp.text().catch(() => '')
        setMessage(text || '微信授權交換失敗')
        return
      }

      const wx = await exchangeResp.json()
      const accessToken = typeof wx?.access_token === 'string' ? wx.access_token : ''
      const openid = typeof wx?.openid === 'string' ? wx.openid : ''
      const unionid = typeof wx?.unionid === 'string' ? wx.unionid : ''

      if (!openid) {
        setMessage('微信授權交換失敗：未取得 openid')
        return
      }

      let wxUser: any = null
      try {
        const userinfoResp = await fetch('/api/wechat/userinfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken, openid }),
        })
        if (userinfoResp.ok) {
          wxUser = await userinfoResp.json().catch(() => null)
        }
      } catch {
      }

      try {
        sessionStorage.setItem('wechat_last_identity', JSON.stringify({ openid, unionid, user: wxUser }))
      } catch {
      }

      setMessage('正在登入系統…')
      try {
        const login = await apiClient.post('/auth/wechat', { openid, unionid })
        if (login?.data?.access_token) {
          const token = String(login.data.access_token)
          const me = await apiClient.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          setAuth(me.data, token)
          navigate('/dashboard')
          return
        }
        setMessage('微信登錄失敗：後端未回傳 access_token')
      } catch (err: any) {
        const detail = err?.response?.data?.detail
        if (err?.response?.status === 404) {
          const nickname = typeof wxUser?.nickname === 'string' ? wxUser.nickname : ''
          setDetailText(
            JSON.stringify(
              {
                openid,
                unionid,
                ...(nickname ? { nickname } : {}),
              },
              null,
              2
            )
          )
          setMessage('已完成微信授權，但系統尚未開通微信登入（後端缺少 /api/auth/wechat 用於綁定/換取 token）。')
          return
        }
        setMessage(typeof detail === 'string' ? detail : '微信登錄失敗')
      }
    }

    run().catch(e => setMessage(String(e?.message || e)))
  }, [navigate, params, setAuth])

  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-gray p-6">
      <div className="w-full max-w-md glass-panel rounded-apple p-6 text-center text-gray-700">
        <div className="whitespace-pre-wrap">{message}</div>
        {detailText ? (
          <div className="mt-4 text-left">
            <div className="text-xs text-gray-500 mb-2">可提供以下資料給後端用作綁定：</div>
            <pre className="text-xs bg-white/60 border border-gray-200 rounded-apple-sm p-3 overflow-auto">{detailText}</pre>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(detailText)
                    setCopyStatus('已複製')
                    setTimeout(() => setCopyStatus(''), 1500)
                  } catch {
                    setCopyStatus('複製失敗')
                    setTimeout(() => setCopyStatus(''), 1500)
                  }
                }}
                className="px-3 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm text-sm font-medium transition-colors"
              >
                複製資料
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-apple-sm text-sm font-medium transition-colors"
              >
                返回登入
              </button>
              {copyStatus ? <span className="text-xs text-gray-500">{copyStatus}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default WeChatCallback
