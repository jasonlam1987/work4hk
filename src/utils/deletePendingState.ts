const KEY = 'work4hk_delete_pending_state_v1';

type PendingState = {
  byUid: Record<string, number>;
};

const readState = (): PendingState => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      byUid: parsed?.byUid && typeof parsed.byUid === 'object' ? parsed.byUid : {},
    };
  } catch {
    return { byUid: {} };
  }
};

const writeState = (state: PendingState) => {
  localStorage.setItem(KEY, JSON.stringify(state));
};

export const markDeletePending = (uid: string) => {
  const id = String(uid || '').trim();
  if (!id) return;
  const state = readState();
  state.byUid[id] = Date.now();
  writeState(state);
};

export const releaseDeletePending = (uid: string) => {
  const id = String(uid || '').trim();
  if (!id) return;
  const state = readState();
  if (!state.byUid[id]) return;
  delete state.byUid[id];
  writeState(state);
};

export const getDeletePendingCount = () => Object.keys(readState().byUid).length;
