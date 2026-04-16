export type InAppMessage = {
  id: string;
  kind?: 'delete_review' | 'generic';
  title: string;
  content: string;
  status?: 'APPROVED' | 'REJECTED';
  fileName?: string;
  rejectReason?: string;
  operatedAt?: string;
  operatorName?: string;
  createdAt: number;
  readAt?: number;
  recipientUserId?: string;
  recipientRoleKey?: string;
};

const KEY = 'work4hk_in_app_messages_v1';
const CHANNEL = 'work4hk-in-app-messages';

const readAll = (): InAppMessage[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeAll = (rows: InAppMessage[]) => {
  localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 300)));
};

const broadcast = () => {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ at: Date.now() });
    ch.close();
  } catch {
  }
};

export const pushInAppMessage = (msg: Omit<InAppMessage, 'id' | 'createdAt'>) => {
  const rows = readAll();
  rows.unshift({
    ...msg,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  });
  writeAll(rows);
  broadcast();
};

const matched = (row: InAppMessage, userId: string, roleKey: string) => {
  const uid = String(userId || '').trim();
  const role = String(roleKey || '').trim().toLowerCase();
  if (!row.recipientUserId && !row.recipientRoleKey) return true;
  if (row.recipientUserId && uid && String(row.recipientUserId) === uid) return true;
  if (row.recipientRoleKey && role && String(row.recipientRoleKey).toLowerCase() === role) return true;
  return false;
};

export const getInAppMessages = (userId: string, roleKey: string) =>
  readAll().filter((row) => matched(row, userId, roleKey));

export const getUnreadInAppCount = (userId: string, roleKey: string) =>
  getInAppMessages(userId, roleKey).filter((row) => !row.readAt).length;

export const markInAppMessageRead = (id: string) => {
  const rows = readAll().map((row) => (row.id === id ? { ...row, readAt: Date.now() } : row));
  writeAll(rows);
  broadcast();
};

export const markAllInAppRead = (userId: string, roleKey: string) => {
  const target = getInAppMessages(userId, roleKey).map((x) => x.id);
  if (!target.length) return;
  const set = new Set(target);
  const rows = readAll().map((row) => (set.has(row.id) ? { ...row, readAt: Date.now() } : row));
  writeAll(rows);
  broadcast();
};

export const subscribeInAppMessages = (onChange: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => onChange();
  } catch {
    ch = null;
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    if (ch) ch.close();
  };
};
