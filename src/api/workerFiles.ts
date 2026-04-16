import { deleteManagedFile, listManagedFiles, ManagedFile, uploadManagedFile } from './files';

export type WorkerFileCategory = 'id_docs' | 'education_docs' | 'work_docs';

export type WorkerFileMeta = {
  uid: string;
  category: WorkerFileCategory;
  original_name: string;
  mime_type: string;
  size: number;
  download_url?: string;
};

type UploadWorkerFileRequest = {
  owner_id?: number;
  category: WorkerFileCategory;
  file_name: string;
  mime_type: string;
  data_url: string;
  file?: File;
  onProgress?: (p: { percent: number; remainingSeconds: number | null }) => void;
};

export const uploadWorkerFile = async (payload: UploadWorkerFileRequest) => {
  if (payload.file) {
    const data = await uploadManagedFile({
      module: 'workers',
      owner_id: Number(payload.owner_id || 1),
      folder: payload.category,
      file: payload.file,
      onProgress: payload.onProgress,
      retries: 1,
    });
    return {
      uid: data.uid,
      category: payload.category,
      original_name: data.original_name,
      mime_type: data.mime_type,
      size: data.size,
      download_url: data.download_url,
    };
  }
  throw new Error('missing file');
};

export const deleteWorkerFile = async (uid: string) => {
  return deleteManagedFile(uid);
};

export const listWorkerFiles = async (ownerId: number, category: WorkerFileCategory) => {
  const list = await listManagedFiles('workers', ownerId, category);
  return list.map((x: ManagedFile) => ({
    uid: x.uid,
    category,
    original_name: x.original_name,
    mime_type: x.mime_type,
    size: x.size,
    download_url: x.download_url,
  }));
};
