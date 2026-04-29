import { pinyin } from 'pinyin-pro';

const hasCjk = /[\u3400-\u9fff]/;

export const toWorkerNamePinyin = (name: string) => {
  const raw = String(name || '').trim();
  if (!raw) return '';

  // Keep non-Chinese names usable while normalizing spacing/case.
  if (!hasCjk.test(raw)) {
    return raw.replace(/\s+/g, ' ').toUpperCase();
  }

  const result = pinyin(raw, {
    toneType: 'none',
    nonZh: 'consecutive',
    separator: ' ',
  });

  const normalized = String(result || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return normalized;
};
