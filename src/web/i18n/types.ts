import zhCN from './zh-CN.js';

// The Chinese dictionary is the source of truth for the key set. Every other
// locale must provide exactly these keys (enforced at compile time in en.ts).
export type MessageKey = keyof typeof zhCN;

export type Locale = 'zh-CN' | 'en';
