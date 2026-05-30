import type { AccountSummary, SkillSummary } from '../../shared/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boolFrom(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function normalizeSkills(payload: unknown): SkillSummary[] {
  const out: SkillSummary[] = [];

  function visit(value: unknown, source?: string) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, source);
      return;
    }
    if (!isRecord(value)) return;

    const nestedSource = stringFrom(value.cwd) ?? stringFrom(value.root) ?? stringFrom(value.scope) ?? source;
    const nestedCollections = ['data', 'skills', 'items', 'available', 'enabledSkills', 'disabledSkills'];
    for (const key of nestedCollections) {
      if (key in value) visit(value[key], nestedSource);
    }

    const name = stringFrom(value.name) ?? stringFrom(value.id);
    const path = stringFrom(value.path) ?? stringFrom(value.skillPath) ?? stringFrom(value.skill_file) ?? stringFrom(value.skillFile);
    const description = stringFrom(value.description) ?? stringFrom(value.shortDescription) ?? stringFrom(value['short-description']);
    const looksLikeSkill = Boolean(name && (description || path || 'enabled' in value || 'scope' in value));
    if (!looksLikeSkill || !name) return;

    out.push({
      id: path ?? `${name}:${nestedSource ?? 'unknown'}`,
      name,
      description,
      path,
      enabled: boolFrom(value.enabled),
      scope: stringFrom(value.scope),
      source: nestedSource,
      state: skillState(boolFrom(value.enabled), path),
      diagnostic: skillDiagnostic(boolFrom(value.enabled), path, nestedSource),
      raw: value
    });
  }

  visit(payload);

  const seen = new Set<string>();
  return out.filter((skill) => {
    const key = skill.path ?? `${skill.name}:${skill.source ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function skillState(enabled: boolean | undefined, path?: string): SkillSummary['state'] {
  if (enabled === false) return 'disabled';
  if (!path) return 'warning';
  return 'ready';
}

function skillDiagnostic(enabled: boolean | undefined, path?: string, source?: string): string {
  if (enabled === false) return 'Disabled by the runtime.';
  if (!path) return 'Loaded without a SKILL.md path; invocation may need runtime lookup.';
  if (!source) return 'Discovered skill with a concrete path.';
  return `Discovered from ${source}.`;
}

export function normalizeAccount(payload: unknown): AccountSummary {
  const account = findLikelyAccount(payload) ?? (isRecord(payload) ? payload : {});
  const email = stringFrom(account.email) ?? stringFrom(account.login) ?? stringFrom(account.username) ?? stringFrom(account.userEmail);
  const mode = stringFrom(account.mode) ?? stringFrom(account.authMode) ?? stringFrom(account.type) ?? stringFrom(account.kind);
  const plan = stringFrom(account.plan) ?? stringFrom(account.tier) ?? stringFrom(account.subscription);
  const authenticated = boolFrom(account.authenticated) ?? boolFrom(account.loggedIn) ?? Boolean(email || stringFrom(account.status) === 'authenticated');
  return { authenticated, email, mode, plan, raw: payload };
}

function findLikelyAccount(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if ('authenticated' in value || 'loggedIn' in value || 'email' in value || 'mode' in value) return value;
  for (const key of ['account', 'data', 'user', 'profile']) {
    const nested = value[key];
    const found = findLikelyAccount(nested);
    if (found) return found;
  }
  return undefined;
}
