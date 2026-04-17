import { getExtendedProfileByUsername } from './userDirectoryProfile';

export type UserDisplayShape = {
  salutation?: string;
  displayName?: string;
  display_name?: string;
  full_name?: string;
  username?: string;
};

export const userDisplayPipe = (user?: UserDisplayShape | null) => {
  const fallbackExt = getExtendedProfileByUsername(user?.username);
  const salutation = String(user?.salutation || user?.displayName || user?.display_name || fallbackExt?.salutation || '').trim();
  if (salutation) return salutation;
  return '未設定';
};
