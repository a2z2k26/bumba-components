/**
 * Ollama Client
 * Sprint 2.18: Interface for calling Ollama local models
 *
 * API Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

const http = require('http');

/**
 * OllamaClient - Interface for Ollama API
 */
class OllamaClient {
  constructor(config = {}) {
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.timeout = config.timeout || 120000; // 2 minutes default
    this.maxRetries = config.maxRetries || 2;
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const response = await this.request('/api/tags', 'GET');
      return response.models || [];
    } catch (error) {
      logger.error('Failed to list Ollama models:', error.message);
      throw error;
    }
  }

  /**
   * Generate completion (streaming disabled)
   */
  async generate(modelName, prompt, options = {}) {
    const payload = {
      model: modelName,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40,
        ...options
      }
    };

    try {
      logger.debug(`Calling Ollama model: ${modelName}`);
      const response = await this.request('/api/generate', 'POST', payload);

      return {
        model: response.model,
        response: response.response,
        done: response.done,
        context: response.context,
        total_duration: response.total_duration,
        load_duration: response.load_duration,
        prompt_eval_count: response.prompt_eval_count,
        eval_count: response.eval_count,
        eval_duration: response.eval_duration
      };
    } catch (error) {
      logger.error(`Ollama generate failed for ${modelName}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate chat completion
   */
  async chat(modelName, messages, options = {}) {
    const payload = {
      model: modelName,
      messages,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        ...options
      }
    };

    try {
      logger.debug(`Ollama chat with ${modelName}`);
      const response = await this.request('/api/chat', 'POST', payload);

      return {
        model: response.model,
        message: response.message,
        done: response.done,
        total_duration: response.total_duration,
        eval_count: response.eval_count
      };
    } catch (error) {
      logger.error(`Ollama chat failed for ${modelName}:`, error.message);
      throw error;
    }
  }

  /**
   * Show model information
   */
  async show(modelName) {
    try {
      const response = await this.request('/api/show', 'POST', { name: modelName });
      return response;
    } catch (error) {
      logger.error(`Failed to show model ${modelName}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if Ollama is running
   */
  async isRunning() {
    try {
      const response = await this.request('/api/version', 'GET', null, 5000);
      return response && response.version;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Ollama version
   */
  async version() {
    try {
      const response = await this.request('/api/version', 'GET');
      return response.version;
    } catch (error) {
      logger.error('Failed to get Ollama version:', error.message);
      return null;
    }
  }

  /**
   * Make HTTP request to Ollama API
   */
  request(path, method = 'GET', body = null, customTimeout = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint + path);
      const options = {
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method,
        timeout: customTimeout || this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const parsed = data ? JSON.parse(data) : {};
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Ollama request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Format prompt for Ollama
   */
  formatPrompt(systemPrompt, userPrompt) {
    if (systemPrompt) {
      return `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
    }
    return userPrompt;
  }

  /**
   * Format messages for chat API
   */
  formatChatMessages(systemPrompt, userPrompt, history = []) {
    const messages = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Add conversation history
    messages.push(...history);

    // Add current user message
    messages.push({
      role: 'user',
      content: userPrompt
    });

    return messages;
  }
}

module.exports = { OllamaClient };
