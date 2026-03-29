/**
 * Figma MCP Server Bridge
 * Connects BUMBA CLI to the MCP Figma server for enhanced operations
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

class FigmaMCPBridge extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.mcpProcess = null;
    this.connected = false;
    this.messageBuffer = [];
  }

  /**
   * Start the MCP Figma server
   */
  async start() {
    if (this.connected) return;

    console.log('🔌 Starting Figma MCP server...');

    try {
      // Check if MCP is enabled
      if (!this.config.get('mcp.figma.enabled')) {
        console.log('ℹ️  Figma MCP server is disabled in config');
        return false;
      }

      // Get Figma token
      const token = this.config.get('figma.accessToken');
      if (!token || token === 'mock_token_for_testing') {
        console.log('⚠️  No valid Figma token for MCP server');
        return false;
      }

      // Spawn the MCP server process
      this.mcpProcess = spawn('npx', [
        '-y',
        '@modelcontextprotocol/server-figma'
      ], {
        env: {
          ...process.env,
          FIGMA_ACCESS_TOKEN: token
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle stdout (MCP responses)
      this.mcpProcess.stdout.on('data', (data) => {
        this.handleMCPResponse(data.toString());
      });

      // Handle stderr (errors/logs)
      this.mcpProcess.stderr.on('data', (data) => {
        console.error('MCP Error:', data.toString());
      });

      // Handle process exit
      this.mcpProcess.on('close', (code) => {
        console.log(`MCP server exited with code ${code}`);
        this.connected = false;
      });

      this.connected = true;
      console.log('✅ Figma MCP server started');

      return true;
    } catch (error) {
      console.error('❌ Failed to start MCP server:', error);
      return false;
    }
  }

  /**
   * Send a request to the MCP server
   */
  async request(method, params = {}) {
    if (!this.connected) {
      throw new Error('MCP server not connected');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    // Send to MCP server via stdin
    this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MCP request timeout'));
      }, 10000);

      const handler = (response) => {
        if (response.id === request.id) {
          clearTimeout(timeout);
          this.removeListener('response', handler);

          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };

      this.on('response', handler);
    });
  }

  /**
   * Handle MCP server responses
   */
  handleMCPResponse(data) {
    try {
      // MCP uses JSON-RPC, responses may be line-delimited
      const lines = data.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          this.emit('response', response);
        } catch (e) {
          // Not JSON, might be a log message
          console.log('MCP:', line);
        }
      }
    } catch (error) {
      console.error('Error parsing MCP response:', error);
    }
  }

  /**
   * Enhanced Figma operations via MCP
   */
  async getFileWithComments(fileKey) {
    return this.request('figma_get_file', {
      file_key: fileKey,
      include_comments: true
    });
  }

  async getTeamProjects(teamId) {
    return this.request('figma_get_team_projects', {
      team_id: teamId
    });
  }

  async postComment(fileKey, message, nodeId = null) {
    return this.request('figma_post_comment', {
      file_key: fileKey,
      message,
      node_id: nodeId
    });
  }

  async getProjectFiles(projectId) {
    return this.request('figma_get_project_files', {
      project_id: projectId
    });
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.connected = false;
      console.log('🛑 Figma MCP server stopped');
    }
  }
}

module.exports = FigmaMCPBridge;