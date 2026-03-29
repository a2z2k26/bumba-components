const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;

class LocalLLaMAProvider extends EventEmitter {
  constructor(config = {}) {
    super();
    this.modelPath = config.modelPath || process.env.LLAMA_MODEL_PATH;
    this.serverPort = config.serverPort || 8080;
    this.serverHost = config.serverHost || 'localhost';
    this.executablePath = config.executablePath || 'llama.cpp/main';
    this.serverExecutable = config.serverExecutable || 'llama.cpp/server';
    this.contextSize = config.contextSize || 2048;
    this.threads = config.threads || 4;
    this.gpuLayers = config.gpuLayers || 0;
    this.models = new Map();
    this.serverProcess = null;
    this.isServerRunning = false;

    // Performance settings
    this.batchSize = config.batchSize || 512;
    this.temperature = config.temperature || 0.7;
    this.topK = config.topK || 40;
    this.topP = config.topP || 0.95;
    this.repeatPenalty = config.repeatPenalty || 1.1;

    // Usage tracking (local, no cost)
    this.usage = {
      requests: 0,
      tokens: 0,
      sessionStart: Date.now()
    };

    this.initializeModels();
  }

  initializeModels() {
    // LLaMA 2 Models
    this.models.set('llama-2-7b', {
      id: 'llama-2-7b',
      contextLength: 4096,
      size: '7B',
      quantization: ['Q4_0', 'Q4_K_M', 'Q5_K_M', 'Q8_0'],
      capabilities: ['chat', 'completion'],
      tier: 'base',
      description: 'Base LLaMA 2 7B model',
      requirements: { ram: '4GB', vram: '6GB' }
    });

    this.models.set('llama-2-13b', {
      id: 'llama-2-13b',
      contextLength: 4096,
      size: '13B',
      quantization: ['Q4_0', 'Q4_K_M', 'Q5_K_M'],
      capabilities: ['chat', 'completion'],
      tier: 'standard',
      description: 'LLaMA 2 13B model',
      requirements: { ram: '8GB', vram: '10GB' }
    });

    this.models.set('llama-2-70b', {
      id: 'llama-2-70b',
      contextLength: 4096,
      size: '70B',
      quantization: ['Q2_K', 'Q3_K_M', 'Q4_0'],
      capabilities: ['chat', 'completion'],
      tier: 'premium',
      description: 'LLaMA 2 70B model',
      requirements: { ram: '32GB', vram: '40GB' }
    });

    // Code LLaMA Models
    this.models.set('codellama-7b', {
      id: 'codellama-7b',
      contextLength: 16384,
      size: '7B',
      quantization: ['Q4_0', 'Q4_K_M', 'Q5_K_M'],
      capabilities: ['code', 'completion'],
      tier: 'code',
      description: 'Code-specialized LLaMA model',
      requirements: { ram: '4GB', vram: '6GB' }
    });

    this.models.set('codellama-13b-instruct', {
      id: 'codellama-13b-instruct',
      contextLength: 16384,
      size: '13B',
      quantization: ['Q4_0', 'Q4_K_M'],
      capabilities: ['code', 'chat', 'completion'],
      tier: 'code',
      description: 'Instruction-tuned Code LLaMA',
      requirements: { ram: '8GB', vram: '10GB' }
    });

    // Mistral Models
    this.models.set('mistral-7b', {
      id: 'mistral-7b',
      contextLength: 8192,
      size: '7B',
      quantization: ['Q4_0', 'Q4_K_M', 'Q5_K_M', 'Q8_0'],
      capabilities: ['chat', 'completion'],
      tier: 'base',
      description: 'Mistral 7B model',
      requirements: { ram: '4GB', vram: '6GB' }
    });

    this.models.set('mixtral-8x7b', {
      id: 'mixtral-8x7b',
      contextLength: 32768,
      size: '8x7B',
      quantization: ['Q2_K', 'Q3_K_M', 'Q4_0'],
      capabilities: ['chat', 'completion', 'moe'],
      tier: 'premium',
      description: 'Mixtral MoE model',
      requirements: { ram: '24GB', vram: '32GB' }
    });
  }

