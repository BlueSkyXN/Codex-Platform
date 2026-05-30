import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { GitActionResult, GitDiffResult, GitFileStatus, GitStatusSummary } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

type GitCommandResult = {
  stdout: string;
  stderr: string;
};

export async function readGitStatus(cwd: string, timeoutMs: number): Promise<GitStatusSummary> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'status', '--porcelain=v1', '-b'], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    });
    return parseGitStatus(stdout);
  } catch (error) {
    return {
      isRepo: false,
      files: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function readGitDiff(cwd: string, input: { filePath?: string; cached?: boolean }, timeoutMs: number): Promise<GitDiffResult> {
  const args = ['diff'];
  if (input.cached) args.push('--cached');
  if (input.filePath) args.push('--', safeGitPath(input.filePath));
  const result = await runGit(cwd, args, timeoutMs);
  return { path: input.filePath, cached: Boolean(input.cached), diff: result.stdout };
}

export async function stageGitPaths(cwd: string, paths: string[], timeoutMs: number): Promise<GitActionResult> {
  const safePaths = safeGitPaths(paths);
  const result = await runGit(cwd, ['add', '--', ...safePaths], timeoutMs);
  return { ok: true, stdout: result.stdout, stderr: result.stderr, status: await readGitStatus(cwd, timeoutMs) };
}

export async function unstageGitPaths(cwd: string, paths: string[], timeoutMs: number): Promise<GitActionResult> {
  const safePaths = safeGitPaths(paths);
  const result = await runGit(cwd, ['restore', '--staged', '--', ...safePaths], timeoutMs);
  return { ok: true, stdout: result.stdout, stderr: result.stderr, status: await readGitStatus(cwd, timeoutMs) };
}

export async function commitGitChanges(cwd: string, message: string, timeoutMs: number): Promise<GitActionResult> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Commit message is required.');
  const result = await runGit(cwd, ['commit', '-m', trimmed], timeoutMs);
  return { ok: true, stdout: result.stdout, stderr: result.stderr, status: await readGitStatus(cwd, timeoutMs) };
}

async function runGit(cwd: string, args: string[], timeoutMs: number): Promise<GitCommandResult> {
  const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...args], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024
  });
  return { stdout, stderr };
}

function safeGitPaths(paths: string[]): string[] {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('At least one file path is required.');
  return paths.map(safeGitPath);
}

function safeGitPath(filePath: string): string {
  const value = String(filePath ?? '').trim();
  if (!value) throw new Error('File path is required.');
  if (path.isAbsolute(value)) throw new Error(`Git file path must be relative: ${value}`);
  if (value.split(/[\\/]+/).includes('..')) throw new Error(`Git file path cannot contain '..': ${value}`);
  return `:(literal)${value}`;
}

function parseGitStatus(stdout: string): GitStatusSummary {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.startsWith('## ') ? lines.shift()!.slice(3) : '';
  const summary: GitStatusSummary = { isRepo: true, files: [], raw: stdout };

  if (header) {
    const [branchPart, trackingPart] = header.split('...');
    summary.branch = branchPart || undefined;
    if (trackingPart) {
      const upstreamMatch = trackingPart.match(/^([^\[]+)/);
      summary.upstream = upstreamMatch?.[1]?.trim() || undefined;
      const ahead = trackingPart.match(/ahead (\d+)/);
      const behind = trackingPart.match(/behind (\d+)/);
      if (ahead) summary.ahead = Number(ahead[1]);
      if (behind) summary.behind = Number(behind[1]);
    }
  }

  summary.files = lines.map(parseStatusLine).filter(Boolean) as GitFileStatus[];
  return summary;
}

function parseStatusLine(line: string): GitFileStatus | undefined {
  if (line.length < 4) return undefined;
  const index = line[0] ?? ' ';
  const workingTree = line[1] ?? ' ';
  const rest = line.slice(3);
  const renamed = rest.includes(' -> ');
  const [oldPath, newPath] = renamed ? rest.split(' -> ') : ['', rest];
  return {
    path: newPath,
    oldPath: renamed ? oldPath : undefined,
    index,
    workingTree,
    status: statusLabel(index, workingTree)
  };
}

function statusLabel(index: string, workingTree: string): string {
  const token = `${index}${workingTree}`;
  if (token === '??') return 'untracked';
  if (token.includes('A')) return 'added';
  if (token.includes('D')) return 'deleted';
  if (token.includes('R')) return 'renamed';
  if (token.includes('C')) return 'copied';
  if (token.includes('U')) return 'conflict';
  if (token.includes('M')) return 'modified';
  return token.trim() || 'clean';
}
