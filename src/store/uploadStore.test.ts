import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUploadStore } from './uploadStore';

describe('uploadStore lifecycle', () => {
  afterEach(() => {
    useUploadStore.setState({ tasksByScope: {} });
    vi.useRealTimers();
  });

  it('auto clears successful task within 500ms', () => {
    vi.useFakeTimers();
    const scope = 'employers:1:企業資料';
    const key = 'f1';
    const store = useUploadStore.getState();
    store.beginTask(scope, key, 'a.pdf');
    store.succeedTask(scope, key);
    expect(Object.keys(useUploadStore.getState().tasksByScope[scope] || {})).toContain(key);
    vi.advanceTimersByTime(500);
    expect(Object.keys(useUploadStore.getState().tasksByScope[scope] || {})).not.toContain(key);
  });

  it('keeps failed task for retry', () => {
    const scope = 'workers:2:證件資料';
    const key = 'f2';
    const store = useUploadStore.getState();
    store.beginTask(scope, key, 'b.pdf');
    store.failTask(scope, key, '上傳失敗');
    const task = useUploadStore.getState().tasksByScope[scope][key];
    expect(task.error).toBe('上傳失敗');
    expect(task.percent).toBe(100);
  });

  it('clears concurrent successful tasks in 500ms window', () => {
    vi.useFakeTimers();
    const scope = 'approvals:9:批文文件';
    const store = useUploadStore.getState();
    const keys = ['k1', 'k2', 'k3', 'k4', 'k5'];
    keys.forEach(k => {
      store.beginTask(scope, k, `${k}.pdf`);
      store.succeedTask(scope, k);
    });
    expect(Object.keys(useUploadStore.getState().tasksByScope[scope] || {}).length).toBe(5);
    vi.advanceTimersByTime(500);
    expect(Object.keys(useUploadStore.getState().tasksByScope[scope] || {}).length).toBe(0);
  });
});
