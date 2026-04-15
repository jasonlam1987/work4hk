export type WorkerWorkExperience = {
  company_name: string
  start_date: string
  end_date: string
}

export type WorkerEducation = {
  school_name: string
  start_date: string
  graduation_date: string
}

export type WorkerProfile = {
  approval_id?: number
  approval_number?: string
  pinyin_name?: string
  phone_code?: '+86' | '+852' | '+853'
  phone_number?: string
  contact_phone?: string
  residential_address?: string
  mailing_address?: string
  marital_status?: 'married' | 'single' | 'divorced'
  entry_refused?: boolean
  entry_refused_date?: string
  entry_refused_reason?: string
  work_experiences?: WorkerWorkExperience[]
  educations?: WorkerEducation[]
  files?: {
    id_docs?: Array<{ uid: string; original_name: string; size: number; mime_type: string }>
    education_docs?: Array<{ uid: string; original_name: string; size: number; mime_type: string }>
    work_docs?: Array<{ uid: string; original_name: string; size: number; mime_type: string }>
  }
}

const STORAGE_KEY = 'worker_profiles_v1'

export const getWorkerProfile = (workerId: number): WorkerProfile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const v = (parsed as any)[String(workerId)]
    return v && typeof v === 'object' ? (v as WorkerProfile) : {}
  } catch {
    return {}
  }
}

export const setWorkerProfile = (workerId: number, profile: WorkerProfile) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const next = parsed && typeof parsed === 'object' ? parsed : {}
    ;(next as any)[String(workerId)] = profile
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
  }
}

export const deleteWorkerProfile = (workerId: number) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    delete (parsed as any)[String(workerId)]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch {
  }
}
