import apiClient from './client';
import { getAuthIdentity } from '../utils/authRole';

export type FileModule = 'employers' | 'approvals' | 'workers';

export type UploadProgress = {
  percent: number;
  remainingSeconds: number | null;
};

export type ManagedFile = {
  uid: string;
  module: FileModule;
  owner_id: number;
  folder: string;
  original_name: string;
  mime_type: string;
  size: number;
  sha256?: string;
  stored_path?: string;
  object_path?: string;
  uploader_id?: string;
  uploader_name?: string;
  download_url: string;
  token_expires_in?: number;
  created_at?: string;
};

export type UploadFileRequest = {
  module: FileModule;
  owner_id: number;
  folder: string;
  file: File;
  onProgress?: (p: UploadProgress) => void;
  retries?: number;
};

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('讀取檔案失敗'));
    r.readAsDataURL(file);
  });

const getUserRoleHeader = () => {
  const identity = getAuthIdentity();
  try {
    const raw = localStorage.getItem('auth-storage');
    const parsed = raw ? JSON.parse(raw) : null;
    const directRole = parsed?.state?.user?.role_key ?? parsed?.state?.user?.role;
    if (typeof directRole === 'string' && directRole.trim()) return directRole.trim();
    if (directRole && typeof directRole === 'object') {
      const nested =
        (directRole as any).role_key ??
        (directRole as any).key ??
        (directRole as any).name;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
    return identity.roleKey || 'admin';
  } catch {
    return identity.roleKey || 'admin';
  }
};

const getAuthHeaders = () => {
  const identity = getAuthIdentity();
  return {
    'x-user-role': getUserRoleHeader(),
    'x-user-id': String(identity.userId || ''),
    'x-user-name': String(identity.userName || ''),
  };
};

export const uploadManagedFile = async (req: UploadFileRequest): Promise<ManagedFile> => {
  const { file } = req;
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('檔案大小超過 10 MB，請壓縮後再上傳');
  }

  const dataUrl = await fileToDataUrl(file);
  const startedAt = Date.now();
  let lastLoaded = 0;
  let lastAt = startedAt;
  const retries = req.retries ?? 1;
  let attempt = 0;

  while (true) {
    try {
      const res = await apiClient.post<ManagedFile>(
        '/ai/files',
        {
          module: req.module,
          owner_id: req.owner_id,
          folder: req.folder,
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          data_url: dataUrl,
        },
        {
          timeout: 120000,
          headers: getAuthHeaders(),
          onUploadProgress: (evt: any) => {
            const loaded = Number(evt?.loaded || 0);
            const total = Number(evt?.total || dataUrl.length || 1);
            const now = Date.now();
            const dt = Math.max(1, now - lastAt);
            const dLoaded = Math.max(0, loaded - lastLoaded);
            const speed = dLoaded / (dt / 1000); // bytes/s
            const remain = Math.max(0, total - loaded);
            const remainingSeconds = speed > 0 ? Math.ceil(remain / speed) : null;
            const percent = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
            req.onProgress?.({ percent, remainingSeconds });
            lastLoaded = loaded;
            lastAt = now;
          },
        }
      );
      req.onProgress?.({ percent: 100, remainingSeconds: 0 });
      return res.data;
    } catch (e: any) {
      attempt += 1;
      if (attempt > retries) throw e;
    }
  }
};

export const listManagedFiles = async (module: FileModule, ownerId: number, folder?: string) => {
  const res = await apiClient.get<{ items: ManagedFile[] }>('/ai/files', {
    params: { module, owner_id: ownerId, folder },
    headers: getAuthHeaders(),
  });
  return Array.isArray(res.data?.items) ? res.data.items : [];
};

export const deleteManagedFile = async (uid: string) => {
  const res = await apiClient.delete('/ai/files', {
    data: { uid },
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const normalizeDownloadUrl = (downloadUrl: string) => {
  const raw = String(downloadUrl || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/')) return raw.replace(/^\/api/, '');
  return raw;
};

const toBrowserDownloadUrl = (downloadUrl: string) => {
  const raw = String(downloadUrl || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/')) return raw;
  if (raw.startsWith('/ai/')) return `/api${raw}`;
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const downloadManagedFile = async (downloadUrl: string, fileName: string) => {
  const url = toBrowserDownloadUrl(downloadUrl);
  if (!url) throw new Error('下載連結不存在');
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.click();
};
