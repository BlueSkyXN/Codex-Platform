import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileReadResult, FileTreeNode } from '../../shared/types.js';

type TreeOptions = {
  maxEntries: number;
  maxDepth: number;
};

const DEFAULT_IGNORE = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '.codex-platform'
]);

export function resolveProjectPath(projectCwd: string, relativePath = ''): string {
  if (path.isAbsolute(relativePath)) throw new Error('Only project-relative paths are allowed');
  const root = path.resolve(projectCwd);
  const resolved = path.resolve(root, relativePath || '.');
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Path escapes the project root');
  }
  return resolved;
}

export async function readProjectTree(projectCwd: string, relativePath = '', opts: TreeOptions): Promise<FileTreeNode> {
  const root = path.resolve(projectCwd);
  const absolute = resolveProjectPath(root, relativePath);
  let seen = 0;

  async function walk(current: string, depth: number): Promise<FileTreeNode> {
    if (++seen > opts.maxEntries) {
      return {
        name: path.basename(current) || path.basename(root),
        path: normalizeRelative(root, current),
        type: 'directory',
        children: [{ name: '…', path: normalizeRelative(root, current), type: 'file', size: 0 }]
      };
    }

    const stat = await fs.lstat(current);
    const name = current === root ? path.basename(root) : path.basename(current);
    const rel = normalizeRelative(root, current);

    if (stat.isSymbolicLink()) return { name, path: rel, type: 'symlink', size: stat.size };
    if (!stat.isDirectory()) return { name, path: rel, type: 'file', size: stat.size };

    const node: FileTreeNode = { name, path: rel, type: 'directory', children: [] };
    if (depth <= 0) return node;

    const entries = await fs.readdir(current, { withFileTypes: true });
    const visible = entries
      .filter((entry) => !DEFAULT_IGNORE.has(entry.name))
      .filter((entry) => !entry.name.startsWith('.') || entry.name === '.codex' || entry.name === '.agents')
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    for (const entry of visible) {
      if (seen >= opts.maxEntries) {
        node.children?.push({ name: `… ${visible.length - (node.children?.length ?? 0)} more`, path: rel, type: 'file', size: 0 });
        break;
      }
      node.children?.push(await walk(path.join(current, entry.name), depth - 1));
    }
    return node;
  }

  return walk(absolute, opts.maxDepth);
}

export async function readProjectFile(projectCwd: string, relativePath: string, maxBytes: number): Promise<FileReadResult> {
  if (!relativePath) throw new Error('path is required');
  const root = path.resolve(projectCwd);
  const absolute = resolveProjectPath(root, relativePath);
  const stat = await fs.lstat(absolute);
  if (!stat.isFile()) throw new Error('Only regular files can be read');
  const handle = await fs.open(absolute, 'r');
  try {
    const size = Number(stat.size);
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);
    return {
      path: normalizeRelative(root, absolute),
      content: buffer.subarray(0, result.bytesRead).toString('utf8'),
      truncated: size > maxBytes,
      size,
      encoding: 'utf8'
    };
  } finally {
    await handle.close();
  }
}

function normalizeRelative(root: string, absolute: string): string {
  const rel = path.relative(root, absolute);
  return rel === '' ? '.' : rel.split(path.sep).join('/');
}
