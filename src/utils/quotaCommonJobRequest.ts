export type ShiftRequirement = '' | 'NO' | 'YES';
export type LanguageLevel = '' | 'NONE' | 'LITTLE' | 'FAIR';

export type WorkScheduleSlot = {
  start: string;
  end: string;
};

export type LanguageRequirement = {
  spoken: {
    cantonese: LanguageLevel;
    english: LanguageLevel;
    other: LanguageLevel;
  };
  written: {
    cantonese: LanguageLevel;
    english: LanguageLevel;
    other: LanguageLevel;
  };
  other_language_name: string;
};

export type CommonJobNewRequest = {
  selected_common_job_id: string;
  shift_required: ShiftRequirement;
  schedules: WorkScheduleSlot[];
  work_addresses: string[];
  language_requirement: LanguageRequirement;
  skill_requirement_html: string;
};

export type CommonJobOption = {
  id: string;
  label: string;
  post_code: string;
  post_name: string;
};

export type NewRequestValidationErrors = {
  selected_common_job_id?: string;
  shift_required?: string;
  schedules?: string;
  work_addresses?: string;
  language_requirement?: string;
  spoken_requirement?: string;
  written_requirement?: string;
  other_language?: string;
  skill_requirement_html?: string;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const emptyLanguageRequirement = (): LanguageRequirement => ({
  spoken: {
    cantonese: '',
    english: '',
    other: '',
  },
  written: {
    cantonese: '',
    english: '',
    other: '',
  },
  other_language_name: '',
});

export const emptyCommonJobNewRequest = (jobId = ''): CommonJobNewRequest => ({
  selected_common_job_id: jobId,
  shift_required: '',
  schedules: [{ start: '', end: '' }],
  work_addresses: [''],
  language_requirement: emptyLanguageRequirement(),
  skill_requirement_html: '',
});

export const buildCommonJobOptions = (
  commonJobs: Array<{ id: string; post_code?: string; post_name?: string }>
): CommonJobOption[] => {
  return commonJobs.map((row) => {
    const code = String(row.post_code || '').trim();
    const name = String(row.post_name || '').trim();
    return {
      id: String(row.id || '').trim(),
      post_code: code,
      post_name: name,
      label: code && name ? `${code} - ${name}` : name || code || '未命名職位',
    };
  });
};

export const filterCommonJobOptions = (options: CommonJobOption[], query: string): CommonJobOption[] => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => `${opt.post_code} ${opt.post_name} ${opt.label}`.toLowerCase().includes(q));
};

export const isValidHHmm = (value: string) => TIME_RE.test(String(value || '').trim());

const minutesOf = (value: string) => {
  const m = String(value || '').match(TIME_RE);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
};

export const validateScheduleSlot = (slot: WorkScheduleSlot) => {
  const start = String(slot.start || '').trim();
  const end = String(slot.end || '').trim();
  if (!isValidHHmm(start) || !isValidHHmm(end)) {
    return { valid: false, crossDay: false, message: '請輸入 HH:mm 時間格式' };
  }
  const startM = minutesOf(start);
  const endM = minutesOf(end);
  if (startM === endM) {
    return { valid: false, crossDay: false, message: '開始時間與結束時間不可相同' };
  }
  if (endM < startM) {
    return { valid: true, crossDay: true, message: '此時段為跨日班次（翌日結束）' };
  }
  return { valid: true, crossDay: false, message: '' };
};

export const stripHtmlToText = (html: string) =>
  String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const sanitizeBasicRtfHtml = (html: string) => {
  let out = String(html || '');
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  out = out.replace(/on\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/on\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/javascript:/gi, '');
  out = out.replace(/<(?!\/?(b|strong|ul|ol|li|br|p)\b)[^>]*>/gi, '');
  return out;
};

export const validateCommonJobNewRequest = (
  req: CommonJobNewRequest,
  mode: 'draft' | 'final'
): NewRequestValidationErrors => {
  const errors: NewRequestValidationErrors = {};
  const selectedId = String(req.selected_common_job_id || '').trim();
  const shiftRequired = req.shift_required;

  if (!selectedId) errors.selected_common_job_id = '請先選擇職位';
  if (!shiftRequired) errors.shift_required = '請選擇是否需要輪班';

  const rawSlots = Array.isArray(req.schedules) ? req.schedules : [];
  const slotLimit = shiftRequired === 'YES' ? 5 : 1;
  const slots = rawSlots.slice(0, slotLimit);
  const needValidateSchedules = mode === 'final' || Boolean(shiftRequired);
  if (needValidateSchedules) {
    if (slots.length === 0) {
      errors.schedules = '請至少填寫一組工作時間';
    } else if (shiftRequired !== 'YES' && slots.length > 1) {
      errors.schedules = '不需要輪班時只可填寫一組時段';
    } else if (shiftRequired === 'YES' && slots.length > 5) {
      errors.schedules = '輪班時段最多可填寫五組';
    } else {
      const slotErr = slots.find((slot) => !validateScheduleSlot(slot).valid);
      if (slotErr) errors.schedules = validateScheduleSlot(slotErr).message;
    }
  }

  const addresses = Array.isArray(req.work_addresses) ? req.work_addresses : [];
  if (addresses.length > 3) {
    errors.work_addresses = '工作地址最多可填寫 3 項';
  }

  const lang = req.language_requirement || emptyLanguageRequirement();
  const spoken = lang.spoken || emptyLanguageRequirement().spoken;
  const written = lang.written || emptyLanguageRequirement().written;
  const validLevel = (v: LanguageLevel) => ['NONE', 'LITTLE', 'FAIR'].includes(String(v || ''));
  const spokenComplete = validLevel(spoken.cantonese) && validLevel(spoken.english) && validLevel(spoken.other);
  const writtenComplete = validLevel(written.cantonese) && validLevel(written.english) && validLevel(written.other);

  if (mode === 'final' && !spokenComplete) {
    errors.spoken_requirement = '請完整填寫「會話」語文等級（粵語/英語/其他）';
  }
  if (mode === 'final' && !writtenComplete) {
    errors.written_requirement = '請完整填寫「讀寫」語文等級（粵語/英語/其他）';
  }
  const otherLanguageTouched = spoken.other !== 'NONE' || written.other !== 'NONE';
  if (otherLanguageTouched && !String(lang.other_language_name || '').trim()) {
    errors.other_language = '選擇「其他語言」為略懂/一般時需輸入語言名稱';
  }

  const sanitized = sanitizeBasicRtfHtml(req.skill_requirement_html);
  const plainLen = stripHtmlToText(sanitized).length;
  if (plainLen > 500) {
    errors.skill_requirement_html = '技能與其他要求不可超過 500 字';
  }

  return errors;
};
