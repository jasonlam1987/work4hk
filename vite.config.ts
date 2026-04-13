import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { extractBrOcrFields } from './api/ai/brOcrExtract'

const brOcrDevPlugin = () => {
  return {
    name: 'br-ocr-dev',
    configureServer(server: any) {
      server.middlewares.use('/api/ai/br-ocr', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', async () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8')
            const body = raw ? JSON.parse(raw) : {}
            const imageDataUrl = body?.imageDataUrl
            if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid imageDataUrl' }))
              return
            }

            const tencentSecretId =
              (req.headers?.['x-tencent-secret-id'] as string | undefined) ||
              (req.headers?.['X-TENCENT-SECRET-ID'] as string | undefined) ||
              ''
            const tencentSecretKey =
              (req.headers?.['x-tencent-secret-key'] as string | undefined) ||
              (req.headers?.['X-TENCENT-SECRET-KEY'] as string | undefined) ||
              ''

            if (!tencentSecretId || !tencentSecretKey) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Tencent OCR credentials are not configured' }))
              return
            }

            const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : ''
            if (!base64) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid imageDataUrl' }))
              return
            }

            const tencentcloudModule: any = await import('tencentcloud-sdk-nodejs')
            const tencentcloud = tencentcloudModule?.default || tencentcloudModule
            const OcrClient = tencentcloud?.ocr?.v20181119?.Client
            if (!OcrClient) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Tencent OCR SDK is not available' }))
              return
            }

            const ocrClient = new OcrClient({
              credential: {
                secretId: tencentSecretId,
                secretKey: tencentSecretKey,
              },
              region: 'ap-hongkong',
              profile: {
                httpProfile: {
                  endpoint: 'ocr.tencentcloudapi.com',
                },
              },
            })

            let extractedText = ''
            let detections: any[] = []
            try {
              const ocrResp = await ocrClient.GeneralAccurateOCR({ ImageBase64: base64 })
              const list = Array.isArray(ocrResp?.TextDetections) ? ocrResp.TextDetections : []
              detections = list
              extractedText = list.map((t: any) => t?.DetectedText).filter(Boolean).join('\n')
            } catch (e: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Tencent OCR failed', detail: String(e?.message || e) }))
              return
            }
            const parsed = extractBrOcrFields(detections, extractedText)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                name: typeof parsed.name === 'string' ? parsed.name : '',
                english_name: typeof parsed.english_name === 'string' ? parsed.english_name : '',
                business_registration_number:
                  typeof parsed.business_registration_number === 'string' ? parsed.business_registration_number : '',
                company_address: typeof parsed.company_address === 'string' ? parsed.company_address : '',
                business_type: typeof parsed.business_type === 'string' ? parsed.business_type : '',
              })
            )
          } catch (e: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Unexpected error', detail: String(e?.message || e) }))
          }
        })
      })

      server.middlewares.use('/api/wechat/exchange', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', async () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8')
            const body = raw ? JSON.parse(raw) : {}
            const code = body?.code
            const appid =
              (req.headers?.['x-wechat-appid'] as string | undefined) ||
              (req.headers?.['X-WECHAT-APPID'] as string | undefined) ||
              ''
            const secret =
              (req.headers?.['x-wechat-appsecret'] as string | undefined) ||
              (req.headers?.['X-WECHAT-APPSECRET'] as string | undefined) ||
              ''

            if (!appid || !secret) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'WeChat credentials are not configured' }))
              return
            }
            if (!code || typeof code !== 'string') {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid code' }))
              return
            }

            const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
            url.searchParams.set('appid', appid)
            url.searchParams.set('secret', secret)
            url.searchParams.set('code', code)
            url.searchParams.set('grant_type', 'authorization_code')

            const resp = await fetch(url.toString(), { method: 'GET' })
            const text = await resp.text()
            let data: any = null
            try {
              data = text ? JSON.parse(text) : null
            } catch {
              data = null
            }

            if (!resp.ok) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'WeChat exchange failed', detail: text }))
              return
            }
            if (data?.errcode) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'WeChat exchange failed', detail: data }))
              return
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                access_token: data?.access_token,
                expires_in: data?.expires_in,
                refresh_token: data?.refresh_token,
                openid: data?.openid,
                scope: data?.scope,
                unionid: data?.unionid,
              })
            )
          } catch (e: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Unexpected error', detail: String(e?.message || e) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.AI_GATEWAY_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
    process.env.AI_GATEWAY_API_KEY = env.AI_GATEWAY_API_KEY;
  }

  return {
  server: {
    port: 5176,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://119.91.50.192',
        changeOrigin: true,
        bypass: (req) => {
          if (req.url?.startsWith('/api/ai/') || req.url?.startsWith('/api/wechat/') || req.url?.startsWith('/api/auth/check-username')) return req.url
          return undefined
        },
      },
    },
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    brOcrDevPlugin(),
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }), 
    tsconfigPaths()
  ],
  }
})
