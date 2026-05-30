import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import type { AgentSummary } from '../../shared/types.js';

const DEFAULT_PROJECT_ROOT_MARKERS = ['.git'];

function isDirectory(value: string): boolean {
  try { return fs.statSync(value).isDirectory(); } catch { return false; }
}

function isFile(value: string): boolean {
  try { return fs.statSync(value).isFile(); } catch { return false; }
}

function within(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function workspaceBoundaryFor(cwd: string): string {
  const resolved = path.resolve(cwd);
  return config.allowedWorkspaceRoots
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => within(candidate, resolved))
    .sort((a, b) => b.length - a.length)[0] ?? path.resolve(config.workspaceRoot);
}

function projectRootFor(cwd: string): string {
  const resolved = path.resolve(cwd);
  const boundary = workspaceBoundaryFor(resolved);
  const markers = config.codex.projectRootMarkers.length ? config.codex.projectRootMarkers : DEFAULT_PROJECT_ROOT_MARKERS;
  let current = resolved;
  while (within(boundary, current)) {
    if (markers.some((marker) => fs.existsSync(path.join(current, marker)))) return current;
    if (current === path.resolve(boundary)) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolved;
}

function dirsFromRootToCwd(root: string, cwd: string): string[] {
  const resolvedRoot = path.resolve(root);
  const resolvedCwd = path.resolve(cwd);
  const dirs: string[] = [];
  let current = resolvedCwd;
  while (within(resolvedRoot, current)) {
    dirs.push(current);
    if (current === resolvedRoot) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs.reverse();
}

function repoAgentDirs(cwd: string): string[] {
  const resolved = path.resolve(cwd);
  const root = projectRootFor(resolved);
  return dirsFromRootToCwd(root, resolved).map((dir) => path.join(dir, '.codex', 'agents'));
}

function userAgentDirs(): string[] {
  if (!config.codex.scanUserAgents) return [];
  const codeHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
  return unique([
    path.join(codeHome, 'agents'),
    path.join(os.homedir(), '.codex', 'agents')
  ], (item) => item);
}

function scanAgentDir(root: string, scope: 'repo' | 'user'): AgentSummary[] {
  if (!isDirectory(root)) return [];
  const out: AgentSummary[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if ((!entry.isFile() && !entry.isSymbolicLink()) || !entry.name.endsWith('.toml')) continue;
    const file = path.join(root, entry.name);
    if (!isFile(file)) continue;
    try {
      const content = fs.readFileSync(file, 'utf8');
      const parsed = parseAgentToml(content);
      const fallbackName = path.basename(entry.name, '.toml');
      const name = parsed.name || fallbackName;
      const description = parsed.description || 'Custom Codex agent';
      out.push({
        id: file,
        name,
        description,
        path: file,
        scope,
        source: root,
        model: parsed.model,
        sandbox: parsed.sandbox_mode,
        effort: parsed.model_reasoning_effort,
        aliases: parsed.nickname_candidates,
        hasDeveloperInstructions: Boolean(parsed.developer_instructions),
        state: Boolean(parsed.developer_instructions) ? 'ready' : 'warning',
        diagnostic: Boolean(parsed.developer_instructions)
          ? `Loaded from ${root}.`
          : 'Loaded without developer_instructions; delegation behavior may be generic.',
        raw: {
          file,
          scope,
          model: parsed.model,
          sandbox_mode: parsed.sandbox_mode,
          model_reasoning_effort: parsed.model_reasoning_effort,
          has_developer_instructions: Boolean(parsed.developer_instructions)
        }
      });
    } catch {
      out.push({
        id: file,
        name: path.basename(entry.name, '.toml'),
        description: 'Failed to parse custom agent metadata',
        path: file,
        scope,
        source: root,
        state: 'error',
        diagnostic: 'TOML metadata could not be parsed.',
        raw: { file, parseError: true }
      });
    }
  }
  return out;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"""') && trimmed.endsWith('"""')) || (trimmed.startsWith("'''") && trimmed.endsWith("'''"))) return trimmed.slice(3, -3).trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function stripInlineComment(value: string): string {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = undefined;
      continue;
    }
    if (char === '#' && !quote) return value.slice(0, i).trimEnd();
  }
  return value.trim();
}

function parseInlineStringArray(value: string): string[] | undefined {
  const trimmed = stripInlineComment(value).trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote === '"') {
      current += char;
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      current += char;
      continue;
    }
    if (char === quote) {
      quote = undefined;
      current += char;
      continue;
    }
    if (char === ',' && !quote) {
      const item = stripQuotes(current.trim());
      if (item) out.push(item);
      current = '';
      continue;
    }
    current += char;
  }
  const item = stripQuotes(current.trim());
  if (item) out.push(item);
  return out;
}

function getTomlString(content: string, key: string): string | undefined {
  const triple = new RegExp(`^\\s*${key}\\s*=\\s*("""|''')([\\s\\S]*?)\\1`, 'm').exec(content);
  if (triple) return triple[2].trim();
  const line = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm').exec(content);
  if (!line) return undefined;
  const value = stripInlineComment(line[1]).trim();
  if (value.startsWith('[')) return undefined;
  return stripQuotes(value);
}

type AgentTomlMetadata = {
  name?: string;
  description?: string;
  developer_instructions?: string;
  model?: string;
  model_reasoning_effort?: string;
  sandbox_mode?: string;
  nickname_candidates?: string[];
};

function parseAgentToml(content: string): AgentTomlMetadata {
  const nickLine = /^\s*nickname_candidates\s*=\s*(.+)$/m.exec(content);
  return {
    name: getTomlString(content, 'name'),
    description: getTomlString(content, 'description'),
    developer_instructions: getTomlString(content, 'developer_instructions'),
    model: getTomlString(content, 'model'),
    model_reasoning_effort: getTomlString(content, 'model_reasoning_effort'),
    sandbox_mode: getTomlString(content, 'sandbox_mode'),
    nickname_candidates: nickLine ? parseInlineStringArray(nickLine[1]) : undefined
  };
}

export function listCustomAgents(cwd: string): AgentSummary[] {
  const roots = [
    ...userAgentDirs().map((root) => ({ root, scope: 'user' as const })),
    ...repoAgentDirs(cwd).map((root) => ({ root, scope: 'repo' as const }))
  ];
  return unique(roots.flatMap(({ root, scope }) => scanAgentDir(root, scope)), (agent) => agent.path ?? agent.id)
    .sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}
