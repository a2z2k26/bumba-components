/**
 * Shell Security Utilities
 *
 * Provides safe execution of shell commands to prevent command injection attacks.
 * Always use these utilities instead of direct execSync with string interpolation.
 */

const { execSync, spawnSync } = require('child_process');

/**
 * Validate a git reference (branch name, tag, commit hash)
 * Only allows safe characters: alphanumeric, dash, underscore, dot, forward slash
 *
 * @param {string} ref - The git reference to validate
 * @returns {boolean} - True if the reference is safe
 */
function isValidGitRef(ref) {
  if (!ref || typeof ref !== 'string') {
    return false;
  }
  // Git refs can contain: a-z, A-Z, 0-9, -, _, ., /
  // Must not start with - or . and must not contain ..
  const safePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/]*$/;
  return safePattern.test(ref) && !ref.includes('..');
}

/**
 * Validate a file path to prevent path traversal
 *
 * @param {string} filePath - The path to validate
 * @param {string} basePath - The base path to restrict to
 * @returns {boolean} - True if the path is safe
 */
function isValidPath(filePath, basePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  const path = require('path');
  const resolved = path.resolve(basePath, filePath);
  return resolved.startsWith(path.resolve(basePath));
}

/**
 * Sanitize a git reference by removing dangerous characters
 *
 * @param {string} ref - The git reference to sanitize
 * @returns {string} - The sanitized reference
 * @throws {Error} - If the reference cannot be sanitized
 */
function sanitizeGitRef(ref) {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Invalid git reference: must be a non-empty string');
  }

  // Remove any potentially dangerous characters
  const sanitized = ref.trim();

  if (!isValidGitRef(sanitized)) {
    throw new Error(`Invalid git reference: "${ref}" contains invalid characters`);
  }

  return sanitized;
}

/**
 * Execute a git command safely using spawn with array arguments
 * This prevents command injection by not using shell interpolation
 *
 * @param {string[]} args - Array of git command arguments
 * @param {object} options - Options for spawnSync
 * @returns {string} - Command output
 * @throws {Error} - If command fails
 */
