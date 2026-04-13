import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../store/authStore'

const WeChatCallback: React.FC = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [message, setMessage] = useState('正在處理微信授權…')

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

      let appid = ''
      let secret = ''
      try {
        const stored = localStorage.getItem('system_api_keys')
        const parsed = stored ? JSON.parse(stored) : {}
        appid = parsed?.wechatAppId ? String(parsed.wechatAppId).trim() : ''
        secret = parsed?.wechatAppSecret ? String(parsed.wechatAppSecret).trim() : ''
      } catch {
      }
      if (!appid || !secret) {
        setMessage('尚未配置微信登錄：請到「系統設定 → API 金鑰管理」填寫微信 AppId/AppSecret。')
        return
      }

      setMessage('正在與微信伺服器交換授權資訊…')

      const exchangeResp = await fetch('/api/wechat/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WECHAT-APPID': appid,
          'X-WECHAT-APPSECRET': secret,
        },
        body: JSON.stringify({ code }),
      })

      if (!exchangeResp.ok) {
        const text = await exchangeResp.text().catch(() => '')
        setMessage(text || '微信授權交換失敗')
        return
      }

      const wx = await exchangeResp.json()
      const openid = typeof wx?.openid === 'string' ? wx.openid : ''
      const unionid = typeof wx?.unionid === 'string' ? wx.unionid : ''

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
          setMessage('微信登錄尚未開通：後端缺少 /auth/wechat 介面（需要後端支援綁定/換取 token）。')
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
        {message}
      </div>
    </div>
  )
}

export default WeChatCallback

