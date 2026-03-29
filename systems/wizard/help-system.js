/**
 * Help System for BUMBA Setup Wizard
 * Provides inline help, troubleshooting, documentation links, and examples
 */

const chalk = require('chalk');
const boxen = require('boxen');

class HelpSystem {
  constructor(options = {}) {
    this.options = {
      showExamples: options.showExamples !== false,
      showTroubleshooting: options.showTroubleshooting !== false,
      verboseHelp: options.verboseHelp || false,
      ...options
    };
    
    // Help topics
    this.topics = {
      general: this.getGeneralHelp(),
      apiKeys: this.getAPIKeysHelp(),
      mcp: this.getMCPHelp(),
      bridge: this.getBridgeHelp(),
      troubleshooting: this.getTroubleshootingHelp(),
      examples: this.getExamples(),
      commands: this.getCommands()
    };
    
    // Context-sensitive help
    this.contextHelp = this.getContextHelp();
    
    // Quick tips
    this.tips = this.getQuickTips();
  }

  /**
   * Get general help information
   */
  getGeneralHelp() {
    return {
      title: 'BUMBA Setup Wizard Help',
      sections: [
        {
          name: 'Overview',
          content: `
BUMBA Setup Wizard helps you configure:
• API keys for various AI providers
• MCP servers for Claude Desktop
• Universal Bridge for multi-model access
• Environment configuration

The wizard will guide you through each step with validation and error recovery.
          `
        },
        {
          name: 'Getting Started',
          content: `
1. Run: bumba setup
2. Follow the interactive prompts
3. The wizard will detect existing configurations
4. Your progress is auto-saved and can be resumed
5. Configurations are stored locally for security
          `
        },
        {
          name: 'Navigation',
          content: `
• Use arrow keys to navigate options
• Press Enter to select
• Type 'help' at any prompt for context help
• Press Ctrl+C to safely exit (progress saved)
          `
        }
      ],
      links: {
        documentation: 'https://github.com/yourusername/bumba/wiki',
        issues: 'https://github.com/yourusername/bumba/issues',
        discord: 'https://discord.gg/bumba'
      }
    };
  }

  /**
   * Get API keys help
   */
  getAPIKeysHelp() {
    return {
      title: 'API Keys Configuration',
      providers: {
        openai: {
          name: 'OpenAI',
          format: 'sk-...',
          length: 51,
          docs: 'https://platform.openai.com/api-keys',
          steps: [
            'Visit https://platform.openai.com',
            'Sign in or create account',
            'Go to API Keys section',
            'Click "Create new secret key"',
            'Copy the key (starts with sk-)',
            'Paste when prompted'
          ],
          troubleshooting: [
            'Ensure billing is set up in your OpenAI account',
            'Check API key hasn\'t expired',
            'Verify you have API access (not just ChatGPT Plus)'
          ]
        },
        anthropic: {
          name: 'Anthropic',
          format: 'sk-ant-...',
          length: 103,
          docs: 'https://console.anthropic.com/settings/keys',
          steps: [
            'Visit https://console.anthropic.com',
            'Sign in or create account',
            'Navigate to Settings > API Keys',
            'Click "Create Key"',
            'Name your key and set permissions',
            'Copy the key (starts with sk-ant-)'
          ],
          troubleshooting: [
            'Ensure you have API access approved',
            'Check your usage limits',
            'Verify key permissions match your needs'
          ]
        },
        google: {
          name: 'Google AI',
          format: 'AIza...',
          length: '39-40',
          docs: 'https://makersuite.google.com/app/apikey',
          steps: [
            'Visit Google AI Studio',
            'Sign in with Google account',
            'Click "Get API Key"',
            'Select or create a project',
            'Copy the generated key'
          ],
          troubleshooting: [
            'Enable Generative AI API in Google Cloud Console',
            'Check project quotas and billing',
            'Verify API is enabled for your region'
          ]
        },
        github: {
          name: 'GitHub',
          format: 'ghp_...',
          length: 40,
          docs: 'https://github.com/settings/tokens',
          steps: [
            'Go to GitHub Settings',
            'Navigate to Developer settings',
            'Select Personal access tokens > Tokens (classic)',
            'Click "Generate new token"',
            'Select scopes (repo, read:user minimum)',
            'Generate and copy token'
          ],
          troubleshooting: [
            'Ensure token has required scopes',
            'Check token hasn\'t expired',
            'Verify organization permissions if applicable'
          ]
        },
        notion: {
          name: 'Notion',
          format: 'secret_...',
          length: 50,
          docs: 'https://www.notion.so/my-integrations',
          steps: [
            'Visit https://www.notion.so/my-integrations',
            'Click "New integration"',
            'Name your integration',
            'Select workspace',
            'Copy the Internal Integration Token',
            'Share pages with your integration'
          ],
          troubleshooting: [
            'Ensure pages are shared with integration',
            'Check workspace permissions',
            'Verify integration capabilities match needs'
          ]
        }
      }
    };
  }

