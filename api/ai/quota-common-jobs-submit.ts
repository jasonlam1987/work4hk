import { readJsonBody, respond, verifyRole } from './_file_store.js';

export const config = { runtime: 'nodejs' };

type WorkScheduleSlot = { start?: string; end?: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidHHmm = (v: string) => TIME_RE.test(String(v || '').trim());

const timeToMinutes = (v: string) => {
  const m = String(v || '').match(TIME_RE);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
};

const sanitizeBasicRtfHtml = (html: string) => {
  let out = String(html || '');
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  out = out.replace(/on\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/on\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/javascript:/gi, '');
  out = out.replace(/<(?!\/?(b|strong|ul|ol|li|br|p)\b)[^>]*>/gi, '');
  return out;
};

const stripHtmlToText = (html: string) =>
  String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const validateSlot = (slot: WorkScheduleSlot) => {
  const start = String(slot?.start || '').trim();
  const end = String(slot?.end || '').trim();
  if (!isValidHHmm(start) || !isValidHHmm(end)) {
    return { ok: false, code: 'INVALID_TIME_FORMAT', message: '工作時間需為 HH:mm 格式' };
  }
  const startM = timeToMinutes(start);
  const endM = timeToMinutes(end);
  if (startM === endM) {
    return { ok: false, code: 'INVALID_TIME_RANGE', message: '開始與結束時間不可相同' };
  }
  return { ok: true, crossDay: endM < startM };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return respond(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  if (!verifyRole(req)) return respond(res, 403, { ok: false, code: 'FORBIDDEN' });
  try {
    const body = await readJsonBody(req);
    const commonJobs = Array.isArray(body?.common_jobs) ? body.common_jobs : [];
    const requestList = Array.isArray(body?.common_job_new_requests)
      ? body.common_job_new_requests
      : body?.common_job_new_request
      ? [body.common_job_new_request]
      : [];
    const errors: Array<{ code: string; field: string; message: string }> = [];
    const crossDayMap: Record<number, number[]> = {};
    const sanitizedMap: Record<number, { skill_requirement_html: string }> = {};

    for (let reqIndex = 0; reqIndex < requestList.length; reqIndex += 1) {
      const request = requestList[reqIndex] || {};
      const selectedId = String(request?.selected_common_job_id || '').trim();
      const shiftRequired = String(request?.shift_required || '').trim();
      const schedules = Array.isArray(request?.schedules) ? request.schedules : [];
      const workAddresses = Array.isArray(request?.work_addresses) ? request.work_addresses : [];
      const language = request?.language_requirement || {};

      if (!selectedId) {
        errors.push({ code: 'POSITION_REQUIRED', field: `common_job_new_requests[${reqIndex}].selected_common_job_id`, message: '請先選擇職位' });
      } else if (!commonJobs.some((x: any) => String(x?.id || '').trim() === selectedId)) {
        errors.push({ code: 'POSITION_NOT_FOUND', field: `common_job_new_requests[${reqIndex}].selected_common_job_id`, message: '所選職位不存在' });
      }

      if (!['NO', 'YES'].includes(shiftRequired)) {
        errors.push({ code: 'SHIFT_REQUIRED_INVALID', field: `common_job_new_requests[${reqIndex}].shift_required`, message: '請選擇是否需要輪班' });
      }
      if (shiftRequired === 'NO' && schedules.length !== 1) {
        errors.push({ code: 'SCHEDULE_COUNT_INVALID', field: `common_job_new_requests[${reqIndex}].schedules`, message: '不需輪班時僅可設定一組時段' });
      }
      if (shiftRequired === 'YES' && (schedules.length < 1 || schedules.length > 5)) {
        errors.push({ code: 'SCHEDULE_COUNT_INVALID', field: `common_job_new_requests[${reqIndex}].schedules`, message: '輪班時段需為 1 到 5 組' });
      }
      if (workAddresses.length > 3) {
        errors.push({
          code: 'WORK_ADDRESS_COUNT_INVALID',
          field: `common_job_new_requests[${reqIndex}].work_addresses`,
          message: '工作地址最多可填寫 3 項',
        });
      }

      const crossDayIndexes: number[] = [];
      for (let i = 0; i < schedules.length; i += 1) {
        const checked = validateSlot(schedules[i]);
        if (!checked.ok) {
          errors.push({ code: checked.code, field: `common_job_new_requests[${reqIndex}].schedules[${i}]`, message: checked.message });
        } else if (checked.crossDay) {
          crossDayIndexes.push(i);
        }
      }
      crossDayMap[reqIndex] = crossDayIndexes;

      const spoken = language?.spoken || {};
      const written = language?.written || {};
      const validLevel = (v: any) => ['NONE', 'LITTLE', 'FAIR'].includes(String(v || ''));
      const spokenComplete = validLevel(spoken?.cantonese) && validLevel(spoken?.english) && validLevel(spoken?.other);
      const writtenComplete = validLevel(written?.cantonese) && validLevel(written?.english) && validLevel(written?.other);
      if (!spokenComplete) {
        errors.push({
          code: 'SPOKEN_LANGUAGE_INVALID',
          field: `common_job_new_requests[${reqIndex}].language_requirement.spoken`,
          message: '請完整填寫會話語文等級（粵語/英語/其他）',
        });
      }
      if (!writtenComplete) {
        errors.push({
          code: 'WRITTEN_LANGUAGE_INVALID',
          field: `common_job_new_requests[${reqIndex}].language_requirement.written`,
          message: '請完整填寫讀寫語文等級（粵語/英語/其他）',
        });
      }
      const otherLanguageTouched = String(spoken?.other || '') !== 'NONE' || String(written?.other || '') !== 'NONE';
      if (otherLanguageTouched && !String(language?.other_language_name || '').trim()) {
        errors.push({
          code: 'OTHER_LANGUAGE_REQUIRED',
          field: `common_job_new_requests[${reqIndex}].language_requirement.other_language_name`,
          message: '其他語言為略懂/一般時，請輸入語言名稱',
        });
      }

      const sanitizedSkill = sanitizeBasicRtfHtml(String(request?.skill_requirement_html || ''));
      const skillPlainLength = stripHtmlToText(sanitizedSkill).length;
      if (skillPlainLength > 500) {
        errors.push({ code: 'SKILL_REQUIREMENT_TOO_LONG', field: `common_job_new_requests[${reqIndex}].skill_requirement_html`, message: '技能與其他要求不可超過 500 字' });
      }
      sanitizedMap[reqIndex] = { skill_requirement_html: sanitizedSkill };
    }

    if (errors.length > 0) {
      return respond(res, 422, { ok: false, code: 'VALIDATION_FAILED', errors });
    }

    return respond(res, 200, {
      ok: true,
      code: 'QUOTA_COMMON_JOB_REQUEST_VALID',
      cross_day_indexes: crossDayMap,
      sanitized: sanitizedMap,
    });
  } catch (e: any) {
    return respond(res, 500, {
      ok: false,
      code: 'VALIDATION_INTERNAL_ERROR',
      error: String(e?.message || e),
    });
  }
}
