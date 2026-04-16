type DeleteNotice = {
  at: number;
  message: string;
  uid: string;
  module: string;
};

const CHANNEL_NAME = 'work4hk-delete-requests';

export const pushDeleteNotice = (payload: DeleteNotice) => {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // ignore on unsupported browser
  }
  localStorage.setItem('delete_request_notify', JSON.stringify(payload));
};

export const subscribeDeleteNotice = (onMessage: (payload: DeleteNotice) => void) => {
  let channel: BroadcastChannel | null = null;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'delete_request_notify' || !e.newValue) return;
    try {
      onMessage(JSON.parse(e.newValue));
    } catch {
      // ignore malformed payload
    }
  };

  window.addEventListener('storage', onStorage);
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (ev) => onMessage(ev.data as DeleteNotice);
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener('storage', onStorage);
    if (channel) channel.close();
  };
};