  /**
   * Get MCP help
   */
  getMCPHelp() {
    return {
      title: 'MCP (Model Context Protocol) Configuration',
      overview: `
MCP servers extend Claude's capabilities with tools for:
• File system access
• GitHub operations  
• Web fetching
• Database connections
• And more...
      `,
      servers: {
        filesystem: {
          name: 'Filesystem',
          description: 'Read/write files on your computer',
          use_cases: [
            'Edit code files',
            'Create new files',
            'Read documentation',
            'Manage project structure'
          ],
          security: 'Only accesses paths you explicitly allow'
        },
        github: {
          name: 'GitHub',
          description: 'Interact with GitHub repositories',
          use_cases: [
            'Create pull requests',
            'Review code',
            'Manage issues',
            'Check CI/CD status'
          ],
          requirements: 'Requires GitHub personal access token'
        },
        memory: {
          name: 'Memory',
          description: 'Persistent memory across conversations',
          use_cases: [
            'Remember project context',
            'Store user preferences',
            'Track ongoing tasks',
            'Maintain state'
          ],
          security: 'Data stored locally only'
        }
      },
      installation: `
MCP servers are installed via npm:
1. The wizard will generate claude_desktop_config.json
2. Restart Claude Desktop to activate
3. Servers are installed on-demand via npx
      `,
      troubleshooting: [
        'Ensure Node.js and npm are installed',
        'Check claude_desktop_config.json syntax',
        'Restart Claude Desktop after changes',
        'Verify server permissions in Claude settings'
      ]
    };
  }

  /**
   * Get Bridge help
   */
  getBridgeHelp() {
    return {
      title: 'Universal Bridge Configuration',
      overview: `
The Universal Bridge allows non-Claude AI models to access tools:
• Acts as a local proxy server
• Translates tool calls between formats
• Manages authentication securely
• Provides unified interface
      `,
      architecture: `
┌─────────────┐     ┌─────────┐     ┌──────────┐
│  AI Model   │────▶│  Bridge │────▶│   Tools  │
│(GPT/Gemini) │     │  (Local)│     │(APIs/MCP)│
└─────────────┘     └─────────┘     └──────────┘
      `,
      features: {
        security: [
          'Runs locally on your machine',
          'No external servers involved',
          'Session-based authentication',
          'API keys never leave your system'
        ],
        compatibility: [
          'OpenAI function calling',
          'Google Gemini tools',
          'Anthropic tool use',
          'Custom tool formats'
        ],
        tools: [
          'File operations',
          'Web search',
          'Code execution',
          'Database queries',
          'API integrations'
        ]
      },
      setup: `
1. Bridge runs on port 3456 by default
2. Configure in your AI client:
   Endpoint: http://localhost:3456/bridge
3. Include session token in headers
4. Bridge handles tool routing
      `,
      troubleshooting: [
        'Check if port 3456 is available',
        'Verify firewall allows local connections',
        'Ensure Bridge service is running',
        'Check session token is valid'
      ]
    };
  }

  /**
   * Get troubleshooting help
   */
  getTroubleshootingHelp() {
    return {
      title: 'Troubleshooting Guide',
      common_issues: {
        'Setup wizard won\'t start': {
          causes: ['Missing dependencies', 'Permission issues'],
          solutions: [
            'Run: npm install',
            'Check Node.js version (14+)',
            'Try with elevated permissions'
          ]
        },
        'API key validation fails': {
          causes: ['Invalid format', 'Expired key', 'Network issues'],
          solutions: [
            'Double-check key format',
            'Generate a new key',
            'Check internet connection',
            'Verify API service status'
          ]
        },
        'MCP servers not working': {
          causes: ['Config syntax error', 'Claude not restarted', 'Missing npm'],
          solutions: [
            'Validate JSON syntax',
            'Restart Claude Desktop',
            'Ensure npm is in PATH',
            'Check server logs'
          ]
        },
        'Bridge connection refused': {
          causes: ['Port blocked', 'Service not running', 'Firewall'],
          solutions: [
            'Check port availability',
            'Start Bridge service',
            'Allow localhost connections',
            'Try different port'
          ]
        },
        'Configuration not saving': {
          causes: ['Permission denied', 'Disk full', 'Invalid path'],
          solutions: [
            'Check write permissions',
            'Free up disk space',
            'Verify config directory exists',
            'Run as administrator (Windows)'
          ]
        }
      },
      diagnostic_commands: [
        'bumba doctor - Run system diagnostics',
        'bumba status - Check service status',
        'bumba config --validate - Validate configuration',
        'bumba logs - View recent logs',
        'bumba reset - Reset to defaults'
      ],
      log_locations: {
        setup: '.bumba/logs/setup.log',
        bridge: '.bumba/logs/bridge.log',
        errors: '.bumba/logs/errors.log'
      }
    };
  }

