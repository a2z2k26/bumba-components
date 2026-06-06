/**
 * MCP Server Registry
 * Central registry for all MCP server definitions and metadata
 */

const { EventEmitter } = require('events');

class MCPServerRegistry extends EventEmitter {
  constructor() {
    super();

    // Server definitions with metadata
    this.servers = new Map([
      // Core servers (always-on, no credentials)
      ['memory', {
        category: 'core',
        displayName: 'Memory',
        description: 'Context and memory persistence',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        alwaysOn: true
      }],
      ['filesystem', {
        category: 'core',
        displayName: 'Filesystem',
        description: 'File system operations',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        alwaysOn: true,
        configurable: {
          paths: true
        }
      }],
      ['sequential-thinking', {
        category: 'core',
        displayName: 'Sequential Thinking',
        description: 'Structured reasoning and problem solving',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        alwaysOn: true
      }],

      // Development servers
      ['github', {
        category: 'development',
        displayName: 'GitHub',
        description: 'Version control and repository management',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: 'MCP_GITHUB_TOKEN'
        }
      }],
      ['docker-gateway', {
        category: 'development',
        displayName: 'Docker Gateway',
        description: 'Container management',
        requiresAuth: false,
        command: 'docker',
        args: ['mcp', 'gateway', 'run']
      }],
      ['gordon', {
        category: 'development',
        displayName: 'Gordon',
        description: 'Docker AI assistant',
        requiresAuth: false,
        command: 'docker',
        args: ['ai', 'mcpserver']
      }],

      // Search servers
      ['brave-search', {
        category: 'search',
        displayName: 'Brave Search',
        description: 'Web search engine',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: {
          BRAVE_API_KEY: 'MCP_BRAVE_API_KEY'
        }
      }],
      ['ref-tools', {
        category: 'search',
        displayName: 'Ref Tools',
        description: 'Documentation reference search',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'ref-tools-mcp@latest'],
        env: {
          REF_API_KEY: 'MCP_REF_API_KEY'
        }
      }],
      ['exa', {
        category: 'search',
        displayName: 'Exa',
        description: 'AI-powered search',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'exa-mcp-server'],
        env: {
          EXA_API_KEY: 'MCP_EXA_API_KEY'
        }
      }],
      ['context7', {
        category: 'search',
        displayName: 'Context7',
        description: 'Documentation context search',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp']
      }],

