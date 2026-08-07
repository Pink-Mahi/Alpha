/**
 * GitHub integration — creates branches, pushes commits, and opens PRs.
 *
 * Uses the GitHub REST API (no git CLI needed in the sandbox). The sandbox
 * produces a diff/patch, and this module applies it via the GitHub API.
 *
 * M3: basic PR creation. M4: PR reviews, comments, status checks.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface CreatePROpts {
  title: string;
  body: string;
  head: string; // branch name
  base: string; // target branch (usually "main")
}

export interface CreatedPR {
  number: number;
  url: string;
  state: "open" | "closed";
}

export class GitHubClient {
  private config: GitHubConfig;
  private baseUrl = "https://api.github.com";

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  private async api(path: string, init: RequestInit = {}): Promise<unknown> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`GitHub API ${resp.status}: ${body.slice(0, 300)}`);
    }
    return resp.json();
  }

  /** Create a new branch from a base ref. */
  async createBranch(branchName: string, fromRef: string = "main"): Promise<{ ref: string; sha: string }> {
    // Get the SHA of the base ref
    const ref = await this.api(`/repos/${this.config.owner}/${this.config.repo}/git/refs/heads/${fromRef}`) as { object: { sha: string } };
    const sha = ref.object.sha;

    // Create the new branch
    await this.api(`/repos/${this.config.owner}/${this.config.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    });

    return { ref: branchName, sha };
  }

  /** Create or update a file on a branch. */
  async createOrUpdateFile(
    branch: string,
    path: string,
    content: string,
    message: string,
  ): Promise<{ commit: { sha: string; message: string } }> {
    // Get current file SHA if it exists (for updates)
    let currentSha: string | undefined;
    try {
      const file = await this.api(
        `/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${branch}`,
      ) as { sha: string };
      currentSha = file.sha;
    } catch {
      // File doesn't exist yet, that's fine.
    }

    const result = await this.api(`/repos/${this.config.owner}/${this.config.repo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: btoa(content),
        branch,
        sha: currentSha,
      }),
    }) as { commit: { sha: string; message: string } };

    return result;
  }

  /** Create a pull request. */
  async createPR(opts: CreatePROpts): Promise<CreatedPR> {
    const result = await this.api(`/repos/${this.config.owner}/${this.config.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        head: opts.head,
        base: opts.base,
      }),
    }) as { number: number; html_url: string; state: "open" | "closed" };

    return { number: result.number, url: result.html_url, state: result.state };
  }

  /** Add labels to a PR. */
  async addLabels(prNumber: number, labels: string[]): Promise<void> {
    await this.api(`/repos/${this.config.owner}/${this.config.repo}/issues/${prNumber}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }
}