  /**
   * Get examples
   */
  getExamples() {
    return {
      title: 'Configuration Examples',
      env_file: `
# Example .env file
OPENAI_API_KEY=<openai-api-key>
ANTHROPIC_API_KEY=sk-ant-api03-xyz789...
GITHUB_TOKEN=<github-token>
NOTION_API_KEY=<notion-token>

# Bridge Configuration
BRIDGE_PORT=3456
BRIDGE_HOST=localhost
BRIDGE_SECRET=your-secret-key
      `,
      mcp_config: `
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "<github-token>"
      }
    }
  }
}
      `,
      bridge_request: `
// Example Bridge API Request
POST http://localhost:3456/bridge/tool
Headers:
  Authorization: Bearer <session-token>
  Content-Type: application/json

Body:
{
  "tool": "filesystem.read",
  "parameters": {
    "path": "/path/to/file.txt"
  }
}
      `,
      usage_examples: {
        'OpenAI with Bridge': `
const openai = new OpenAI({
  baseURL: 'http://localhost:3456/bridge/openai',
  apiKey: process.env.OPENAI_API_KEY
});

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: [...] // Bridge handles tool execution
});
        `,
        'Direct Bridge Call': `
const response = await fetch('http://localhost:3456/bridge/execute', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${sessionToken}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tool: 'web_search',
    query: 'latest AI news'
  })
});
        `
      }
    };
  }

  /**
   * Get available commands
   */
  getCommands() {
    return {
      title: 'Available Commands',
      setup: {
        'bumba setup': 'Start interactive setup wizard',
        'bumba setup --resume': 'Resume interrupted setup',
        'bumba setup --reset': 'Reset all configurations',
        'bumba setup --minimal': 'Quick setup with defaults'
      },
      configuration: {
        'bumba config': 'View current configuration',
        'bumba config --edit': 'Edit configuration',
        'bumba config --validate': 'Validate configuration',
        'bumba config --export': 'Export configuration'
      },
      bridge: {
        'bumba bridge start': 'Start Bridge service',
        'bumba bridge stop': 'Stop Bridge service',
        'bumba bridge status': 'Check Bridge status',
        'bumba bridge logs': 'View Bridge logs'
      },
      testing: {
        'bumba test': 'Run all tests',
        'bumba test api': 'Test API connections',
        'bumba test mcp': 'Test MCP servers',
        'bumba test bridge': 'Test Bridge functionality'
      },
      utilities: {
        'bumba doctor': 'Run diagnostics',
        'bumba update': 'Update BUMBA',
        'bumba help [topic]': 'Get help on topic',
        'bumba version': 'Show version info'
      }
    };
  }

  /**
   * Get context-sensitive help
   */
  getContextHelp() {
    return {
      'api_key_input': {
        title: 'Entering API Keys',
        tips: [
          'Paste the complete key including prefix',
          'Keys are hidden while typing for security',
          'Press Enter when done',
          'Leave blank to skip'
        ]
      },
      'provider_selection': {
        title: 'Selecting Providers',
        tips: [
          'Use arrow keys to navigate',
          'Space to select/deselect',
          'Enter to confirm selection',
          'Select all providers you plan to use'
        ]
      },
      'mcp_configuration': {
        title: 'MCP Server Selection',
        tips: [
          'Filesystem and Memory are recommended',
          'Only select servers you need',
          'Additional servers can be added later',
          'Each server requires Claude restart'
        ]
      },
      'bridge_setup': {
        title: 'Bridge Configuration',
        tips: [
          'Default port 3456 usually works',
          'Session tokens expire after 24 hours',
          'Bridge runs locally for security',
          'Can be disabled if not needed'
        ]
      },
      'validation': {
        title: 'Configuration Validation',
        tips: [
          'Yellow warnings can be ignored',
          'Red errors must be fixed',
          'Test each service individually',
          'Check logs for details'
        ]
      }
    };
  }

