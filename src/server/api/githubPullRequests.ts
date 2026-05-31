import type { GitHubPullRequest, GitHubPullRequestSummary, GitStatusSummary } from '../../shared/types.js';

type GitHubPullRequestResponse = {
  id?: number;
  number?: number;
  title?: string;
  state?: string;
  draft?: boolean;
  html_url?: string;
  base?: { ref?: string };
  head?: { ref?: string; sha?: string; user?: { login?: string } };
  user?: { login?: string };
  updated_at?: string;
};

type GitHubErrorResponse = {
  message?: string;
};

export async function readGitHubPullRequestSummary(status: GitStatusSummary, timeoutMs: number, token?: string): Promise<GitHubPullRequestSummary> {
  const repo = parseGitHubRepo(status.remoteUrl);
  const fetchedAt = Date.now();
  if (!status.isRepo) {
    return { state: 'unavailable', pulls: [], error: status.error ?? 'Not a Git repository.', fetchedAt };
  }
  if (!repo) {
    return { state: 'unavailable', pulls: [], error: 'Origin remote is not a GitHub repository.', fetchedAt };
  }

  const branch = status.branch && status.branch !== 'HEAD' ? status.branch : undefined;
  const base = status.defaultBranch?.trim() || defaultBaseBranch(status, branch);
  const headSha = status.head;
  if (!branch) {
    return { state: 'unavailable', repo, base, headSha, pulls: [], error: 'Current checkout is detached; no branch can be matched to a PR.', fetchedAt };
  }
  if (branch === base) {
    return {
      state: 'direct',
      repo,
      branch,
      base,
      headSha,
      htmlUrl: `https://github.com/${repo}/commits/${encodeURIComponent(branch)}`,
      pulls: [],
      fetchedAt
    };
  }

  const [owner] = repo.split('/');
  const url = new URL(`https://api.github.com/repos/${repo}/pulls`);
  url.searchParams.set('state', 'open');
  url.searchParams.set('base', base);
  url.searchParams.set('head', `${owner}:${branch}`);
  url.searchParams.set('per_page', '10');

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'Codex-Platform',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    });
    const body = (await response.json().catch(() => undefined)) as GitHubPullRequestResponse[] | GitHubErrorResponse | undefined;
    if (!response.ok || !Array.isArray(body)) {
      const message = body && !Array.isArray(body) ? body.message : undefined;
      return {
        state: 'unavailable',
        repo,
        branch,
        base,
        headSha,
        htmlUrl: `https://github.com/${repo}/pulls`,
        pulls: [],
        error: message || `GitHub PR request failed with HTTP ${response.status}.`,
        fetchedAt
      };
    }

    const pulls = body.map(normalizePullRequest).filter(Boolean) as GitHubPullRequest[];
    return {
      state: pullRequestState(pulls),
      repo,
      branch,
      base,
      headSha,
      htmlUrl: pulls[0]?.htmlUrl ?? `https://github.com/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`,
      totalOpen: pulls.length,
      pulls,
      fetchedAt
    };
  } catch (error) {
    return {
      state: 'unavailable',
      repo,
      branch,
      base,
      headSha,
      htmlUrl: `https://github.com/${repo}/pulls`,
      pulls: [],
      error: error instanceof Error ? error.message : String(error),
      fetchedAt
    };
  }
}

function normalizePullRequest(pr: GitHubPullRequestResponse): GitHubPullRequest | undefined {
  if (typeof pr.id !== 'number' || typeof pr.number !== 'number') return undefined;
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title || `PR #${pr.number}`,
    state: pr.state || 'open',
    draft: pr.draft,
    htmlUrl: pr.html_url,
    base: pr.base?.ref,
    head: pr.head?.ref,
    headSha: pr.head?.sha,
    user: pr.user?.login ?? pr.head?.user?.login,
    updatedAt: pr.updated_at
  };
}

function pullRequestState(pulls: GitHubPullRequest[]): GitHubPullRequestSummary['state'] {
  if (pulls.length === 0) return 'none';
  if (pulls.every((pr) => pr.draft)) return 'draft';
  return 'open';
}

function parseGitHubRepo(remote?: string): string | undefined {
  if (!remote) return undefined;
  const httpsMatch = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (httpsMatch) return httpsMatch[1];
  const sshMatch = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (sshMatch) return sshMatch[1];
  return undefined;
}

function defaultBaseBranch(status: GitStatusSummary, branch?: string): string {
  const upstreamBranch = remoteBranchName(status.upstream);
  if (upstreamBranch && isDefaultBranch(upstreamBranch)) return upstreamBranch;
  if (branch && isDefaultBranch(branch)) return branch;
  return 'main';
}

function remoteBranchName(value?: string): string | undefined {
  const branch = value?.trim();
  if (!branch) return undefined;
  const slash = branch.indexOf('/');
  return slash >= 0 ? branch.slice(slash + 1) : branch;
}

function isDefaultBranch(branch: string): boolean {
  return branch === 'main' || branch === 'master';
}
