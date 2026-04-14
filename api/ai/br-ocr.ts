import { extractBrOcrFields } from '../../server/brOcrExtract.js'

const json = (res: any, status: number, body: any) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method Not Allowed' })
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

  const imageDataUrl = req.body?.imageDataUrl
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    json(res, 400, { error: 'Invalid imageDataUrl' })
    return
  }

  if (!tencentSecretId || !tencentSecretKey) {
    json(res, 400, { error: 'Tencent OCR credentials are not configured' })
    return
  }

  const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : ''
  if (!base64) {
    json(res, 400, { error: 'Invalid imageDataUrl' })
    return
  }

  let extractedText = ''
  let detections: any[] = []
  try {
    const tencentcloudModule: any = await import('tencentcloud-sdk-nodejs')
    const tencentcloud = tencentcloudModule?.default || tencentcloudModule
    const OcrClient = tencentcloud?.ocr?.v20181119?.Client
    if (!OcrClient) throw new Error('Tencent OCR SDK is not available')

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

    const ocrResp = await ocrClient.GeneralAccurateOCR({ ImageBase64: base64 })
    const list = Array.isArray(ocrResp?.TextDetections) ? ocrResp.TextDetections : []
    detections = list
    extractedText = list.map((t: any) => t?.DetectedText).filter(Boolean).join('\n')
  } catch (e: any) {
    json(res, 500, { error: 'Tencent OCR failed', detail: String(e?.message || e) })
    return
  }

  let parsed: any
  try {
    parsed = extractBrOcrFields(detections, extractedText)
  } catch (e: any) {
    json(res, 500, { error: 'BR parse failed', detail: String(e?.message || e) })
    return
  }

  json(res, 200, {
    name: typeof parsed.name === 'string' ? parsed.name : '',
    english_name: typeof parsed.english_name === 'string' ? parsed.english_name : '',
    business_registration_number:
      typeof parsed.business_registration_number === 'string' ? parsed.business_registration_number : '',
    company_address: typeof parsed.company_address === 'string' ? parsed.company_address : '',
    business_type: typeof parsed.business_type === 'string' ? parsed.business_type : '',
  })
}