function execGitSafe(args, options = {}) {
  if (!Array.isArray(args)) {
    throw new Error('execGitSafe requires an array of arguments');
  }

  const result = spawnSync('git', args, {
    encoding: 'utf8',
    ...options,
    shell: false // Explicitly disable shell
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const errorMessage = result.stderr || result.stdout || 'Git command failed';
    const error = new Error(errorMessage.trim());
    error.status = result.status;
    throw error;
  }

  return result.stdout;
}

/**
 * Execute a git command with validated refs
 *
 * @param {string} command - Git subcommand (e.g., 'branch', 'checkout')
 * @param {string[]} refs - Array of git references to include
 * @param {string[]} flags - Array of flags (e.g., ['-m', '--no-ff'])
 * @param {object} options - Options for execution
 * @returns {string} - Command output
 */
function execGitWithRefs(command, refs = [], flags = [], options = {}) {
  // Validate all refs
  const validatedRefs = refs.map(ref => {
    if (ref.startsWith('-')) {
      // This is a flag, not a ref - validate it's a known flag
      throw new Error(`Invalid ref: "${ref}" looks like a flag`);
    }
    return sanitizeGitRef(ref);
  });

  // Build args array
  const args = [command, ...flags, ...validatedRefs];

  return execGitSafe(args, options);
}

/**
 * Create a branch safely
 *
 * @param {string} branchName - Name of the branch to create
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function createBranch(branchName, options = {}) {
  const name = sanitizeGitRef(branchName);
  return execGitSafe(['branch', name], options);
}

/**
 * Switch to a branch safely
 *
 * @param {string} branchName - Name of the branch to switch to
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function checkoutBranch(branchName, options = {}) {
  const name = sanitizeGitRef(branchName);
  return execGitSafe(['checkout', name], options);
}

/**
 * Delete a branch safely
 *
 * @param {string} branchName - Name of the branch to delete
 * @param {boolean} force - Use -D instead of -d
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function deleteBranch(branchName, force = false, options = {}) {
  const name = sanitizeGitRef(branchName);
  const flag = force ? '-D' : '-d';
  return execGitSafe(['branch', flag, name], options);
}

/**
 * Delete a remote branch safely
 *
 * @param {string} branchName - Name of the branch to delete
 * @param {string} remote - Remote name (default: 'origin')
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function deleteRemoteBranch(branchName, remote = 'origin', options = {}) {
  const name = sanitizeGitRef(branchName);
  const remoteName = sanitizeGitRef(remote);
  return execGitSafe(['push', remoteName, '--delete', name], options);
}

/**
 * Merge a branch safely
 *
 * @param {string} branchName - Name of the branch to merge
 * @param {boolean} noFf - Use --no-ff flag
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function mergeBranch(branchName, noFf = false, options = {}) {
  const name = sanitizeGitRef(branchName);
  const args = ['merge'];
  if (noFf) {
    args.push('--no-ff');
  }
  args.push(name);
  return execGitSafe(args, options);
}

/**
 * Rename a branch safely
 *
 * @param {string} oldName - Current branch name
 * @param {string} newName - New branch name
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function renameBranch(oldName, newName, options = {}) {
  const from = sanitizeGitRef(oldName);
  const to = sanitizeGitRef(newName);
  return execGitSafe(['branch', '-m', from, to], options);
}

/**
 * Push a branch to remote safely
 *
 * @param {string} branchName - Name of the branch to push
 * @param {string} remote - Remote name (default: 'origin')
 * @param {boolean} setUpstream - Use -u flag
 * @param {object} options - Additional options
 * @returns {string} - Command output
 */
function pushBranch(branchName, remote = 'origin', setUpstream = false, options = {}) {
  const name = sanitizeGitRef(branchName);
  const remoteName = sanitizeGitRef(remote);
  const args = ['push'];
  if (setUpstream) {
    args.push('-u');
  }
  args.push(remoteName, name);
  return execGitSafe(args, options);
}

/**
 * Get diff between two refs safely
 *
 * @param {string} ref1 - First reference
 * @param {string} ref2 - Second reference (optional)
 * @param {string[]} additionalFlags - Additional flags like --stat
 * @param {object} options - Additional options
 * @returns {string} - Diff output
 */
function getDiff(ref1, ref2 = null, additionalFlags = [], options = {}) {
  const args = ['diff', ...additionalFlags];

  if (ref1) {
    args.push(sanitizeGitRef(ref1));
  }
  if (ref2) {
    args.push(sanitizeGitRef(ref2));
  }

  return execGitSafe(args, options);
}

/**
 * Get diff between ref^ and ref (parent to ref)
 *
 * @param {string} ref - The reference
 * @param {string[]} additionalFlags - Additional flags
 * @param {object} options - Additional options
 * @returns {string} - Diff output
 */
function getDiffParent(ref, additionalFlags = [], options = {}) {
  const sanitizedRef = sanitizeGitRef(ref);
  const args = ['diff', ...additionalFlags, `${sanitizedRef}^`, sanitizedRef];
  return execGitSafe(args, options);
}

/**
 * Get diff between base...ref (three-dot syntax)
 *
 * @param {string} base - Base reference
 * @param {string} ref - Target reference
 * @param {string[]} additionalFlags - Additional flags
 * @param {object} options - Additional options
 * @returns {string} - Diff output
 */
function getDiffRange(base, ref, additionalFlags = [], options = {}) {
  const sanitizedBase = sanitizeGitRef(base);
  const sanitizedRef = sanitizeGitRef(ref);
  const args = ['diff', ...additionalFlags, `${sanitizedBase}...${sanitizedRef}`];
  return execGitSafe(args, options);
}

/**
 * Get log for a branch safely
 *
 * @param {string} branch - Branch name
 * @param {string} format - Pretty format string
 * @param {number} count - Number of commits
 * @param {object} options - Additional options
 * @returns {string} - Log output
 */
function getLog(branch, format = '%h %s', count = 1, options = {}) {
  const name = sanitizeGitRef(branch);
  return execGitSafe(['log', name, `-${count}`, `--pretty=format:${format}`], options);
}

/**
 * Get rev-list count safely
 *
 * @param {string} range - Git range (e.g., 'origin/main..main')
 * @param {object} options - Additional options
 * @returns {string} - Count output
 */
function getRevListCount(range, options = {}) {
  // Validate both parts of the range
  const parts = range.split('..');
  if (parts.length !== 2) {
    throw new Error('Invalid rev-list range format');
  }

  const from = sanitizeGitRef(parts[0]);
  const to = sanitizeGitRef(parts[1]);

  return execGitSafe(['rev-list', '--count', `${from}..${to}`], options);
}

/**
 * Commit with a message safely
 * This is the safe alternative to using -m with string interpolation
 *
 * @param {string} message - Commit message
 * @param {object} options - Options like amend
 * @returns {string} - Commit output
 */
function commit(message, options = {}) {
  if (!message || typeof message !== 'string') {
    throw new Error('Commit message is required');
  }

  const args = ['commit'];

  if (options.amend) {
    args.push('--amend');
  }

  // Use -m with the message as a separate argument
  // spawnSync handles this safely without shell interpolation
  args.push('-m', message);

  return execGitSafe(args, options);
}

module.exports = {
  // Validation
  isValidGitRef,
  isValidPath,
  sanitizeGitRef,

  // Safe execution
  execGitSafe,
  execGitWithRefs,

  // Branch operations
  createBranch,
  checkoutBranch,
  deleteBranch,
  deleteRemoteBranch,
  mergeBranch,
  renameBranch,
  pushBranch,

  // Diff operations
  getDiff,
  getDiffParent,
  getDiffRange,

  // Other operations
  getLog,
  getRevListCount,
  commit
};