  async startServer(modelPath) {
    if (this.isServerRunning) {
      return true;
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-m', modelPath || this.modelPath,
        '-c', this.contextSize.toString(),
        '-t', this.threads.toString(),
        '--host', this.serverHost,
        '--port', this.serverPort.toString(),
        '-b', this.batchSize.toString(),
        '--embedding'
      ];

      // Add GPU layers if available
      if (this.gpuLayers > 0) {
        args.push('-ngl', this.gpuLayers.toString());
      }

      // Add additional performance flags
      args.push('--mlock'); // Lock model in memory
      args.push('--no-mmap'); // Don't use memory mapping

      this.serverProcess = spawn(this.serverExecutable, args, {
        env: { ...process.env, LLAMA_DISABLE_LOGS: '1' }
      });

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[LLaMA Server]:', output);

        if (output.includes('listening') || output.includes('server started')) {
          this.isServerRunning = true;
          this.emit('server-started', { port: this.serverPort });

          // Wait a bit for server to be fully ready
          setTimeout(() => resolve(true), 1000);
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        console.error('[LLaMA Server Error]:', data.toString());
      });

      this.serverProcess.on('close', (code) => {
        this.isServerRunning = false;
        this.emit('server-stopped', { code });

        if (code !== 0 && !this.isServerRunning) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      this.serverProcess.on('error', (error) => {
        this.isServerRunning = false;
        reject(error);
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        if (!this.isServerRunning) {
          this.stopServer();
          reject(new Error('Server startup timeout'));
        }
      }, 30000);
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      this.isServerRunning = false;
    }
  }

