import fs from 'node:fs';
import path from 'node:path';

export function realpathIfExists(input: string): string {
  const resolved = path.resolve(input);
  return fs.realpathSync.native(resolved);
}

export function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function assertDirectoryInsideAllowedRoots(input: string, allowedRoots: string[]): string {
  const real = realpathIfExists(input);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) throw new Error(`Path is not a directory: ${input}`);

  const allowed = allowedRoots.map((root) => realpathIfExists(root));
  if (!allowed.some((root) => isPathInside(real, root))) {
    throw new Error(`Project path is outside configured WORKSPACE_ROOTS: ${real}`);
  }
  return real;
}
