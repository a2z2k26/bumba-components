/**
 * Tool Bridge Server
 * Core server for multi-model AI access
 * Part of the BUMBA Platform Suite
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const EventEmitter = require('events');

// Import translators and middleware
const OpenAITranslator = require('../translators/openai');
const AnthropicTranslator = require('../translators/anthropic');
const GoogleTranslator = require('../translators/google');
const AuthMiddleware = require('../middleware/auth');
const ErrorHandler = require('../middleware/error-handler');

class ToolBridgeServer extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = config;
    this.app = null;
    this.server = null;
    this.wss = null;
    this.isRunning = false;

    // Initialize translators
    this.translators = {
      openai: new OpenAITranslator(config.apis?.openai),
      anthropic: new AnthropicTranslator(config.apis?.anthropic),
      google: new GoogleTranslator(config.apis?.google)
    };

    // Metrics
    this.metrics = {
      requests: 0,
      errors: 0,
      apiCalls: 0,
      startTime: Date.now()
    };
  }

  async initialize() {
    this.app = express();

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        const corsConfig = this.config.server?.cors;
        if (!corsConfig?.enabled) {
          return callback(new Error('CORS not enabled'));
        }

        const allowed = corsConfig.origins?.some((pattern) => {
          if (pattern === '*') {
            return true;
          }
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(origin);
          }
          return pattern === origin;
        });

        callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
      },
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    if (this.config.server?.rateLimit?.enabled) {
      const limiter = rateLimit({
        windowMs: this.config.server.rateLimit.windowMs || 15 * 60 * 1000,
        max: this.config.server.rateLimit.max || 100,
        message: 'Too many requests from this IP, please try again later.'
      });
      this.app.use('/api/', limiter);
    }

    // Request logging
    this.app.use((req, res, next) => {
      this.metrics.requests++;
      this.emit('request', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });
      next();
    });

    // Setup routes
    this.setupRoutes();

    // Error handling
    this.app.use(ErrorHandler.handle.bind(this));

    this.emit('initialized');
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: Date.now() - this.metrics.startTime,
        metrics: this.metrics
      });
    });

    // Authentication middleware for API routes
    const auth = new AuthMiddleware(this.config);
    if (this.config.server?.auth?.enabled) {
      this.app.use('/api/*', auth.verify.bind(auth));
    }

    // OpenAI-compatible endpoint
    this.app.post('/v1/chat/completions', async (req, res, next) => {
      try {
        this.metrics.apiCalls++;
        const response = await this.translators.openai.handle(req.body);
        res.json(response);
      } catch (error) {
        next(error);
      }
    });

    // Anthropic-compatible endpoint
    this.app.post('/v1/messages', async (req, res, next) => {
      try {
        this.metrics.apiCalls++;
        const response = await this.translators.anthropic.handle(req.body);
        res.json(response);
      } catch (error) {
        next(error);
      }
    });

    // Google AI-compatible endpoint
    this.app.post('/v1beta/models/:model:generateContent', async (req, res, next) => {
      try {
        this.metrics.apiCalls++;
        const response = await this.translators.google.handle(req.body, req.params.model);
        res.json(response);
      } catch (error) {
        next(error);
      }
    });

    // Unified chat endpoint
    this.app.post('/api/chat', async (req, res, next) => {
      try {
        this.metrics.apiCalls++;
        const { messages, model, provider = 'openai' } = req.body;

        const translator = this.translators[provider];
        if (!translator) {
          throw new Error(`Unknown provider: ${provider}`);
        }

        const response = await translator.chat(messages, { model });
        res.json({ success: true, response });
      } catch (error) {
        next(error);
      }
    });

    // List available models
    this.app.get('/api/models', (req, res) => {
      const models = {};

      Object.entries(this.translators).forEach(([provider, translator]) => {
        if (translator.isEnabled()) {
          models[provider] = translator.getModels();
        }
      });

      res.json({ models });
    });

    // Streaming endpoint
    this.app.post('/api/stream/chat', async (req, res, next) => {
      try {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        const { messages, model, provider = 'openai' } = req.body;
        const translator = this.translators[provider];

        if (!translator) {
          throw new Error(`Unknown provider: ${provider}`);
        }

        const stream = await translator.stream(messages, { model });

        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        next(error);
      }
    });

    // Statistics
    this.app.get('/api/stats', (req, res) => {
      res.json({
        metrics: this.metrics,
        providers: Object.entries(this.translators).map(([name, translator]) => ({
          name,
          enabled: translator.isEnabled(),
          models: translator.getModels()
        }))
      });
    });
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on('connection', (ws) => {
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);

          switch (data.type) {
          case 'chat': {
            const response = await this.handleWebSocketChat(data);
            ws.send(JSON.stringify({
              type: 'chat:response',
              id: data.id,
              response
            }));
            break;
          }

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${data.type}`
            }));
          }
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });

      ws.on('error', (error) => {
        this.emit('websocket:error', error);
      });
    });
  }

  async handleWebSocketChat(data) {
    const { messages, provider = 'openai', model } = data;
    const translator = this.translators[provider];

    if (!translator) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return await translator.chat(messages, { model });
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Bridge server is already running');
    }

    await this.initialize();

    return new Promise((resolve, reject) => {
      const port = this.config.server?.port || 3456;
      const host = this.config.server?.host || 'localhost';

      this.server = this.app.listen(port, host, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.isRunning = true;

        // Setup WebSocket
        this.setupWebSocket();

        this.emit('started', { port, host });

        resolve({
          port,
          host,
          url: `http://${host}:${port}`
        });
      });
    });
  }

  async stop() {
    if (!this.isRunning) {
      throw new Error('Bridge server is not running');
    }

    return new Promise((resolve) => {
      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close HTTP server
      this.server.close(() => {
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      });
    });
  }

  async restart() {
    if (this.isRunning) {
      await this.stop();
    }
    await this.start();
  }

  getStatus() {
    return {
      running: this.isRunning,
      url: this.isRunning ? `http://${this.config.server?.host}:${this.config.server?.port}` : null,
      metrics: this.metrics,
      uptime: Date.now() - this.metrics.startTime
    };
  }
}

module.exports = ToolBridgeServer;