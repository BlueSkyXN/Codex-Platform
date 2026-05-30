import type { GitHubActionsRun, GitHubActionsSummary, GitStatusSummary } from '../../shared/types.js';

type GitHubWorkflowRun = {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
  head_branch?: string;
  event?: string;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
};

type GitHubRunsResponse = {
  total_count?: number;
  workflow_runs?: GitHubWorkflowRun[];
  message?: string;
};

const successConclusions = new Set(['success', 'skipped', 'neutral']);

export async function readGitHubActionsSummary(status: GitStatusSummary, timeoutMs: number, token?: string): Promise<GitHubActionsSummary> {
  const repo = parseGitHubRepo(status.remoteUrl);
  const fetchedAt = Date.now();
  if (!status.isRepo) {
    return { state: 'unavailable', runs: [], error: status.error ?? 'Not a Git repository.', fetchedAt };
  }
  if (!repo) {
    return { state: 'unavailable', runs: [], error: 'Origin remote is not a GitHub repository.', fetchedAt };
  }

  const branch = status.branch && status.branch !== 'HEAD' ? status.branch : undefined;
  const headSha = status.head;
  const url = new URL(`https://api.github.com/repos/${repo}/actions/runs`);
  url.searchParams.set('per_page', '20');
  url.searchParams.set('exclude_pull_requests', 'true');
  if (branch) url.searchParams.set('branch', branch);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'Codex-Platform',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    });
    const body = (await response.json().catch(() => ({}))) as GitHubRunsResponse;
    if (!response.ok) {
      return {
        state: 'unavailable',
        repo,
        branch,
        headSha,
        htmlUrl: `https://github.com/${repo}/actions`,
        runs: [],
        error: body.message || `GitHub Actions request failed with HTTP ${response.status}.`,
        fetchedAt
      };
    }

    const runs = (body.workflow_runs ?? []).map(normalizeRun).filter(Boolean) as GitHubActionsRun[];
    const matchingRuns = headSha ? runs.filter((run) => run.headSha === headSha) : runs;
    const visibleRuns = matchingRuns.length ? matchingRuns : runs.slice(0, 5);
    return {
      state: actionsState(matchingRuns, runs),
      repo,
      branch,
      headSha,
      checkedSha: matchingRuns[0]?.headSha ?? runs[0]?.headSha,
      htmlUrl: `https://github.com/${repo}/actions`,
      totalRuns: body.total_count,
      matchedRuns: matchingRuns.length,
      runs: visibleRuns.slice(0, 8),
      error: matchingRuns.length === 0 && headSha ? 'No workflow run found for the current HEAD yet.' : undefined,
      fetchedAt
    };
  } catch (error) {
    return {
      state: 'unavailable',
      repo,
      branch,
      headSha,
      htmlUrl: `https://github.com/${repo}/actions`,
      runs: [],
      error: error instanceof Error ? error.message : String(error),
      fetchedAt
    };
  }
}

function parseGitHubRepo(remote?: string): string | undefined {
  if (!remote) return undefined;
  const httpsMatch = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (httpsMatch) return httpsMatch[1];
  const sshMatch = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (sshMatch) return sshMatch[1];
  return undefined;
}

function normalizeRun(run: GitHubWorkflowRun): GitHubActionsRun | undefined {
  if (typeof run.id !== 'number') return undefined;
  return {
    id: run.id,
    name: run.name || 'Workflow',
    status: run.status,
    conclusion: run.conclusion,
    headSha: run.head_sha,
    branch: run.head_branch,
    event: run.event,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  };
}

function actionsState(matchingRuns: GitHubActionsRun[], allRuns: GitHubActionsRun[]): GitHubActionsSummary['state'] {
  if (matchingRuns.length === 0) return allRuns.length ? 'unknown' : 'unavailable';
  if (matchingRuns.some((run) => run.status !== 'completed')) return 'pending';
  if (matchingRuns.some((run) => !successConclusions.has(String(run.conclusion ?? '').toLowerCase()))) return 'failure';
  return 'success';
}