  async chat(messages, options = {}) {
    // Ensure server is running
    if (!this.isServerRunning) {
      await this.startServer(options.modelPath);
    }

    // Convert messages to prompt
    const prompt = this.formatPrompt(messages);

    const requestBody = {
      prompt,
      n_predict: options.maxTokens || 512,
      temperature: options.temperature ?? this.temperature,
      top_k: options.topK ?? this.topK,
      top_p: options.topP ?? this.topP,
      repeat_penalty: options.repeatPenalty ?? this.repeatPenalty,
      stop: options.stop || ['</s>', '\n\nUser:', '\n\nAssistant:'],
      stream: options.stream ?? false
    };

    // Add seed for reproducibility if provided
    if (options.seed !== undefined) {
      requestBody.seed = options.seed;
    }

    try {
      const response = await this.makeRequest('/completion', requestBody);

      // Track usage
      this.trackUsage(response);

      // Emit completion event
      this.emit('completion', {
        response: response.content,
        tokens: response.tokens_evaluated,
        requestId: Date.now().toString()
      });

      return {
        content: response.content.trim(),
        usage: {
          promptTokens: response.tokens_evaluated,
          completionTokens: response.tokens_predicted,
          totalTokens: response.tokens_evaluated + response.tokens_predicted
        },
        model: options.model || 'local',
        timings: response.timings,
        stopReason: response.stopped_reason
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async streamChat(messages, options = {}, onChunk) {
    // Ensure server is running
    if (!this.isServerRunning) {
      await this.startServer(options.modelPath);
    }

    const prompt = this.formatPrompt(messages);

    const requestBody = {
      prompt,
      n_predict: options.maxTokens || 512,
      temperature: options.temperature ?? this.temperature,
      top_k: options.topK ?? this.topK,
      top_p: options.topP ?? this.topP,
      repeat_penalty: options.repeatPenalty ?? this.repeatPenalty,
      stop: options.stop || ['</s>', '\n\nUser:', '\n\nAssistant:'],
      stream: true
    };

    return new Promise((resolve, reject) => {
      const chunks = [];
      let fullContent = '';

      this.makeStreamRequest('/completion', requestBody, (chunk) => {
        try {
          const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

          for (const line of lines) {
            const data = line.replace('data: ', '');

            if (data === '[DONE]') {
              resolve({
                content: fullContent,
                chunks,
                model: options.model || 'local'
              });
              return;
            }

            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              chunks.push(parsed.content);

              if (onChunk) {
                onChunk(parsed.content, parsed);
              }
            }

            if (parsed.stop) {
              resolve({
                content: fullContent,
                chunks,
                model: options.model || 'local'
              });
              return;
            }
          }
        } catch (error) {
          console.error('Error parsing stream chunk:', error);
        }
      }).catch(reject);
    });
  }

  async embeddings(input, options = {}) {
    // Ensure server is running
    if (!this.isServerRunning) {
      await this.startServer(options.modelPath);
    }

    const texts = Array.isArray(input) ? input : [input];
    const embeddings = [];

    for (const text of texts) {
      const requestBody = {
        content: text
      };

      try {
        const response = await this.makeRequest('/embedding', requestBody);
        embeddings.push(response.embedding);

        // Track usage
        this.trackUsage({ tokens_evaluated: text.length / 4 });
      } catch (error) {
        this.handleError(error);
        throw error;
      }
    }

    return {
      embeddings,
      model: options.model || 'local',
      usage: { totalTokens: texts.join('').length / 4 }
    };
  }

  async runDirectInference(prompt, options = {}) {
    // Direct inference without server
    const modelPath = options.modelPath || this.modelPath;

    if (!modelPath) {
      throw new Error('Model path not configured');
    }

    const args = [
      '-m', modelPath,
      '-p', prompt,
      '-n', (options.maxTokens || 512).toString(),
      '-t', this.threads.toString(),
      '--temp', (options.temperature || this.temperature).toString(),
      '--top-k', (options.topK || this.topK).toString(),
      '--top-p', (options.topP || this.topP).toString(),
      '--repeat-penalty', (options.repeatPenalty || this.repeatPenalty).toString()
    ];

    if (this.gpuLayers > 0) {
      args.push('-ngl', this.gpuLayers.toString());
    }

    if (options.seed !== undefined) {
      args.push('--seed', options.seed.toString());
    }

    return new Promise((resolve, reject) => {
      const process = spawn(this.executablePath, args);
      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Extract generated text after the prompt
          const generatedText = output.substring(prompt.length).trim();

          resolve({
            content: generatedText,
            model: options.model || 'local',
            usage: {
              promptTokens: prompt.length / 4,
              completionTokens: generatedText.length / 4,
              totalTokens: (prompt.length + generatedText.length) / 4
            }
          });
        } else {
          reject(new Error(`Inference failed: ${error}`));
        }
      });

      process.on('error', reject);
    });
  }

  formatPrompt(messages) {
    let prompt = '';

    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `System: ${message.content}\n\n`;
      } else if (message.role === 'user') {
        prompt += `User: ${message.content}\n\n`;
      } else if (message.role === 'assistant') {
        prompt += `Assistant: ${message.content}\n\n`;
      }
    }

    // Add the assistant prompt prefix for completion
    prompt += 'Assistant:';

    return prompt;
  }

  async makeRequest(endpoint, body) {
    const options = {
      hostname: this.serverHost,
      port: this.serverPort,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async makeStreamRequest(endpoint, body, onChunk) {
    const options = {
      hostname: this.serverHost,
      port: this.serverPort,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      }
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => errorData += chunk);
          res.on('end', () => {
            reject(new Error(`HTTP ${res.statusCode}: ${errorData}`));
          });
          return;
        }

        res.on('data', (chunk) => {
          onChunk(chunk.toString());
        });

        res.on('end', resolve);
      });

      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async checkModelFile(modelPath) {
    try {
      const stats = await fs.stat(modelPath);

      return {
        exists: true,
        size: stats.size,
        sizeGB: (stats.size / (1024 * 1024 * 1024)).toFixed(2),
        modified: stats.mtime
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  async downloadModel(modelName, downloadUrl) {
    // Implementation for downloading models from HuggingFace or other sources
    // This is a placeholder - actual implementation would handle downloads
    console.log(`Download ${modelName} from ${downloadUrl}`);

    return {
      status: 'not-implemented',
      message: 'Model downloading not yet implemented'
    };
  }

  trackUsage(response) {
    this.usage.requests++;

    if (response.tokens_evaluated) {
      this.usage.tokens += response.tokens_evaluated;
    }

    if (response.tokens_predicted) {
      this.usage.tokens += response.tokens_predicted;
    }

    // Emit usage event
    this.emit('usage', {
      requests: this.usage.requests,
      tokens: this.usage.tokens,
      sessionDuration: Date.now() - this.usage.sessionStart
    });
  }

  handleError(error) {
    this.emit('error', {
      provider: 'local',
      error,
      timestamp: Date.now()
    });

    console.error('Local LLaMA error:', error.message);
  }

  async testConnection() {
    try {
      // Try to start server or run direct inference
      const response = await this.runDirectInference('Hello', {
        maxTokens: 5
      });

      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getModelInfo(modelId) {
    return this.models.get(modelId);
  }

  listModels() {
    return Array.from(this.models.entries()).map(([id, config]) => ({
      id,
      ...config
    }));
  }

  getUsageStats() {
    return {
      requests: this.usage.requests,
      tokens: this.usage.tokens,
      sessionDuration: Date.now() - this.usage.sessionStart,
      serverRunning: this.isServerRunning
    };
  }

  async cleanup() {
    await this.stopServer();
  }
}

module.exports = { LocalLLaMAProvider };