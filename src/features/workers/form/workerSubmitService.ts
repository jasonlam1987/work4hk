import { Employer } from '../../../api/employers';
import { WorkerCreate } from '../../../api/workers';
import { WorkerProfile, WorkerWorkExperience, WorkerEducation } from '../../../utils/workerProfile';
import {
  formatEmploymentMonths,
  isMainlandId,
  isPhoneNumber,
  labourStatusToApi,
  normalizeDate,
  mergePhone,
} from '../../../utils/workersForm';

type SubmitValidationInput = {
  formData: WorkerCreate;
  profile: WorkerProfile;
  isEditing: boolean;
  employerId?: number;
  approvalId?: number;
  selectedQuotaSeq: string;
  quotaOptionsLength: number;
};

type BuildPayloadInput = {
  formData: WorkerCreate;
  profile: WorkerProfile;
  employerId?: number;
  approvalId?: number;
  selectedQuotaSeq: string;
  employerQuery: string;
  employers: Employer[];
};

const addMonths = (dateStr: string, months: number) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
};

const normalizeExperiences = (list?: WorkerWorkExperience[]) => {
  if (!Array.isArray(list)) return undefined;
  return list
    .map((x) => ({
      company_name: String(x.company_name || '').trim(),
      start_date: normalizeDate(String(x.start_date || '').trim()),
      end_date: normalizeDate(String(x.end_date || '').trim()),
    }))
    .filter((x) => x.company_name || x.start_date || x.end_date);
};

const normalizeEducations = (list?: WorkerEducation[]) => {
  if (!Array.isArray(list)) return undefined;
  return list
    .map((x) => ({
      school_name: String(x.school_name || '').trim(),
      start_date: normalizeDate(String(x.start_date || '').trim()),
      graduation_date: normalizeDate(String(x.graduation_date || '').trim()),
    }))
    .filter((x) => x.school_name || x.start_date || x.graduation_date);
};

export const validateWorkerSubmitInput = (input: SubmitValidationInput): string | null => {
  const { formData, profile, isEditing, employerId, approvalId, selectedQuotaSeq, quotaOptionsLength } = input;

  const labourName = String(formData.labour_name || '').trim();
  if (!labourName) return '請輸入中文名字';

  const idCard = String(formData.id_card_number || '').trim();
  if (!idCard) return '請輸入內地身份證號碼';
  if (!isMainlandId(idCard)) return '內地身份證號碼格式不正確（需 18 位，最後一位可為 X）';

  if (!employerId) return '請選擇僱主';
  if (!approvalId && !String(profile.approval_number || '').trim()) return '請選擇批文';
  if (approvalId && quotaOptionsLength > 0 && !selectedQuotaSeq) return '請選擇配額編號';

  const uiStatus = String(formData.labour_status || '辦證中');
  if (!isEditing && uiStatus !== '辦證中') return '首次錄入資料，勞工狀態只能為「辦證中」';
  if (uiStatus === '在職' && !String(profile.arrival_date || '').trim()) return '狀態為「在職」時，必須輸入赴港日期';
  if (uiStatus === '離職' && !String(profile.departure_date || '').trim()) return '狀態為「離職」時，必須輸入離港日期';

  const phoneNumber = String(profile.phone_number || '').trim();
  if (phoneNumber && !isPhoneNumber(phoneNumber)) return '電話號碼格式錯誤：請輸入 7-11 位數字';

  if (profile.entry_refused) {
    const d = String(profile.entry_refused_date || '').trim();
    const r = String(profile.entry_refused_reason || '').trim();
    if (!d || !r) return '請補充入境被拒的日期及原因';
  }

  return null;
};