  /**
   * Get quick tips
   */
  getQuickTips() {
    return [
      '💡 Your API keys are never sent to external servers',
      '💡 Setup progress is auto-saved every 5 seconds',
      '💡 Press Ctrl+C to safely exit and resume later',
      '💡 Use "bumba doctor" to diagnose issues',
      '💡 MCP servers require Claude Desktop restart',
      '💡 Bridge allows GPT/Gemini to use Claude tools',
      '💡 Check .bumba/logs for detailed error info',
      '💡 Run "bumba help [topic]" for specific help',
      '💡 Your configs are backed up before changes',
      '💡 Use --verbose flag for detailed output'
    ];
  }

  /**
   * Display help for a topic
   */
  displayHelp(topic = 'general') {
    const help = this.topics[topic];
    
    if (!help) {
      console.log(chalk.yellow(`Unknown help topic: ${topic}`));
      console.log(chalk.cyan('Available topics:'), Object.keys(this.topics).join(', '));
      return;
    }
    
    // Display title
    console.log(boxen(
      chalk.bold.cyan(help.title),
      {
        padding: 1,
        borderStyle: 'double',
        borderColor: 'cyan'
      }
    ));
    
    // Display content based on structure
    if (help.sections) {
      help.sections.forEach(section => {
        console.log(chalk.yellow.bold(`\n${section.name}:`));
        console.log(section.content);
      });
    }
    
    if (help.overview) {
      console.log(chalk.white(help.overview));
    }
    
    // Display additional information
    if (help.links) {
      console.log(chalk.yellow.bold('\n📚 Resources:'));
      Object.entries(help.links).forEach(([name, url]) => {
        console.log(chalk.cyan(`  ${name}: ${url}`));
      });
    }
  }

  /**
   * Display context help
   */
  displayContextHelp(context) {
    const help = this.contextHelp[context];
    
    if (!help) {
      return this.displayQuickTip();
    }
    
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.cyan.bold(`ℹ️  ${help.title}`));
    help.tips.forEach(tip => {
      console.log(chalk.dim(`  • ${tip}`));
    });
    console.log(chalk.dim('─'.repeat(50)));
  }

  /**
   * Display a random quick tip
   */
  displayQuickTip() {
    const tip = this.tips[Math.floor(Math.random() * this.tips.length)];
    console.log(chalk.dim(tip));
  }

  /**
   * Display troubleshooting for an error
   */
  displayTroubleshooting(error) {
    const troubleshooting = this.topics.troubleshooting;
    const issueKey = Object.keys(troubleshooting.common_issues).find(key =>
      error.message.toLowerCase().includes(key.toLowerCase())
    );
    
    if (issueKey) {
      const issue = troubleshooting.common_issues[issueKey];
      console.log(chalk.yellow.bold('\n🔧 Troubleshooting:'));
      console.log(chalk.white(`Issue: ${issueKey}`));
      console.log(chalk.dim('Possible causes:'));
      issue.causes.forEach(cause => {
        console.log(chalk.dim(`  • ${cause}`));
      });
      console.log(chalk.green('Solutions:'));
      issue.solutions.forEach(solution => {
        console.log(chalk.green(`  ✓ ${solution}`));
      });
    }
  }

  /**
   * Get formatted example
   */
  getFormattedExample(type) {
    const examples = this.topics.examples;
    
    switch (type) {
      case 'env':
        return examples.env_file;
      case 'mcp':
        return examples.mcp_config;
      case 'bridge':
        return examples.bridge_request;
      default:
        return null;
    }
  }

  /**
   * Search help content
   */
  searchHelp(query) {
    const results = [];
    const searchTerm = query.toLowerCase();
    
    // Search through all topics
    Object.entries(this.topics).forEach(([topicName, topic]) => {
      const content = JSON.stringify(topic).toLowerCase();
      if (content.includes(searchTerm)) {
        results.push({
          topic: topicName,
          title: topic.title,
          relevance: (content.match(new RegExp(searchTerm, 'g')) || []).length
        });
      }
    });
    
    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    
    return results;
  }

  /**
   * Export help as markdown
   */
  exportAsMarkdown() {
    let markdown = '# BUMBA Setup Wizard Help Documentation\n\n';
    
    Object.entries(this.topics).forEach(([topicName, topic]) => {
      markdown += `## ${topic.title}\n\n`;
      
      if (topic.sections) {
        topic.sections.forEach(section => {
          markdown += `### ${section.name}\n\n`;
          markdown += `${section.content.trim()}\n\n`;
        });
      }
      
      if (topic.overview) {
        markdown += `${topic.overview.trim()}\n\n`;
      }
      
      markdown += '---\n\n';
    });
    
    return markdown;
  }
}

module.exports = HelpSystem;