/**
 * Environment Detector
 * Detects execution environment (Claude Code vs Terminal)
 */

class EnvironmentDetector {
  constructor() {
    this.cache = null;
  }

  /**
   * Detect current execution environment
   * @returns {Object} Environment information
   */
  detect() {
    // Return cached result if available
    if (this.cache) {
      return this.cache;
    }

    const env = {
      type: this.detectType(),
      framework: this.detectFramework(),
      interactive: this.isInteractive(),
      capabilities: this.getCapabilities()
    };

    // Cache for performance
    this.cache = env;
    return env;
  }

  /**
   * Detect environment type
   * @returns {string} 'claude' or 'terminal'
   */
  detectType() {
    // Check for Claude Code environment indicators
    if (this.isClaudeCode()) {
      return 'claude';
    }

    // Default to terminal
    return 'terminal';
  }

  /**
   * Check if running in Claude Code
   * @returns {boolean}
   */
  isClaudeCode() {
    // Allow user to force terminal mode
    if (process.env.FORCE_TERMINAL_MODE === 'true') {
      return false;
    }

    // Check for Claude Code specific environment variables
    // IMPORTANT: Check for truthy values, not just existence
    if ((process.env.CLAUDE_CODE && process.env.CLAUDE_CODE !== 'false') ||
        (process.env.CLAUDECODE && process.env.CLAUDECODE !== '0' && process.env.CLAUDECODE !== 'false') ||
        (process.env.CLAUDE_CODE_ENTRYPOINT && process.env.CLAUDE_CODE_ENTRYPOINT !== 'false') ||
        process.env.CLAUDE_SESSION_ID ||
        process.env.MCP_TOOL_CONTEXT) {
      return true;
    }

    // Check if stdin/stdout are not TTY (common in AI tool execution)
    // BUT be careful - this could also be CI/CD
    if (!process.stdin.isTTY && !process.stdout.isTTY && !process.env.CI) {
      return this.isLikelyClaudeParent();
    }

    return false;
  }

  /**
   * Heuristic check for Claude Code parent process
   * @returns {boolean}
   */
  isLikelyClaudeParent() {
    try {
      // Check process title
      if (process.title && process.title.toLowerCase().includes('claude')) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect framework
   * @returns {string} 'claude-code' or 'cli'
   */
  detectFramework() {
    return this.detectType() === 'claude' ? 'claude-code' : 'cli';
  }

  /**
   * Check if running in interactive mode
   * @returns {boolean}
   */
  isInteractive() {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      return true;
    }
    return this.detectType() !== 'claude';
  }

  /**
   * Get environment capabilities
   * @returns {Object}
   */
  getCapabilities() {
    const type = this.detectType();

    if (type === 'claude') {
      return {
        colors: false,
        prompts: false,
        fileAccess: true,
        apiAccess: true,
        structuredOutput: true,
        visualFeedback: false
      };
    }

    return {
      colors: true,
      prompts: true,
      fileAccess: true,
      apiAccess: true,
      structuredOutput: false,
      visualFeedback: true
    };
  }

  /**
   * Clear detection cache (for testing)
   */
  clearCache() {
    this.cache = null;
  }

  /**
   * Get environment context object
   * @returns {Object}
   */
  getContext() {
    const detection = this.detect();

    return {
      environment: detection.type,
      framework: detection.framework,
      interactive: detection.interactive,
      user: process.env.USER || process.env.USERNAME || 'unknown',
      cwd: process.cwd(),
      timestamp: Date.now(),
      requestId: this.generateRequestId(),
      capabilities: detection.capabilities
    };
  }

  /**
   * Generate unique request ID
   * @returns {string}
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let instance = null;

function getEnvironmentDetector() {
  if (!instance) {
    instance = new EnvironmentDetector();
  }
  return instance;
}

module.exports = { EnvironmentDetector, getEnvironmentDetector };