export const buildWorkerSubmitPayload = (input: BuildPayloadInput) => {
  const { formData, profile, employerId, approvalId, selectedQuotaSeq, employerQuery, employers } = input;
  const labourName = String(formData.labour_name || '').trim();
  const idCard = String(formData.id_card_number || '').trim();
  const uiStatus = String(formData.labour_status || '辦證中');

  const phoneCode = String(profile.phone_code || '+852') as '+86' | '+852' | '+853';
  const phoneNumber = String(profile.phone_number || '').trim();

  const persistedProfile: WorkerProfile = {
    ...profile,
    quota_seq: selectedQuotaSeq || undefined,
    work_locations: Array.isArray(profile.work_locations) ? profile.work_locations.slice(0, 3) : [],
    contact_phone: mergePhone(phoneCode, phoneNumber) || undefined,
    phone_code: phoneCode,
    phone_number: phoneNumber || undefined,
    arrival_date: profile.arrival_date ? normalizeDate(profile.arrival_date) : undefined,
    departure_date: profile.departure_date ? normalizeDate(profile.departure_date) : undefined,
  };

  const months = Number(String(formData.employment_term || '').replace(/[^\d]/g, ''));
  const startDate = persistedProfile.arrival_date || '';
  const expiresAt = uiStatus === '在職' && startDate && months > 0 ? addMonths(startDate, months) : '';
  const employerName = employers.find((e) => e.id === employerId)?.name || employerQuery || '';

  const currentBatchId =
    `${String(employerId || '')}|${String(approvalId || persistedProfile.approval_id || '')}|${startDate}|${uiStatus}`;
  const prevBatches = Array.isArray(persistedProfile.work_batches) ? persistedProfile.work_batches : [];
  const nextBatch =
    uiStatus === '在職' || uiStatus === '離職'
      ? {
          id: currentBatchId,
          employer_id: employerId,
          employer_name: employerName,
          approval_id: approvalId || persistedProfile.approval_id,
          approval_number: String(profile.approval_number || '').trim() || persistedProfile.approval_number,
          quota_seq: selectedQuotaSeq || persistedProfile.quota_seq,
          status: uiStatus as '辦證中' | '在職' | '離職',
          start_date: startDate || undefined,
          departure_date: uiStatus === '離職' ? persistedProfile.departure_date : undefined,
          employment_term_months: months > 0 ? months : undefined,
          expires_at: expiresAt || undefined,
        }
      : null;
  persistedProfile.work_batches = nextBatch
    ? [nextBatch, ...prevBatches.filter((b) => b?.id !== nextBatch.id)]
    : prevBatches;

  const fullPayload: WorkerCreate = {
    ...formData,
    labour_name: labourName,
    id_card_number: idCard,
    labour_status: labourStatusToApi(uiStatus),
    employer_id: employerId,
    approval_id: approvalId,
    approval_number: String(profile.approval_number || '').trim() || undefined,
    quota_seq: selectedQuotaSeq || undefined,
    pinyin_name: String(profile.pinyin_name || '').trim() || undefined,
    contact_phone: mergePhone(phoneCode, phoneNumber) || undefined,
    residential_address: String(profile.residential_address || '').trim() || undefined,
    mailing_address: String(profile.mailing_address || '').trim() || undefined,
    work_locations: Array.isArray(persistedProfile.work_locations) ? persistedProfile.work_locations : undefined,
    marital_status: profile.marital_status,
    contract_salary: String(formData.contract_salary || '').trim() || undefined,
    employment_term: formatEmploymentMonths(formData.employment_term) || undefined,
    arrival_date: persistedProfile.arrival_date,
    departure_date: persistedProfile.departure_date,
    employment_expires_at: expiresAt || undefined,
    entry_refused: Boolean(profile.entry_refused),
    entry_refused_date: profile.entry_refused_date ? normalizeDate(profile.entry_refused_date) : undefined,
    entry_refused_reason: String(profile.entry_refused_reason || '').trim() || undefined,
    file_uids: {
      id_docs: (profile.files?.id_docs || []).map((x) => x.uid),
      education_docs: (profile.files?.education_docs || []).map((x) => x.uid),
      work_docs: (profile.files?.work_docs || []).map((x) => x.uid),
    },
    work_experiences: normalizeExperiences(profile.work_experiences),
    educations: normalizeEducations(profile.educations),
  };

  return {
    labourName,
    idCard,
    uiStatus,
    persistedProfile,
    fullPayload,
  };
};
