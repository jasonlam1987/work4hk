import apiClient from './client';

export const requestRegisterEmail = async (email: string) => {
  const response = await apiClient.post('/auth/register-request', { email });
  return response.data as {
    ok: boolean;
    message?: string;
    maskedEmail?: string;
    previewFile?: string;
  };
};

export const verifyRegisterToken = async (token: string) => {
  const response = await apiClient.get('/auth/register-verify', {
    params: { token },
  });
  return response.data as {
    ok: boolean;
    email: string;
    expiresAt?: string;
  };
};

export const completeRegister = async (payload: { token: string; password: string; confirmPassword: string }) => {
  const response = await apiClient.post('/auth/register-complete', payload);
  return response.data as {
    ok: boolean;
    email: string;
    username: string;
  };
};

export const requestPasswordReset = async (email: string) => {
  const response = await apiClient.post('/auth/password-reset-request', { email });
  return response.data as {
    ok: boolean;
    message?: string;
    maskedEmail?: string;
    previewFile?: string;
  };
};

export const verifyPasswordResetToken = async (token: string) => {
  const response = await apiClient.get('/auth/password-reset-verify', {
    params: { token },
  });
  return response.data as {
    ok: boolean;
    email: string;
    expiresAt?: string;
  };
};

export const confirmPasswordReset = async (payload: { token: string; password: string; confirmPassword: string }) => {
  const response = await apiClient.post('/auth/password-reset-confirm', payload);
  return response.data as {
    ok: boolean;
    email: string;
  };
};
