import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitFileStatus, GitStatusSummary } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

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
