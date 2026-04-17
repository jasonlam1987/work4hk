import versionInfo from '../version.json';

type VersionInfo = {
  cloudVersion: string;
  devVersion: string;
  releasedAt?: string;
};

const info = versionInfo as VersionInfo;

const isLocalHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');

export const getDisplayVersion = () => {
  if (typeof window === 'undefined') return info.devVersion || '0.0.0';
  return isLocalHost(window.location.hostname) ? (info.devVersion || '0.0.0') : (info.cloudVersion || '0.0.0');
};

export const getVersionMeta = () => info;
