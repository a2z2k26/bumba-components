/**
 * MCP Natural Language Parser
 * Interprets natural language commands for MCP management
 */

class MCPNaturalLanguageParser {
  constructor() {
    // Command patterns
    this.patterns = {
      // Start/Enable commands
      start: [
        /^(start|enable|launch|run|activate|turn on|boot up?)\s+(.+)$/i,
        /^(get|make)\s+(.+)\s+(running|started|online|active)$/i,
        /^(spin up|fire up|power on)\s+(.+)$/i
      ],
      // Stop/Disable commands
      stop: [
        /^(stop|disable|kill|terminate|deactivate|turn off|shut ?down?)\s+(.+)$/i,
        /^(make)\s+(.+)\s+(stopped|offline|inactive)$/i,
        /^(power off|wind down)\s+(.+)$/i
      ],
      // Restart commands
      restart: [
        /^(restart|reboot|reload|refresh|cycle)\s+(.+)$/i,
        /^(bounce|reset)\s+(.+)$/i
      ],
      // Status commands
      status: [
        /^(show|display|list|get|what'?s?)\s+(status|state|health|info)(\s+of)?(\s+.+)?$/i,
        /^(how'?s?|check)\s+(.+)\s+(doing|running|performing)$/i,
        /^(status|health|info)(\s+of)?(\s+.+)?$/i,
        /^what'?s?\s+(running|active|enabled|online)$/i
      ],
      // Help commands
      help: [
        /^(help|how|what|explain|guide|assist|support)(\s+.+)?$/i,
        /^(show|list)\s+(commands|options|capabilities)$/i
      ],
      // Quick actions
      quickStart: [
        /^(quick\s?start|initialize|setup|bootstrap)$/i,
        /^(get started|begin|init)$/i,
        /^start\s+(everything|all|core)$/i
      ],
      // Category commands
      category: [
        /^(show|list|display)\s+(databases?|search|dev|development|utility|utilities|cloud|testing)$/i,
        /^what\s+(databases?|search|utility|utilities)\s+are\s+available$/i
      ],
      // Config commands
      config: [
        /^(config|configure|settings?|preferences?|options?)$/i,
        /^(change|modify|update|set)\s+settings?$/i
      ]
    };

    // Server name aliases
    this.serverAliases = {
      // Common abbreviations
      'gh': 'github',
      'gpt': 'openai',
      'pg': 'postgres',
      'mongo': 'mongodb',
      'ff': 'filesystem',
      'mem': 'memory',
      'seq': 'sequential-thinking',

      // Alternative names
      'git': 'github',
      'files': 'filesystem',
      'file system': 'filesystem',
      'thinking': 'sequential-thinking',
      'sequential': 'sequential-thinking',
      'docker': 'docker-gateway',
      'containers': 'docker-gateway',
      'brave': 'brave-search',
      'web search': 'brave-search',
      'docs': 'ref-tools',
      'documentation': 'ref-tools',
      'ui': 'magic-ui',
      'components': 'magic-ui',
      'vector': 'pinecone',
      'vectors': 'pinecone',
      'workflow': 'n8n',
      'workflows': 'n8n',
      'cloud': 'cloudflare',
      'cdn': 'cloudflare',
      'time': 'time-server',
      'json': 'json-server',
      'diagram': 'mermaid',
      'diagrams': 'mermaid',
      'test': 'qasphere',
      'testing': 'qasphere',
      'qa': 'qasphere'
    };

    // Category aliases
    this.categoryAliases = {
      'db': 'databases',
      'dbs': 'databases',
      'database': 'databases',
      'dev': 'development',
      'develop': 'development',
      'search': 'search',
      'docs': 'search',
      'ui': 'design',
      'interface': 'design',
      'frontend': 'design',
      'utility': 'utility',
      'utils': 'utility',
      'tools': 'utility',
      'test': 'testing',
      'tests': 'testing',
      'qa': 'testing',
      'workflow': 'automation',
      'workflows': 'automation',
      'auto': 'automation'
    };

    // Special keywords
    this.specialKeywords = {
      all: ['all', 'everything', 'every', 'each'],
      core: ['core', 'essential', 'basic', 'main', 'primary'],
      enabled: ['enabled', 'configured', 'available', 'ready']
    };
  }

  /**
   * Parse natural language input
   */
  parse(input) {
    // Normalize input
    const normalized = input.trim().toLowerCase();

    // Check for empty input
    if (!normalized) {
      return { action: 'help', targets: [] };
    }

    // Try to match patterns
    for (const [action, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) {
          return this.extractCommand(action, match, normalized);
        }
      }
    }

    // Try to identify targets without explicit action
    const targets = this.extractTargets(normalized);
    if (targets.length > 0) {
      // Default to status if targets mentioned without action
      return { action: 'status', targets };
    }

    // If no pattern matches, try to understand intent
    return this.inferIntent(normalized);
  }

  /**
   * Extract command details from match
   */
  extractCommand(action, match, input) {
    let targets = [];

    // Extract target from match groups
    if (match[2]) {
      targets = this.extractTargets(match[2]);
    } else if (match[3]) {
      targets = this.extractTargets(match[3]);
    } else if (match[4]) {
      targets = this.extractTargets(match[4]);
    }

    // For status without specific targets, show all
    if (action === 'status' && targets.length === 0) {
      targets = ['all'];
    }

    // For quickStart, no targets needed
    if (action === 'quickStart') {
      return { action, targets: ['core'] };
    }

    // For category commands, extract category
    if (action === 'category') {
      const category = this.extractCategory(input);
      if (category) {
        return { action: 'category', targets: [category] };
      }
    }

    return { action, targets, raw: input };
  }

  /**
   * Extract targets (servers/categories) from text
   */
  extractTargets(text) {
    const targets = [];
    const words = text.split(/[\s,]+/);

    for (const word of words) {
      // Skip common words
      if (this.isCommonWord(word)) continue;

      // Check for special keywords
      if (this.specialKeywords.all.includes(word)) {
        targets.push('all');
        continue;
      }
      if (this.specialKeywords.core.includes(word)) {
        targets.push('core');
        continue;
      }
      if (this.specialKeywords.enabled.includes(word)) {
        targets.push('enabled');
        continue;
      }

      // Check for server aliases
      const serverName = this.resolveServerName(word);
      if (serverName) {
        targets.push(serverName);
        continue;
      }

      // Check for category aliases
      const category = this.resolveCategoryName(word);
      if (category) {
        targets.push(`category:${category}`);
        continue;
      }

      // Check compound words (e.g., "brave search")
      const nextIdx = words.indexOf(word) + 1;
      if (nextIdx < words.length) {
        const compound = `${word} ${words[nextIdx]}`;
        const compoundServer = this.resolveServerName(compound);
        if (compoundServer) {
          targets.push(compoundServer);
        }
      }
    }

    // Remove duplicates
    return [...new Set(targets)];
  }

  /**
   * Extract category from text
   */
  extractCategory(text) {
    for (const [alias, category] of Object.entries(this.categoryAliases)) {
      if (text.includes(alias)) {
        return category;
      }
    }

    // Check full category names
    const categories = [
      'core', 'development', 'search', 'design',
      'databases', 'automation', 'testing', 'cloud',
      'utility', 'custom'
    ];

    for (const cat of categories) {
      if (text.includes(cat)) {
        return cat;
      }
    }

    return null;
  }

  /**
   * Resolve server name from alias
   */
  resolveServerName(name) {
    // Direct match
    if (this.serverAliases[name]) {
      return this.serverAliases[name];
    }

    // Check if it's already a valid server name
    const validServers = [
      'memory', 'filesystem', 'sequential-thinking',
      'github', 'docker-gateway', 'gordon',
      'brave-search', 'ref-tools', 'exa', 'context7',
      'figma', 'magic-ui', 'shadcn-ui', 'playwright',
      'postgres', 'mongodb', 'pinecone', 'qdrant', 'chroma',
      'n8n', 'semgrep', 'qasphere', 'cloudflare',
      'time-server', 'json-server', 'mermaid', 'reflektion',
      'chatta'
    ];

    if (validServers.includes(name)) {
      return name;
    }

    // Fuzzy match
    for (const server of validServers) {
      if (server.includes(name) || name.includes(server)) {
        return server;
      }
    }

    return null;
  }

  /**
   * Resolve category name from alias
   */
  resolveCategoryName(name) {
    return this.categoryAliases[name] || null;
  }

  /**
   * Check if word is common/ignored
   */
  isCommonWord(word) {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'up', 'down',
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'server', 'servers', 'service', 'services',
      'please', 'thanks', 'thank', 'you'
    ];

    return commonWords.includes(word);
  }

