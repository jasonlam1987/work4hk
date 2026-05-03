import apiClient from './client';

export interface Agency {
  id: number;
  name: string;
  english_name?: string | null;
  short_name?: string | null;
  certificate_number?: string | null;
  manager?: string | null;
  manager_position?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AgencyCreate {
  name: string;
  english_name?: string | null;
  short_name?: string | null;
  certificate_number?: string | null;
  manager?: string | null;
  manager_position?: string | null;
  remarks?: string | null;
}

export interface Recruiter {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecruiterCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
}

export interface Partner {
  id: number;
  name: string;
  company_code?: string | null;
  contact_person?: string | null;
  price_per_person_month?: number | null;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PartnerCreate {
  name: string;
  company_code?: string | null;
  contact_person?: string | null;
  price_per_person_month?: number | null;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
}

// Agencies
export const getAgencies = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Agency[]>('/agencies', { params });
  return response.data;
};

export const getAgency = async (id: number) => {
  const response = await apiClient.get<Agency>(`/agencies/${id}`);
  return response.data;
};

export const createAgency = async (data: AgencyCreate) => {
  const response = await apiClient.post<Agency>('/agencies', data);
  return response.data;
};

export const updateAgency = async (id: number, data: Partial<AgencyCreate>) => {
  const response = await apiClient.put<Agency>(`/agencies/${id}`, data);
  return response.data;
};

export const deleteAgency = async (id: number) => {
  const response = await apiClient.delete(`/agencies/${id}`);
  return response.data;
};

// Recruiters
export const getRecruiters = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Recruiter[]>('/recruiters', { params });
  return response.data;
};

export const getRecruiter = async (id: number) => {
  const response = await apiClient.get<Recruiter>(`/recruiters/${id}`);
  return response.data;
};

export const createRecruiter = async (data: RecruiterCreate) => {
  const response = await apiClient.post<Recruiter>('/recruiters', data);
  return response.data;
};

export const updateRecruiter = async (id: number, data: Partial<RecruiterCreate>) => {
  const response = await apiClient.put<Recruiter>(`/recruiters/${id}`, data);
  return response.data;
};

export const deleteRecruiter = async (id: number) => {
  const response = await apiClient.delete(`/recruiters/${id}`);
  return response.data;
};

// Partners
export const getPartners = async (params?: { q?: string }) => {
  const cleanedParams: { q?: string } = {};
  if (params?.q && params.q.trim()) cleanedParams.q = params.q.trim();
  const response = await apiClient.get<Partner[]>('/partners', {
    params: cleanedParams,
  });
  return response.data;
};

export const getPartner = async (id: number) => {
  const response = await apiClient.get<Partner>(`/partners/${id}`);
  return response.data;
};

export const createPartner = async (data: PartnerCreate) => {
  const response = await apiClient.post<Partner>('/partners', data);
  return response.data;
};

export const updatePartner = async (id: number, data: Partial<PartnerCreate>) => {
  const response = await apiClient.put<Partner>(`/partners/${id}`, data);
  return response.data;
};

export const deletePartner = async (id: number) => {
  const response = await apiClient.delete(`/partners/${id}`);
  return response.data;
};
