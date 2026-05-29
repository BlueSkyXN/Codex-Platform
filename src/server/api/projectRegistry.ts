import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../../shared/types.js';
import { assertDirectoryInsideAllowedRoots } from '../security/pathPolicy.js';

type PersistedProjects = { projects: Project[] };

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function atomicWrite(file: string, value: unknown): void {
  ensureDir(file);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

export class ProjectRegistry {
  private projects = new Map<string, Project>();

  constructor(private defaultRoot: string, private allowedRoots: string[], private projectsFile: string) {
    this.restore();
    const name = path.basename(defaultRoot) || 'workspace';
    this.add({ name, cwd: defaultRoot }, { persist: false });
    this.persist();
  }

  all(): Project[] {
    return [...this.projects.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  add(input: { name?: string; cwd: string }, options: { persist?: boolean } = {}): Project {
    const cwd = assertDirectoryInsideAllowedRoots(input.cwd, this.allowedRoots);
    const existing = [...this.projects.values()].find((p) => p.cwd === cwd);
    if (existing) return existing;
    const project: Project = {
      id: `prj_${Buffer.from(cwd).toString('base64url').slice(0, 16)}`,
      name: input.name?.trim() || path.basename(cwd) || cwd,
      cwd,
      createdAt: Date.now()
    };
    this.projects.set(project.id, project);
    if (options.persist !== false) this.persist();
    return project;
  }

  remove(id: string): boolean {
    const removed = this.projects.delete(id);
    if (removed) this.persist();
    return removed;
  }

  private restore(): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.projectsFile, 'utf8')) as PersistedProjects;
      for (const project of parsed.projects ?? []) {
        try {
          const cwd = assertDirectoryInsideAllowedRoots(project.cwd, this.allowedRoots);
          this.projects.set(project.id, { ...project, cwd });
        } catch {
          // Drop projects that no longer exist or no longer satisfy the path policy.
        }
      }
    } catch {
      // Missing file is normal on first boot.
    }
  }

  private persist(): void {
    atomicWrite(this.projectsFile, { projects: this.all() });
  }
}
