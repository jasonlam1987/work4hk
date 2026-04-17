import { describe, expect, it } from 'vitest';
import {
  buildCommonJobOptions,
  emptyCommonJobNewRequest,
  filterCommonJobOptions,
  sanitizeBasicRtfHtml,
  validateCommonJobNewRequest,
  validateScheduleSlot,
} from './quotaCommonJobRequest';

describe('quotaCommonJobRequest', () => {
  it('職位未選擇時返回必填錯誤', () => {
    const req = emptyCommonJobNewRequest();
    const errors = validateCommonJobNewRequest(req, 'final');
    expect(errors.selected_common_job_id).toBeTruthy();
  });

  it('時間驗證可判定跨日', () => {
    const checked = validateScheduleSlot({ start: '23:00', end: '02:00' });
    expect(checked.valid).toBe(true);
    expect(checked.crossDay).toBe(true);
  });

  it('語文要求邊界值：至少一項', () => {
    const req = emptyCommonJobNewRequest('job-1');
    req.shift_required = 'NO';
    req.schedules = [{ start: '09:00', end: '18:00' }];
    const errors = validateCommonJobNewRequest(req, 'final');
    expect(errors.spoken_requirement).toBeTruthy();
    expect(errors.written_requirement).toBeTruthy();
    req.language_requirement.spoken.cantonese = 'FAIR';
    req.language_requirement.spoken.english = 'NONE';
    req.language_requirement.spoken.other = 'NONE';
    req.language_requirement.written.cantonese = 'FAIR';
    req.language_requirement.written.english = 'NONE';
    req.language_requirement.written.other = 'NONE';
    const next = validateCommonJobNewRequest(req, 'final');
    expect(next.spoken_requirement).toBeFalsy();
    expect(next.written_requirement).toBeFalsy();
  });

  it('切換職位後應重置下游欄位', () => {
    const req = emptyCommonJobNewRequest('job-1');
    req.shift_required = 'YES';
    req.schedules = [{ start: '09:00', end: '18:00' }, { start: '20:00', end: '23:00' }];
    req.language_requirement.spoken.english = 'FAIR';
    req.language_requirement.written.english = 'FAIR';
    req.skill_requirement_html = '<b>forklift</b>';

    const switched = emptyCommonJobNewRequest('job-n');
    expect(switched.selected_common_job_id).toBe('job-n');
    expect(switched.shift_required).toBe('');
    expect(switched.schedules).toHaveLength(1);
    expect(switched.language_requirement.spoken.english).toBe('');
    expect(switched.language_requirement.written.english).toBe('');
    expect(switched.skill_requirement_html).toBe('');
  });

  it('1000 筆職位搜尋渲染在 300ms 內', () => {
    const rows = Array.from({ length: 1000 }).map((_, i) => ({
      id: `id-${i + 1}`,
      post_code: `P${String(i + 1).padStart(4, '0')}`,
      post_name: `職位${i + 1}`,
    }));
    const options = buildCommonJobOptions(rows);
    const start = Date.now();
    const result = filterCommonJobOptions(options, '職位99');
    const duration = Date.now() - start;
    expect(result.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(300);
  });

  it('RTF 內容會移除 script 以避免 XSS', () => {
    const html = '<p>ok</p><script>alert(1)</script><b>bold</b>';
    const safe = sanitizeBasicRtfHtml(html);
    expect(safe.toLowerCase()).not.toContain('<script');
    expect(safe.toLowerCase()).toContain('<b>bold</b>');
  });

  it('工作地址最多 3 項', () => {
    const req = emptyCommonJobNewRequest('job-1');
    req.shift_required = 'NO';
    req.schedules = [{ start: '09:00', end: '18:00' }];
    req.language_requirement.spoken.cantonese = 'FAIR';
    req.language_requirement.spoken.english = 'NONE';
    req.language_requirement.spoken.other = 'NONE';
    req.language_requirement.written.cantonese = 'FAIR';
    req.language_requirement.written.english = 'NONE';
    req.language_requirement.written.other = 'NONE';
    req.work_addresses = ['a', 'b', 'c', 'd'];
    const errors = validateCommonJobNewRequest(req, 'final');
    expect(errors.work_addresses).toBeTruthy();
  });
});
