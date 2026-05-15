import apiClient from './client';

export const getMyPasswordPolicy = async () => {
  const resp = await apiClient.get('/ai/password-policy');
  return resp.data as { rotation_epoch_ms: number; must_change_password: boolean };
};

export const setPasswordRotationEpoch = async (rotationEpochMs: number) => {
  const resp = await apiClient.post('/ai/password-policy', { rotation_epoch_ms: rotationEpochMs });
  return resp.data as { ok: boolean; rotation_epoch_ms: number };
};

export const recordPasswordChanged = async (username?: string) => {
  const resp = await apiClient.post('/ai/password-change-record', username ? { username } : {});
  return resp.data as { ok: boolean };
};

export const createAdminPasswordResetToken = async (identifier: string, ttlSec?: number) => {
  const resp = await apiClient.post('/ai/admin-password-reset-token', { identifier, ttlSec });
  return resp.data as { ok: boolean; token: string; expires_at: string };
};

export const requestPasswordReset = async (identifier: string) => {
  const resp = await apiClient.post('/ai/password-reset-request', { identifier });
  return resp.data as { ok: boolean };
};

export const confirmPasswordReset = async (token: string, newPassword: string) => {
  const resp = await apiClient.post('/ai/password-reset-confirm', { token, newPassword });
  return resp.data as { ok: boolean };
};

