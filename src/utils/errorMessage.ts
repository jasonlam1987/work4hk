export const normalizeErrorMessage = (err: any, fallback = '操作失敗') => {
  const status = err?.response?.status as number | undefined;
  const data = err?.response?.data;

  const pickText = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val?.message === 'string') return val.message;
    if (typeof val?.detail === 'string') return val.detail;
    if (typeof val?.error === 'string') return val.error;
    if (Array.isArray(val?.detail) && val.detail.length > 0) {
      const first = val.detail[0];
      const loc = Array.isArray(first?.loc) ? first.loc.join('.') : '';
      const msg = typeof first?.msg === 'string' ? first.msg : '';
      return [loc, msg].filter(Boolean).join('：');
    }
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  };

  const core =
    pickText(data) ||
    (typeof err?.message === 'string' ? err.message : '') ||
    fallback;

  if (core.toLowerCase().includes('object object')) return status ? `HTTP ${status}：${fallback}` : fallback;
  return status ? `HTTP ${status}：${core}` : core;
};
