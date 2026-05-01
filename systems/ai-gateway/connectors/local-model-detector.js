/**
 * Local Model Detector
 * Sprint 2.18: Detects and connects to locally-hosted AI models
 *
 * Supports:
 * - Ollama (http://localhost:11434)
 * - Docker containers running model servers
 * - LocalAI, vLLM, and other local inference servers
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const http = require('http');

const execAsync = promisify(exec);

/**
 * Supported local model providers
 */
const LocalProvider = {
  OLLAMA: 'ollama',
  DOCKER: 'docker',
  LOCALAI: 'localai',
  VLLM: 'vllm'
};

/**
 * LocalModelDetector - Discovers and manages local model availability
 */
class LocalModelDetector {
  constructor(config = {}) {
    this.config = {
      ollamaEndpoint: config.ollamaEndpoint || 'http://localhost:11434',
      dockerSocketPath: config.dockerSocketPath || '/var/run/docker.sock',
      localAIEndpoint: config.localAIEndpoint || 'http://localhost:8080',
      checkInterval: config.checkInterval || 60000, // 1 minute
      enabled: config.enabled !== false,
      ...config
    };

    this.availableModels = [];
    this.lastCheck = null;
    this.providers = {
      [LocalProvider.OLLAMA]: false,
      [LocalProvider.DOCKER]: false,
      [LocalProvider.LOCALAI]: false,
      [LocalProvider.VLLM]: false
    };
  }

  /**
   * Initialize detector - check for available providers
   */
  async initialize() {
    if (!this.config.enabled) {
      logger.info('Local model detection disabled');
      return;
    }

    logger.info('🔍 Initializing local model detector...');

    // Check for Ollama
    this.providers[LocalProvider.OLLAMA] = await this.checkOllama();

    // Check for Docker
    this.providers[LocalProvider.DOCKER] = await this.checkDocker();

    // Check for LocalAI
    this.providers[LocalProvider.LOCALAI] = await this.checkLocalAI();

    // Discover available models
    await this.discoverModels();

    this.lastCheck = Date.now();

    logger.info(`✅ Local model detector initialized: ${this.availableModels.length} models found`);
  }

  /**
   * Check if Ollama is running
   */
  async checkOllama() {
    try {
      const response = await this.httpGet(`${this.config.ollamaEndpoint}/api/version`);
      if (response.statusCode === 200) {
        logger.info('✅ Ollama detected and running');
        return true;
      }
    } catch (error) {
      logger.debug('Ollama not detected:', error.message);
    }
    return false;
  }

  /**
   * Check if Docker is installed and running
   */
  async checkDocker() {
    try {
      const { stdout } = await execAsync('docker --version');
      if (stdout.includes('Docker version')) {
        logger.info('✅ Docker detected:', stdout.trim());

        // Check if Docker daemon is running
        try {
          await execAsync('docker ps');
          logger.info('✅ Docker daemon is running');
          return true;
        } catch (error) {
          logger.warn('Docker installed but daemon not running');
          return false;
        }
      }
    } catch (error) {
      logger.debug('Docker not detected:', error.message);
    }
    return false;
  }

  /**
   * Check if LocalAI is running
   */
  async checkLocalAI() {
    try {
      const response = await this.httpGet(`${this.config.localAIEndpoint}/readyz`);
      if (response.statusCode === 200) {
        logger.info('✅ LocalAI detected and running');
        return true;
      }
    } catch (error) {
      logger.debug('LocalAI not detected:', error.message);
    }
    return false;
  }

  /**
   * Discover available models from all providers
   */
  async discoverModels() {
    this.availableModels = [];

    // Discover Ollama models
    if (this.providers[LocalProvider.OLLAMA]) {
      const ollamaModels = await this.discoverOllamaModels();
      this.availableModels.push(...ollamaModels);
    }

    // Discover Docker container models
    if (this.providers[LocalProvider.DOCKER]) {
      const dockerModels = await this.discoverDockerModels();
      this.availableModels.push(...dockerModels);
    }

    // Discover LocalAI models
    if (this.providers[LocalProvider.LOCALAI]) {
      const localAIModels = await this.discoverLocalAIModels();
      this.availableModels.push(...localAIModels);
    }

    logger.info(`📦 Discovered ${this.availableModels.length} local models`);
    return this.availableModels;
  }

  /**
   * Discover Ollama models
   */
  async discoverOllamaModels() {
    try {
      const response = await this.httpGet(`${this.config.ollamaEndpoint}/api/tags`);
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        const models = data.models || [];

        return models.map(model => ({
          name: model.name,
          provider: LocalProvider.OLLAMA,
          endpoint: this.config.ollamaEndpoint,
          size: model.size,
          modified: model.modified_at,
          details: model.details || {},
          available: true
        }));
      }
    } catch (error) {
      logger.error('Failed to discover Ollama models:', error.message);
    }
    return [];
  }

  /**
   * Discover models in Docker containers
   */
  async discoverDockerModels() {
    try {
      // Look for containers with model servers
      const { stdout } = await execAsync('docker ps --format "{{.Names}}\t{{.Image}}"');
      const containers = stdout.trim().split('\n');

      const models = [];

      for (const container of containers) {
        const [name, image] = container.split('\t');

        // Check for known model server images
        if (image.includes('ollama') || image.includes('localai') || image.includes('vllm')) {
          models.push({
            name: name,
            provider: LocalProvider.DOCKER,
            image: image,
            endpoint: `http://localhost`, // Would need port mapping inspection
            available: true
          });
        }
      }

      return models;
    } catch (error) {
      logger.error('Failed to discover Docker models:', error.message);
    }
    return [];
  }

  /**
   * Discover LocalAI models
   */
  async discoverLocalAIModels() {
    try {
      const response = await this.httpGet(`${this.config.localAIEndpoint}/v1/models`);
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        const models = data.data || [];

        return models.map(model => ({
          name: model.id,
          provider: LocalProvider.LOCALAI,
          endpoint: this.config.localAIEndpoint,
          available: true
        }));
      }
    } catch (error) {
      logger.error('Failed to discover LocalAI models:', error.message);
    }
    return [];
  }

  /**
   * Check if a specific model is available
   */
  async isAvailable(modelName) {
    // Refresh model list if stale (> 1 minute)
    if (!this.lastCheck || Date.now() - this.lastCheck > this.config.checkInterval) {
      await this.discoverModels();
    }

    return this.availableModels.some(model => model.name === modelName && model.available);
  }

  /**
   * Get model information
   */
  getModelInfo(modelName) {
    return this.availableModels.find(model => model.name === modelName);
  }

  /**
   * Get all available models
   */
  getAvailableModels() {
    return this.availableModels;
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider) {
    return this.availableModels.filter(model => model.provider === provider);
  }

  /**
   * Refresh model availability (manual refresh)
   */
  async refresh() {
    logger.info('🔄 Refreshing local model availability...');
    await this.initialize();
  }

  /**
   * Get provider status
   */
  getProviderStatus() {
    return {
      providers: this.providers,
      modelCount: this.availableModels.length,
      lastCheck: this.lastCheck,
      enabled: this.config.enabled
    };
  }

  /**
   * Helper: Make HTTP GET request
   */
  httpGet(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }
}

// Singleton instance
let instance = null;

module.exports = {
  LocalModelDetector,
  LocalProvider,
  getInstance: (config) => {
    if (!instance) {
      instance = new LocalModelDetector(config);
    }
    return instance;
  }
};
