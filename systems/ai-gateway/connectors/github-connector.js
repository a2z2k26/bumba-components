/**
 * GitHub API Connector for BUMBA
 * Handles all interactions with GitHub's REST and GraphQL APIs
 */

const EventEmitter = require('events');

class GitHubConnector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      token: options.token || process.env.GITHUB_TOKEN,
      baseURL: options.baseURL || 'https://api.github.com',
      graphQLURL: options.graphQLURL || 'https://api.github.com/graphql',
      userAgent: options.userAgent || 'BUMBA-GitHub-Connector/1.0',
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      ...options
    };

    // Validate token
    if (!this.options.token) {
      throw new Error('GitHub token is required');
    }

    // Rate limiting
    this.rateLimits = {
      core: { limit: 5000, remaining: 5000, reset: null },
      search: { limit: 30, remaining: 30, reset: null },
      graphql: { limit: 5000, remaining: 5000, reset: null }
    };

    // Cache for common requests
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes

    // Current user info
    this.currentUser = null;
  }

  /**
   * Make authenticated REST API request
   */
  async makeRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.options.baseURL}${endpoint}`;

    const headers = {
      'Authorization': `token ${this.options.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': this.options.userAgent,
      ...options.headers
    };

    // Check cache
    const cacheKey = `${options.method || 'GET'}:${url}`;
    if (options.method === 'GET' && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    let lastError;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeout)
        });

        // Update rate limits
        this.updateRateLimits(response.headers);

        if (response.status === 404) {
          throw new Error('Resource not found');
        }

        if (response.status === 403) {
          const remaining = response.headers.get('x-ratelimit-remaining');
          if (remaining === '0') {
            const reset = response.headers.get('x-ratelimit-reset');
            const waitTime = (parseInt(reset) * 1000) - Date.now();
            if (waitTime > 0) {
              await this.delay(waitTime);
              continue;
            }
          }
          throw new Error('Forbidden - check token permissions');
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        // Cache successful GET requests
        if (options.method === 'GET') {
          this.cache.set(cacheKey, { data, timestamp: Date.now() });
        }

        return data;

      } catch (error) {
        lastError = error;

        if (attempt < this.options.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * Make GraphQL request
   */
  async graphQL(query, variables = {}) {
    const response = await fetch(this.options.graphQLURL, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${this.options.token}`,
        'Content-Type': 'application/json',
        'User-Agent': this.options.userAgent
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    // Update GraphQL rate limits
    const rateLimit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (rateLimit) this.rateLimits.graphql.limit = parseInt(rateLimit);
    if (remaining) this.rateLimits.graphql.remaining = parseInt(remaining);
    if (reset) this.rateLimits.graphql.reset = parseInt(reset);

    const data = await response.json();

    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    return data.data;
  }

  /**
   * Get authenticated user
   */
  async getUser() {
    if (this.currentUser) {
      return this.currentUser;
    }

    this.currentUser = await this.makeRequest('/user');
    this.emit('user', this.currentUser);
    return this.currentUser;
  }

  /**
   * Repository operations
   */
  async getRepo(owner, repo) {
    return this.makeRequest(`/repos/${owner}/${repo}`);
  }

  async createRepo(options) {
    const body = {
      name: options.name,
      description: options.description,
      private: options.private || false,
      auto_init: options.autoInit || false,
      gitignore_template: options.gitignoreTemplate,
      license_template: options.licenseTemplate,
      ...options
    };

    const endpoint = options.org ? `/orgs/${options.org}/repos` : '/user/repos';
    return this.makeRequest(endpoint, {
      method: 'POST',
      body
    });
  }

  async deleteRepo(owner, repo) {
    return this.makeRequest(`/repos/${owner}/${repo}`, {
      method: 'DELETE'
    });
  }

  async forkRepo(owner, repo, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/forks`, {
      method: 'POST',
      body: options
    });
  }

  async listRepos(options = {}) {
    const params = new URLSearchParams({
      type: options.type || 'all',
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/user/repos?${params}`);
  }

  /**
   * Branch operations
   */
  async getBranch(owner, repo, branch) {
    return this.makeRequest(`/repos/${owner}/${repo}/branches/${branch}`);
  }

  async listBranches(owner, repo, options = {}) {
    const params = new URLSearchParams({
      protected: options.protected,
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/repos/${owner}/${repo}/branches?${params}`);
  }

  async createBranch(owner, repo, branch, sha) {
    return this.makeRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: {
        ref: `refs/heads/${branch}`,
        sha
      }
    });
  }

  async deleteBranch(owner, repo, branch) {
    return this.makeRequest(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'DELETE'
    });
  }

  /**
   * File operations
   */
  async getFile(owner, repo, path, options = {}) {
    const params = new URLSearchParams();
    if (options.ref) params.append('ref', options.ref);

    const url = `/repos/${owner}/${repo}/contents/${path}${params.toString() ? '?' + params : ''}`;
    return this.makeRequest(url);
  }

  async createOrUpdateFile(owner, repo, path, content, message, options = {}) {
    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch: options.branch,
      committer: options.committer,
      author: options.author
    };

    // Get current file to get SHA for updates
    if (options.sha) {
      body.sha = options.sha;
    } else {
      try {
        const existing = await this.getFile(owner, repo, path, { ref: options.branch });
        body.sha = existing.sha;
      } catch {
        // File doesn't exist, creating new
      }
    }

    return this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body
    });
  }

  async deleteFile(owner, repo, path, message, sha, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      body: {
        message,
        sha,
        branch: options.branch,
        committer: options.committer,
        author: options.author
      }
    });
  }

  /**
   * Commit operations
   */
  async getCommit(owner, repo, sha) {
    return this.makeRequest(`/repos/${owner}/${repo}/commits/${sha}`);
  }

  async listCommits(owner, repo, options = {}) {
    const params = new URLSearchParams();
    if (options.sha) params.append('sha', options.sha);
    if (options.path) params.append('path', options.path);
    if (options.author) params.append('author', options.author);
    if (options.since) params.append('since', options.since);
    if (options.until) params.append('until', options.until);
    params.append('per_page', options.perPage || 30);
    params.append('page', options.page || 1);

    return this.makeRequest(`/repos/${owner}/${repo}/commits?${params}`);
  }

  async createCommit(owner, repo, message, tree, parents, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: {
        message,
        tree,
        parents,
        author: options.author,
        committer: options.committer
      }
    });
  }

  /**
   * Pull Request operations
   */
  async createPullRequest(owner, repo, title, head, base, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: {
        title,
        head,
        base,
        body: options.body,
        draft: options.draft || false,
        maintainer_can_modify: options.maintainerCanModify !== false
      }
    });
  }

  async getPullRequest(owner, repo, number) {
    return this.makeRequest(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async listPullRequests(owner, repo, options = {}) {
    const params = new URLSearchParams({
      state: options.state || 'open',
      head: options.head,
      base: options.base,
      sort: options.sort || 'created',
      direction: options.direction || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/repos/${owner}/${repo}/pulls?${params}`);
  }

  async updatePullRequest(owner, repo, number, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/pulls/${number}`, {
      method: 'PATCH',
      body: options
    });
  }

  async mergePullRequest(owner, repo, number, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
      method: 'PUT',
      body: {
        commit_title: options.commitTitle,
        commit_message: options.commitMessage,
        sha: options.sha,
        merge_method: options.mergeMethod || 'merge'
      }
    });
  }

  async closePullRequest(owner, repo, number) {
    return this.updatePullRequest(owner, repo, number, { state: 'closed' });
  }

  /**
   * Issue operations
   */
  async createIssue(owner, repo, title, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: {
        title,
        body: options.body,
        assignees: options.assignees,
        milestone: options.milestone,
        labels: options.labels
      }
    });
  }

  async getIssue(owner, repo, number) {
    return this.makeRequest(`/repos/${owner}/${repo}/issues/${number}`);
  }

  async listIssues(owner, repo, options = {}) {
    const params = new URLSearchParams({
      state: options.state || 'open',
      labels: options.labels,
      sort: options.sort || 'created',
      direction: options.direction || 'desc',
      since: options.since,
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/repos/${owner}/${repo}/issues?${params}`);
  }

  async updateIssue(owner, repo, number, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/issues/${number}`, {
      method: 'PATCH',
      body: options
    });
  }

  async closeIssue(owner, repo, number) {
    return this.updateIssue(owner, repo, number, { state: 'closed' });
  }

  /**
   * Comment operations
   */
  async createIssueComment(owner, repo, number, body) {
    return this.makeRequest(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: 'POST',
      body: { body }
    });
  }

  async createPRReviewComment(owner, repo, number, body, commitId, path, position) {
    return this.makeRequest(`/repos/${owner}/${repo}/pulls/${number}/comments`, {
      method: 'POST',
      body: {
        body,
        commit_id: commitId,
        path,
        position
      }
    });
  }

  async listIssueComments(owner, repo, number, options = {}) {
    const params = new URLSearchParams({
      since: options.since,
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/repos/${owner}/${repo}/issues/${number}/comments?${params}`);
  }

  /**
   * Actions/Workflows
   */
  async listWorkflows(owner, repo) {
    return this.makeRequest(`/repos/${owner}/${repo}/actions/workflows`);
  }

  async getWorkflow(owner, repo, workflowId) {
    return this.makeRequest(`/repos/${owner}/${repo}/actions/workflows/${workflowId}`);
  }

  async triggerWorkflow(owner, repo, workflowId, ref, inputs = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      body: { ref, inputs }
    });
  }

  async listWorkflowRuns(owner, repo, options = {}) {
    const params = new URLSearchParams();
    if (options.workflow_id) params.append('workflow_id', options.workflow_id);
    if (options.status) params.append('status', options.status);
    if (options.branch) params.append('branch', options.branch);
    params.append('per_page', options.perPage || 30);
    params.append('page', options.page || 1);

    return this.makeRequest(`/repos/${owner}/${repo}/actions/runs?${params}`);
  }

  async getWorkflowRun(owner, repo, runId) {
    return this.makeRequest(`/repos/${owner}/${repo}/actions/runs/${runId}`);
  }

  async cancelWorkflowRun(owner, repo, runId) {
    return this.makeRequest(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {
      method: 'POST'
    });
  }

  /**
   * Release operations
   */
  async createRelease(owner, repo, tagName, options = {}) {
    return this.makeRequest(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: {
        tag_name: tagName,
        target_commitish: options.targetCommitish,
        name: options.name || tagName,
        body: options.body,
        draft: options.draft || false,
        prerelease: options.prerelease || false
      }
    });
  }

  async getRelease(owner, repo, releaseId) {
    return this.makeRequest(`/repos/${owner}/${repo}/releases/${releaseId}`);
  }

  async getLatestRelease(owner, repo) {
    return this.makeRequest(`/repos/${owner}/${repo}/releases/latest`);
  }

  async listReleases(owner, repo, options = {}) {
    const params = new URLSearchParams({
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/repos/${owner}/${repo}/releases?${params}`);
  }

  /**
   * Gist operations
   */
  async createGist(files, options = {}) {
    return this.makeRequest('/gists', {
      method: 'POST',
      body: {
        files,
        description: options.description,
        public: options.public !== false
      }
    });
  }

  async getGist(gistId) {
    return this.makeRequest(`/gists/${gistId}`);
  }

  async updateGist(gistId, options = {}) {
    return this.makeRequest(`/gists/${gistId}`, {
      method: 'PATCH',
      body: options
    });
  }

  async deleteGist(gistId) {
    return this.makeRequest(`/gists/${gistId}`, {
      method: 'DELETE'
    });
  }

  async listGists(options = {}) {
    const params = new URLSearchParams({
      since: options.since,
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/gists?${params}`);
  }

  /**
   * Search operations
   */
  async searchRepositories(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      sort: options.sort,
      order: options.order || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/search/repositories?${params}`);
  }

  async searchCode(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      sort: options.sort,
      order: options.order || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/search/code?${params}`);
  }

  async searchIssues(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      sort: options.sort,
      order: options.order || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/search/issues?${params}`);
  }

  async searchUsers(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      sort: options.sort,
      order: options.order || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/search/users?${params}`);
  }

  /**
   * Organization operations
   */
  async getOrg(org) {
    return this.makeRequest(`/orgs/${org}`);
  }

  async listOrgRepos(org, options = {}) {
    const params = new URLSearchParams({
      type: options.type || 'all',
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/orgs/${org}/repos?${params}`);
  }

  async listOrgMembers(org, options = {}) {
    const params = new URLSearchParams({
      filter: options.filter || 'all',
      role: options.role || 'all',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/orgs/${org}/members?${params}`);
  }

  /**
   * Team operations
   */
  async createTeam(org, name, options = {}) {
    return this.makeRequest(`/orgs/${org}/teams`, {
      method: 'POST',
      body: {
        name,
        description: options.description,
        maintainers: options.maintainers,
        repo_names: options.repoNames,
        privacy: options.privacy || 'secret'
      }
    });
  }

  async getTeam(org, teamSlug) {
    return this.makeRequest(`/orgs/${org}/teams/${teamSlug}`);
  }

  async listTeams(org, options = {}) {
    const params = new URLSearchParams({
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    return this.makeRequest(`/orgs/${org}/teams?${params}`);
  }

  /**
   * Webhook operations
   */
  async createWebhook(owner, repo, config, events = ['push']) {
    return this.makeRequest(`/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: {
        config,
        events,
        active: true
      }
    });
  }

  async listWebhooks(owner, repo) {
    return this.makeRequest(`/repos/${owner}/${repo}/hooks`);
  }

  async deleteWebhook(owner, repo, hookId) {
    return this.makeRequest(`/repos/${owner}/${repo}/hooks/${hookId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Update rate limits from response headers
   */
  updateRateLimits(headers) {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const resource = headers.get('x-ratelimit-resource');

    if (resource === 'search') {
      if (limit) this.rateLimits.search.limit = parseInt(limit);
      if (remaining) this.rateLimits.search.remaining = parseInt(remaining);
      if (reset) this.rateLimits.search.reset = parseInt(reset);
    } else {
      if (limit) this.rateLimits.core.limit = parseInt(limit);
      if (remaining) this.rateLimits.core.remaining = parseInt(remaining);
      if (reset) this.rateLimits.core.reset = parseInt(reset);
    }

    this.emit('rateLimits', this.rateLimits);
  }

  /**
   * Get rate limit status
   */
  async getRateLimits() {
    const response = await this.makeRequest('/rate_limit');

    this.rateLimits = {
      core: response.resources.core,
      search: response.resources.search,
      graphql: response.resources.graphql
    };

    return this.rateLimits;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate token
   */
  async validateToken() {
    try {
      const user = await this.getUser();
      const scopes = await this.makeRequest('/user').then(() => {
        // Get scopes from response headers
        return this.lastScopes || [];
      });

      return {
        valid: true,
        user: user.login,
        scopes
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = GitHubConnector;