import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { extractBrOcrFields } from './server/brOcrExtract'
import filesHandler from './api/ai/files'
import filesDownloadHandler from './api/ai/files-download'
import workerFilesHandler from './api/ai/worker-files'
import csrfHandler from './api/ai/csrf'
import filesDeleteHandler from './api/ai/files-delete'
import filesDeleteRequestHandler from './api/ai/files-delete-request'
import filesDeleteReviewHandler from './api/ai/files-delete-review'
import filesDeleteRequestsHandler from './api/ai/files-delete-requests'
import filesDeleteRequestsPruneHandler from './api/ai/files-delete-requests-prune'
import globalAuditLogsHandler from './api/ai/global-audit-logs'
import checkUsernameHandler from './api/auth/check-username'
import authLoginHandler from './api/auth/login'
import checkUserUniqueHandler from './api/auth/check-user-unique'
import resolveLoginIdentityHandler from './api/auth/resolve-login-identity'
import changePasswordHandler from './api/auth/change-password'

const brOcrDevPlugin = () => {
  return {
    name: 'br-ocr-dev',
    configureServer(server: any) {
      const attachQuery = (req: any) => {
        const rawUrl = String(req?.url || '');
        const u = new URL(rawUrl, 'http://localhost');
        req.query = Object.fromEntries(u.searchParams.entries());
      };

      server.middlewares.use('/api/ai/files', async (req: any, res: any) => {
        attachQuery(req);
        return filesHandler(req, res);
      });

      server.middlewares.use('/api/ai/files-download', async (req: any, res: any) => {
        attachQuery(req);
        return filesDownloadHandler(req, res);
      });

      server.middlewares.use('/api/ai/worker-files', async (req: any, res: any) => {
        attachQuery(req);
        return workerFilesHandler(req, res);
      });

      server.middlewares.use('/api/ai/csrf', async (req: any, res: any) => {
        attachQuery(req);
        return csrfHandler(req, res);
      });

      server.middlewares.use('/api/ai/files-delete', async (req: any, res: any) => {
        attachQuery(req);
        return filesDeleteHandler(req, res);
      });

      server.middlewares.use('/api/ai/files-delete-request', async (req: any, res: any) => {
        attachQuery(req);
        return filesDeleteRequestHandler(req, res);
      });

      server.middlewares.use('/api/ai/files-delete-review', async (req: any, res: any) => {
        attachQuery(req);
        return filesDeleteReviewHandler(req, res);
      });

      server.middlewares.use('/api/ai/files-delete-requests', async (req: any, res: any) => {
        attachQuery(req);
        return filesDeleteRequestsHandler(req, res);
      });

      server.middlewares.use('/api/ai/files-delete-requests-prune', async (req: any, res: any) => {
        attachQuery(req);
        return filesDeleteRequestsPruneHandler(req, res);
      });

      server.middlewares.use('/api/ai/global-audit-logs', async (req: any, res: any) => {
        attachQuery(req);
        return globalAuditLogsHandler(req, res);
      });

      server.middlewares.use('/api/auth/check-username', async (req: any, res: any) => {
        attachQuery(req);
        return checkUsernameHandler(req, res);
      });
      server.middlewares.use('/api/auth/login', async (req: any, res: any) => {
        attachQuery(req);
        return authLoginHandler(req, res);
      });

      server.middlewares.use('/api/auth/check-user-unique', async (req: any, res: any) => {
        attachQuery(req);
        return checkUserUniqueHandler(req, res);
      });

      server.middlewares.use('/api/auth/resolve-login-identity', async (req: any, res: any) => {
        attachQuery(req);
        return resolveLoginIdentityHandler(req, res);
      });

      server.middlewares.use('/api/auth/change-password', async (req: any, res: any) => {
        attachQuery(req);
        return changePasswordHandler(req, res);
      });

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
              (process.env.WECHAT_APPID ? String(process.env.WECHAT_APPID).trim() : '') ||
              (req.headers?.['x-wechat-appid'] as string | undefined) ||
              (req.headers?.['X-WECHAT-APPID'] as string | undefined) ||
              ''
            const secret =
              (process.env.WECHAT_APPSECRET ? String(process.env.WECHAT_APPSECRET).trim() : '') ||
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

      server.middlewares.use('/api/wechat/userinfo', async (req: any, res: any) => {
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
            const accessToken = typeof body?.access_token === 'string' ? body.access_token.trim() : ''
            const openid = typeof body?.openid === 'string' ? body.openid.trim() : ''
            const lang = typeof body?.lang === 'string' ? body.lang.trim() : 'zh_CN'

            if (!accessToken || !openid) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid access_token/openid' }))
              return
            }

            const url = new URL('https://api.weixin.qq.com/sns/userinfo')
            url.searchParams.set('access_token', accessToken)
            url.searchParams.set('openid', openid)
            url.searchParams.set('lang', lang)

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
              res.end(JSON.stringify({ error: 'WeChat userinfo failed', detail: text }))
              return
            }
            if (data?.errcode) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'WeChat userinfo failed', detail: data }))
              return
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
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
  if (env.WECHAT_APPID && !process.env.WECHAT_APPID) {
    process.env.WECHAT_APPID = env.WECHAT_APPID;
  }
  if (env.WECHAT_APPSECRET && !process.env.WECHAT_APPSECRET) {
    process.env.WECHAT_APPSECRET = env.WECHAT_APPSECRET;
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
          if (req.url?.startsWith('/api/ai/') || req.url?.startsWith('/api/wechat/') || req.url?.startsWith('/api/auth/check-username') || req.url?.startsWith('/api/auth/login') || req.url?.startsWith('/api/auth/check-user-unique') || req.url?.startsWith('/api/auth/resolve-login-identity') || req.url?.startsWith('/api/auth/change-password')) return req.url
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
