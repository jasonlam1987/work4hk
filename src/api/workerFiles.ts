import apiClient from './client';

export type WorkerFileCategory = 'id_docs' | 'education_docs' | 'work_docs';

export type WorkerFileMeta = {
  uid: string;
  category: WorkerFileCategory;
  original_name: string;
  mime_type: string;
  size: number;
};

type UploadWorkerFileRequest = {
  category: WorkerFileCategory;
  file_name: string;
  mime_type: string;
  data_url: string;
};

export const uploadWorkerFile = async (payload: UploadWorkerFileRequest) => {
  const response = await apiClient.post<WorkerFileMeta>('/ai/worker-files', payload, {
    timeout: 60000,
  });
  return response.data;
};

export const deleteWorkerFile = async (uid: string) => {
  const response = await apiClient.delete(`/ai/worker-files`, {
    data: { uid },
  });
  return response.data;
};
