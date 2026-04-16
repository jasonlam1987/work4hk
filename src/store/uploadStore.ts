import { create } from 'zustand';

export type UploadTask = {
  key: string;
  name: string;
  percent: number;
  remainingSeconds: number | null;
  error: string;
  retryFile?: File;
};

type UploadState = {
  tasksByScope: Record<string, Record<string, UploadTask>>;
  beginTask: (scope: string, key: string, name: string, retryFile?: File) => void;
  updateTask: (scope: string, key: string, patch: Partial<UploadTask>) => void;
  failTask: (scope: string, key: string, message: string, retryFile?: File) => void;
  succeedTask: (scope: string, key: string) => void;
  removeTask: (scope: string, key: string) => void;
  clearScope: (scope: string) => void;
};

export const useUploadStore = create<UploadState>((set) => ({
  tasksByScope: {},
  beginTask: (scope, key, name, retryFile) =>
    set((state) => {
      const prevScope = state.tasksByScope[scope] || {};
      return {
        tasksByScope: {
          ...state.tasksByScope,
          [scope]: {
            ...prevScope,
            [key]: { key, name, percent: 0, remainingSeconds: null, error: '', retryFile },
          },
        },
      };
    }),
  updateTask: (scope, key, patch) =>
    set((state) => {
      const prevScope = state.tasksByScope[scope] || {};
      const task = prevScope[key];
      if (!task) return state;
      return {
        tasksByScope: {
          ...state.tasksByScope,
          [scope]: {
            ...prevScope,
            [key]: { ...task, ...patch },
          },
        },
      };
    }),
  failTask: (scope, key, message, retryFile) =>
    set((state) => {
      const prevScope = state.tasksByScope[scope] || {};
      const task = prevScope[key];
      if (!task) return state;
      return {
        tasksByScope: {
          ...state.tasksByScope,
          [scope]: {
            ...prevScope,
            [key]: { ...task, error: message, retryFile, percent: 100, remainingSeconds: 0 },
          },
        },
      };
    }),
  succeedTask: (scope, key) => {
    set((state) => {
      const prevScope = state.tasksByScope[scope] || {};
      const task = prevScope[key];
      if (!task) return state;
      return {
        tasksByScope: {
          ...state.tasksByScope,
          [scope]: {
            ...prevScope,
            [key]: { ...task, error: '', percent: 100, remainingSeconds: 0, retryFile: undefined },
          },
        },
      };
    });
    setTimeout(() => {
      useUploadStore.getState().removeTask(scope, key);
    }, 500);
  },
  removeTask: (scope, key) =>
    set((state) => {
      const prevScope = state.tasksByScope[scope] || {};
      if (!prevScope[key]) return state;
      const nextScope = { ...prevScope };
      delete nextScope[key];
      const nextAll = { ...state.tasksByScope, [scope]: nextScope };
      if (Object.keys(nextScope).length === 0) delete nextAll[scope];
      return { tasksByScope: nextAll };
    }),
  clearScope: (scope) =>
    set((state) => {
      const next = { ...state.tasksByScope };
      delete next[scope];
      return { tasksByScope: next };
    }),
}));