      // UI/Design servers
      ['figma', {
        category: 'design',
        displayName: 'Figma',
        description: 'Design tool integration',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'figma-developer-mcp', '--stdio'],
        env: {
          FIGMA_API_KEY: 'MCP_FIGMA_API_KEY'
        }
      }],
      ['magic-ui', {
        category: 'design',
        displayName: 'Magic UI',
        description: 'UI component generation',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@21st-dev/magic@latest']
      }],
      ['shadcn-ui', {
        category: 'design',
        displayName: 'Shadcn UI',
        description: 'Shadcn UI components',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', 'shadcn-ui-mcp-server']
      }],
      ['playwright', {
        category: 'design',
        displayName: 'Playwright',
        description: 'Browser automation',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@playwright/mcp']
      }],

      // Database servers
      ['postgres', {
        category: 'databases',
        displayName: 'PostgreSQL',
        description: 'PostgreSQL database',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        configurable: {
          url: true
        }
      }],
      ['mongodb', {
        category: 'databases',
        displayName: 'MongoDB',
        description: 'MongoDB NoSQL database',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'mongodb-mcp-server'],
        env: {
          MDB_MCP_API_CLIENT_ID: 'MCP_MONGODB_CLIENT_ID',
          MDB_MCP_API_CLIENT_SECRET: 'MCP_MONGODB_CLIENT_SECRET'
        }
      }],
      ['pinecone', {
        category: 'databases',
        displayName: 'Pinecone',
        description: 'Vector database',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', '@pinecone-database/mcp'],
        env: {
          PINECONE_API_KEY: 'MCP_PINECONE_API_KEY'
        }
      }],
      ['qdrant', {
        category: 'databases',
        displayName: 'Qdrant',
        description: 'Vector database',
        requiresAuth: false,
        command: 'uvx',
        args: ['mcp-server-qdrant'],
        env: {
          QDRANT_URL: 'MCP_QDRANT_URL',
          COLLECTION_NAME: 'MCP_QDRANT_COLLECTION'
        }
      }],
      ['chroma', {
        category: 'databases',
        displayName: 'Chroma',
        description: 'Embedding database',
        requiresAuth: false,
        command: 'uvx',
        args: ['chroma-mcp'],
        env: {
          CHROMA_CLIENT_TYPE: 'persistent',
          CHROMA_DATA_DIR: 'MCP_CHROMA_DATA_DIR'
        }
      }],

      // Automation servers
      ['n8n', {
        category: 'automation',
        displayName: 'N8N',
        description: 'Workflow automation',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'n8n-mcp'],
        env: {
          N8N_API_URL: 'MCP_N8N_API_URL',
          N8N_API_KEY: 'MCP_N8N_API_KEY'
        }
      }],
      ['semgrep', {
        category: 'automation',
        displayName: 'Semgrep',
        description: 'Code analysis',
        requiresAuth: true,
        command: 'uvx',
        args: ['semgrep-mcp'],
        env: {
          SEMGREP_APP_TOKEN: 'MCP_SEMGREP_APP_TOKEN'
        }
      }],

      // Testing servers
      ['qasphere', {
        category: 'testing',
        displayName: 'QASphere',
        description: 'Test management system',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'qasphere-mcp'],
        env: {
          QASPHERE_TENANT_URL: 'MCP_QASPHERE_TENANT_URL',
          QASPHERE_API_KEY: 'MCP_QASPHERE_API_KEY'
        }
      }],
      ['selenium', {
        category: 'testing',
        displayName: 'Selenium',
        description: 'Browser automation testing',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', 'selenium-mcp-server']
      }],
      ['cypress', {
        category: 'testing',
        displayName: 'Cypress',
        description: 'E2E testing framework',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', 'cypress-mcp']
      }],
      ['jest', {
        category: 'testing',
        displayName: 'Jest',
        description: 'JavaScript testing framework',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', 'jest-mcp-server']
      }],

      // Cloud servers
      ['cloudflare', {
        category: 'cloud',
        displayName: 'Cloudflare',
        description: 'CDN and cloud services',
        requiresAuth: true,
        command: 'npx',
        args: ['mcp-remote', 'https://bindings.mcp.cloudflare.com/sse'],
        env: {
          CF_ACCOUNT_ID: 'MCP_CLOUDFLARE_ACCOUNT_ID',
          CF_API_TOKEN: 'MCP_CLOUDFLARE_API_TOKEN'
        }
      }],
      ['aws', {
        category: 'cloud',
        displayName: 'AWS',
        description: 'Amazon Web Services integration',
        requiresAuth: true,
        command: 'npx',
        args: ['-y', 'aws-mcp-server'],
        env: {
          AWS_ACCESS_KEY_ID: 'MCP_AWS_ACCESS_KEY',
          AWS_SECRET_ACCESS_KEY: 'MCP_AWS_SECRET_KEY',
          AWS_REGION: 'MCP_AWS_REGION'
        }
      }],

      // Utility servers
      ['time-server', {
        category: 'utility',
        displayName: 'Time Server',
        description: 'Time and timezone utilities',
        requiresAuth: false,
        command: 'uvx',
        args: ['mcp-server-time']
      }],
      ['json-server', {
        category: 'utility',
        displayName: 'JSON Server',
        description: 'JSON data processing',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', '@gongrzhe/server-json-mcp@latest']
      }],
      ['mermaid', {
        category: 'utility',
        displayName: 'Mermaid',
        description: 'Diagram generation',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', 'mcp-mermaid']
      }],
      ['reflektion', {
        category: 'utility',
        displayName: 'Reflektion',
        description: 'Code reflection and analysis',
        requiresAuth: false,
        command: 'npx',
        args: ['-y', 'reflektion']
      }],

      // Custom servers
      ['chatta', {
        category: 'custom',
        displayName: 'CHATTA',
        description: 'Custom CHATTA server',
        requiresAuth: false,
        command: 'MCP_CHATTA_PATH',
        isScript: true
      }]
    ]);

    // Active servers tracking
    this.activeServers = new Set();

    // Category metadata
    this.categories = {
      core: {
        name: 'Core Services',
        description: 'Essential always-on servers',
        icon: '',
        priority: 1
      },
      development: {
        name: 'Development Tools',
        description: 'Version control and development',
        icon: '',
        priority: 2
      },
      search: {
        name: 'Search & Documentation',
        description: 'Search engines and docs',
        icon: '',
        priority: 3
      },
      design: {
        name: 'UI & Design',
        description: 'Design and UI tools',
        icon: '',
        priority: 4
      },
      databases: {
        name: 'Databases',
        description: 'Data storage solutions',
        icon: '',
        priority: 5
      },
      automation: {
        name: 'Automation',
        description: 'Workflow and analysis',
        icon: '',
        priority: 6
      },
      testing: {
        name: 'Testing & QA',
        description: 'Testing tools',
        icon: '',
        priority: 7
      },
      cloud: {
        name: 'Cloud Services',
        description: 'Cloud platforms',
        icon: '',
        priority: 8
      },
      utility: {
        name: 'Utilities',
        description: 'Helper tools',
        icon: '',
        priority: 9
      },
      custom: {
        name: 'Custom Servers',
        description: 'User-defined servers',
        icon: '',
        priority: 10
      }
    };
  }

  /**
   * Get server metadata by name
   */
  getServer(name) {
    return this.servers.get(name);
  }

  /**
   * Get all servers in a category
   */
  getServersByCategory(category) {
    const servers = [];
    for (const [name, config] of this.servers) {
      if (config.category === category) {
        servers.push({ name, ...config });
      }
    }
    return servers;
  }

  /**
   * Get all core servers
   */
  getCoreServers() {
    return this.getServersByCategory('core');
  }

  /**
   * Check if server is core
   */
  isCore(serverName) {
    const server = this.servers.get(serverName);
    return server && server.category === 'core';
  }

  /**
   * Check if server requires authentication
   */
  requiresAuth(serverName) {
    const server = this.servers.get(serverName);
    return server && server.requiresAuth;
  }

  /**
   * Get all categories sorted by priority
   */
  getCategories() {
    return Object.entries(this.categories)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([key, meta]) => ({ key, ...meta }));
  }

  /**
   * Mark server as active
   */
  setActive(serverName) {
    this.activeServers.add(serverName);
    this.emit('server:activated', serverName);
  }

  /**
   * Mark server as inactive
   */
  setInactive(serverName) {
    this.activeServers.delete(serverName);
    this.emit('server:deactivated', serverName);
  }

  /**
   * Check if server is active
   */
  isActive(serverName) {
    return this.activeServers.has(serverName);
  }

  /**
   * Get all active servers
   */
  getActiveServers() {
    return Array.from(this.activeServers);
  }

  /**
   * Get server statistics
   */
  getStats() {
    const stats = {
      total: this.servers.size,
      active: this.activeServers.size,
      byCategory: {}
    };

    for (const category of Object.keys(this.categories)) {
      const servers = this.getServersByCategory(category);
      const active = servers.filter(s => this.isActive(s.name)).length;
      stats.byCategory[category] = {
        total: servers.length,
        active
      };
    }

    return stats;
  }
}

// Export singleton
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new MCPServerRegistry();
  }
  return instance;
}

module.exports = {
  MCPServerRegistry,
  getInstance
};