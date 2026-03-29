/**
 * Plugin Bridge - Communication layer between Figma Plugin and BUMBA CLI
 * Handles real-time sync and token exchange
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
// Optional dependencies - fallback for testing without express/ws
let express, cors, WebSocket;
try {
  express = require('express');
  cors = require('cors');
  WebSocket = require('ws');
} catch (e) {
  // Fallback for testing
}

class PluginBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 3001;
    this.wsPort = options.wsPort || 3002;
    this.app = express ? express() : null;
    this.server = null;
    this.wsServer = null;
    this.connectedPlugins = new Map();
    this.sessionToken = this.generateSessionToken();

    if (express) {
      this.setupExpress();
      this.setupWebSocket();
    }
  }

  setupExpress() {
    // Middleware
    this.app.use(cors({
      origin: ['https://www.figma.com', 'http://localhost:*'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        connectedPlugins: this.connectedPlugins.size
      });
    });

    // Token submission endpoint
    this.app.post('/api/tokens', async (req, res) => {
      try {
        const { tokens, metadata, sessionId } = req.body;

        if (!this.validateSession(sessionId)) {
          return res.status(401).json({ error: 'Invalid session' });
        }

        // Process tokens through MCP bridge
        const result = await this.processTokens(tokens, metadata);

        res.json({
          success: true,
          processed: result.processed,
          stored: result.stored,
          indexed: result.indexed,
          timestamp: new Date().toISOString()
        });

        // Emit event for other systems
        this.emit('tokens:received', { tokens, metadata, result });

      } catch (error) {
        console.error('Token processing error:', error);
        res.status(500).json({
          error: 'Token processing failed',
          message: error.message
        });
      }
    });

    // Sync status endpoint
    this.app.get('/api/sync/status', (req, res) => {
      res.json({
        status: 'connected',
        lastSync: this.lastSyncTime,
        pendingChanges: this.getPendingChanges(),
        cliVersion: this.getCLIVersion()
      });
    });

    // Plugin registration
    this.app.post('/api/register', (req, res) => {
      const { pluginId, version, capabilities } = req.body;
      const sessionId = this.generateSessionToken();

      this.connectedPlugins.set(pluginId, {
        sessionId,
        version,
        capabilities,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      res.json({
        sessionId,
        endpoints: this.getEndpoints(),
        wsUrl: `ws://localhost:${this.wsPort}`
      });

      this.emit('plugin:connected', { pluginId, version, capabilities });
    });

    // Component search endpoint
    this.app.get('/api/components/search', async (req, res) => {
      try {
        const { query, limit = 10 } = req.query;

        // Use MCP Pinecone integration for component search
        const results = await this.searchComponents(query, limit);

        res.json({
          results,
          total: results.length,
          query
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupWebSocket() {
    this.wsServer = new WebSocket.Server({
      port: this.wsPort,
      cors: {
        origin: '*'
      }
    });

    this.wsServer.on('connection', (ws, req) => {
      console.log('Plugin WebSocket connected');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });

      ws.on('close', () => {
        console.log('Plugin WebSocket disconnected');
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        sessionToken: this.sessionToken,
        serverTime: new Date().toISOString()
      }));
    });
  }

  async handleWebSocketMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      case 'tokens:stream':
        // Handle streaming token updates
        await this.streamTokens(payload);
        ws.send(JSON.stringify({
          type: 'tokens:processed',
          count: payload.tokens?.length || 0
        }));
        break;

      case 'file:watch':
        // Start watching Figma file for changes
        this.watchFigmaFile(payload.fileKey, ws);
        break;

      case 'export:request':
        // Handle export requests
        const exportResult = await this.handleExportRequest(payload);
        ws.send(JSON.stringify({
          type: 'export:complete',
          result: exportResult
        }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: `Unknown message type: ${type}`
        }));
    }
  }

  async processTokens(tokens, metadata) {
    // This integrates with the MCP Bridge Interface
    const mcpBridge = require('./mcp-bridge-interface');

    try {
      // Store in memory
      await mcpBridge.callMCP('memory', 'store', {
        key: `tokens:${metadata.fileKey}`,
        value: { tokens, metadata, timestamp: Date.now() }
      });

      // Save to filesystem
      await mcpBridge.callMCP('filesystem', 'write', {
        path: `.bumba-design/tokens/${metadata.fileName || 'tokens'}.json`,
        content: JSON.stringify({ tokens, metadata }, null, 2)
      });

      // Index for search if Pinecone is available
      let indexed = false;
      try {
        await mcpBridge.callMCP('pinecone', 'index', {
          namespace: 'design-tokens',
          vectors: this.tokensToVectors(tokens)
        });
        indexed = true;
      } catch (error) {
        console.warn('Pinecone indexing failed:', error.message);
      }

      return {
        processed: tokens.length,
        stored: true,
        indexed
      };

    } catch (error) {
      console.error('MCP processing error:', error);
      throw new Error(`Token processing failed: ${error.message}`);
    }
  }

  async searchComponents(query, limit) {
    const mcpBridge = require('./mcp-bridge-interface');

    try {
      const results = await mcpBridge.callMCP('pinecone', 'search', {
        namespace: 'design-components',
        query,
        topK: limit
      });

      return results.matches || [];
    } catch (error) {
      console.warn('Component search failed:', error.message);
      return [];
    }
  }

  async streamTokens(payload) {
    // Handle real-time token streaming
    const { tokens, incremental, fileKey } = payload;

    if (incremental) {
      // Merge with existing tokens
      const existing = await this.getExistingTokens(fileKey);
      const merged = this.mergeTokens(existing, tokens);
      await this.processTokens(merged, { fileKey, incremental: true });
    } else {
      await this.processTokens(tokens, { fileKey });
    }

    this.emit('tokens:updated', { fileKey, tokens, incremental });
  }

  watchFigmaFile(fileKey, ws) {
    // Set up file watching (would integrate with Figma webhooks in production)
    console.log(`Watching Figma file: ${fileKey}`);

    // Simulate file change detection
    const checkInterval = setInterval(async () => {
      try {
        // In real implementation, this would check Figma API for changes
        const hasChanges = await this.checkForChanges(fileKey);

        if (hasChanges) {
          ws.send(JSON.stringify({
            type: 'file:changed',
            fileKey,
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error('File watch error:', error);
      }
    }, 30000); // Check every 30 seconds

    // Store interval for cleanup
    if (!this.fileWatchers) this.fileWatchers = new Map();
    this.fileWatchers.set(fileKey, checkInterval);
  }

  tokensToVectors(tokens) {
    // Convert design tokens to vectors for search indexing
    return tokens.map(token => ({
      id: token.id || crypto.randomUUID(),
      values: this.tokenToVector(token),
      metadata: {
        type: token.type,
        name: token.name,
        description: token.description
      }
    }));
  }

  tokenToVector(token) {
    // Simple vectorization (would use proper embedding in production)
    const features = [];

    // Basic feature extraction
    if (token.type === 'color') {
      features.push(...this.colorToFeatures(token));
    } else if (token.type === 'typography') {
      features.push(...this.typographyToFeatures(token));
    }

    // Pad or truncate to consistent length
    while (features.length < 128) features.push(0);
    return features.slice(0, 128);
  }

  colorToFeatures(token) {
    const { rgb } = token;
    return [
      rgb.r / 255,
      rgb.g / 255,
      rgb.b / 255,
      rgb.a || 1
    ];
  }

  typographyToFeatures(token) {
    const { value } = token;
    return [
      value.fontSize?.px || 16,
      value.fontWeight || 400,
      value.lineHeight?.unitless || 1.4
    ];
  }

  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  validateSession(sessionId) {
    return Array.from(this.connectedPlugins.values())
      .some(plugin => plugin.sessionId === sessionId);
  }

  getEndpoints() {
    return {
      tokens: `http://localhost:${this.port}/api/tokens`,
      status: `http://localhost:${this.port}/api/sync/status`,
      search: `http://localhost:${this.port}/api/components/search`,
      health: `http://localhost:${this.port}/health`
    };
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
          return;
        }

        console.log(`Plugin Bridge running on port ${this.port}`);
        console.log(`WebSocket server running on port ${this.wsPort}`);

        this.emit('started');
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      this.server.close();
    }
    if (this.wsServer) {
      this.wsServer.close();
    }

    // Clean up file watchers
    if (this.fileWatchers) {
      this.fileWatchers.forEach(interval => clearInterval(interval));
      this.fileWatchers.clear();
    }

    this.emit('stopped');
  }

  // Helper methods
  async getExistingTokens(fileKey) {
    // Implementation would fetch from MCP memory
    return [];
  }

  mergeTokens(existing, updates) {
    // Implementation would intelligently merge token sets
    return [...existing, ...updates];
  }

  async checkForChanges(fileKey) {
    // Implementation would check Figma API for file modifications
    return false;
  }

  getPendingChanges() {
    // Implementation would return pending changes count
    return 0;
  }

  getCLIVersion() {
    // Implementation would return actual CLI version
    return '1.0.0';
  }

  async handleExportRequest(payload) {
    // Implementation would handle various export formats
    return { success: true, format: payload.format };
  }
}

module.exports = PluginBridge;