  /**
   * Infer intent from unmatched input
   */
  inferIntent(input) {
    // Question patterns
    if (input.includes('?') || input.startsWith('what') || input.startsWith('how')) {
      return { action: 'help', targets: [] };
    }

    // Status indicators
    if (input.includes('status') || input.includes('health') || input.includes('check')) {
      return { action: 'status', targets: ['all'] };
    }

    // Start indicators
    if (input.includes('start') || input.includes('begin') || input.includes('init')) {
      return { action: 'quickStart', targets: ['core'] };
    }

    // Settings indicators
    if (input.includes('setting') || input.includes('config') || input.includes('prefer')) {
      return { action: 'config', targets: [] };
    }

    // Default to help
    return { action: 'help', targets: [], suggestion: 'unclear' };
  }

  /**
   * Generate suggestions based on partial input
   */
  getSuggestions(input) {
    const suggestions = [];
    const normalized = input.toLowerCase();

    // Action suggestions
    if (!normalized || normalized.length < 3) {
      suggestions.push(
        'start all',
        'status',
        'help',
        'start github',
        'stop all'
      );
    } else if (normalized.startsWith('sta')) {
      suggestions.push('start all', 'start github', 'status', 'start core');
    } else if (normalized.startsWith('sto')) {
      suggestions.push('stop all', 'stop github');
    } else if (normalized.includes('git')) {
      suggestions.push('start github', 'stop github', 'restart github');
    }

    return suggestions;
  }

  /**
   * Format parsed command for display
   */
  formatCommand(parsed) {
    const { action, targets } = parsed;

    let formatted = action.charAt(0).toUpperCase() + action.slice(1);

    if (targets.length > 0) {
      const targetList = targets.map(t => {
        if (t.startsWith('category:')) {
          return `[${t.replace('category:', '')} category]`;
        }
        return t;
      }).join(', ');

      formatted += `: ${targetList}`;
    }

    return formatted;
  }

  /**
   * Validate parsed command
   */
  validate(parsed) {
    const { action, targets } = parsed;

    // Actions that require targets
    const targetRequired = ['start', 'stop', 'restart', 'status'];

    if (targetRequired.includes(action) && targets.length === 0) {
      return {
        valid: false,
        error: `The '${action}' command requires at least one target`
      };
    }

    // Actions that don't need targets
    const noTargetActions = ['help', 'config', 'quickStart'];

    if (noTargetActions.includes(action)) {
      return { valid: true };
    }

    return { valid: true };
  }
}

module.exports = MCPNaturalLanguageParser;