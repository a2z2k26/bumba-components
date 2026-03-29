const https = require('https');
const { EventEmitter } = require('events');

class GoogleGeminiProvider extends EventEmitter {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
    this.baseURL = config.baseURL || 'https://generativelanguage.googleapis.com';
    this.version = config.version || 'v1beta';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.models = new Map();

    // Rate limiting
    this.rateLimits = {
      requestsPerMinute: config.requestsPerMinute || 60,
      tokensPerMinute: config.tokensPerMinute || 60000,
      requestsPerDay: config.requestsPerDay || 1500
    };

    this.usage = {
      requests: [],
      tokens: [],
      daily: { requests: 0, tokens: 0, cost: 0 }
    };

    this.initializeModels();
  }

  initializeModels() {
    // Gemini Pro Models
    this.models.set('gemini-pro', {
      id: 'gemini-pro',
      contextLength: 32768,
      pricing: { prompt: 0.00025, completion: 0.0005 }, // per 1K tokens
      capabilities: ['chat', 'completion', 'function_calling'],
      tier: 'standard',
      description: 'Best for text-only prompts'
    });

    this.models.set('gemini-pro-vision', {
      id: 'gemini-pro-vision',
      contextLength: 16384,
      pricing: { prompt: 0.00025, completion: 0.0005 },
      capabilities: ['chat', 'completion', 'vision'],
      tier: 'standard',
      description: 'Multimodal model for text and images'
    });

    this.models.set('gemini-1.5-pro-latest', {
      id: 'gemini-1.5-pro-latest',
      contextLength: 1000000, // 1M token context window
      pricing: { prompt: 0.0035, completion: 0.0105 },
      capabilities: ['chat', 'completion', 'vision', 'function_calling', 'code_execution'],
      tier: 'premium',
      description: 'Advanced model with massive context window'
    });

    this.models.set('gemini-1.5-flash', {
      id: 'gemini-1.5-flash',
      contextLength: 1000000,
      pricing: { prompt: 0.00035, completion: 0.00105 },
      capabilities: ['chat', 'completion', 'vision', 'function_calling'],
      tier: 'economy',
      description: 'Fast, efficient model for high-volume tasks'
    });

    // Embedding Model
    this.models.set('embedding-001', {
      id: 'embedding-001',
      dimensions: 768,
      pricing: { usage: 0.0001 }, // per 1K tokens
      capabilities: ['embeddings'],
      tier: 'embedding',
      description: 'Text embedding model'
    });
  }

  async chat(messages, options = {}) {
    const model = options.model || 'gemini-pro';
    const modelConfig = this.models.get(model);

    if (!modelConfig) {
      throw new Error(`Model ${model} not supported`);
    }

    // Check rate limits
    if (!this.checkRateLimits()) {
      throw new Error('Rate limit exceeded. Please wait before making another request.');
    }

    // Convert messages to Gemini format
    const contents = this.convertMessages(messages);

    const requestBody = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        topK: options.topK ?? 40,
        topP: options.topP ?? 0.95,
        maxOutputTokens: options.maxTokens || 2048,
        stopSequences: options.stop
      }
    };

    // Add safety settings
    if (options.safetySettings) {
      requestBody.safetySettings = options.safetySettings;
    } else {
      requestBody.safetySettings = this.getDefaultSafetySettings();
    }

    // Add function declarations if provided
    if (options.functions) {
      requestBody.tools = [{
        functionDeclarations: options.functions.map(fn => ({
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        }))
      }];
    }

    // Add system instruction if provided
    if (options.systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemPrompt }]
      };
    }

    try {
      const endpoint = `/${this.version}/models/${model}:generateContent`;
      const response = await this.makeRequest(endpoint, requestBody);

      // Track usage
      if (response.usageMetadata) {
        this.trackUsage(response.usageMetadata, modelConfig.pricing);
      }

      // Extract the response
      const candidate = response.candidates[0];
      const content = candidate.content.parts[0];

      // Emit completion event
      this.emit('completion', {
        model,
        usage: response.usageMetadata,
        response: content,
        requestId: response.id
      });

      return {
        content: content.text || '',
        functionCall: content.functionCall,
        usage: response.usageMetadata,
        model,
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async streamChat(messages, options = {}, onChunk) {
    const model = options.model || 'gemini-pro';
    const contents = this.convertMessages(messages);

    const requestBody = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        topK: options.topK ?? 40,
        topP: options.topP ?? 0.95,
        maxOutputTokens: options.maxTokens || 2048
      },
      safetySettings: options.safetySettings || this.getDefaultSafetySettings()
    };

    if (options.systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemPrompt }]
      };
    }

    return new Promise((resolve, reject) => {
      const chunks = [];
      let fullContent = '';

      const endpoint = `/${this.version}/models/${model}:streamGenerateContent`;

      this.makeStreamRequest(endpoint, requestBody, (chunk) => {
        // Parse streaming response
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              resolve({
                content: fullContent,
                chunks,
                model
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.candidates && parsed.candidates[0]) {
                const candidate = parsed.candidates[0];
                if (candidate.content && candidate.content.parts) {
                  const text = candidate.content.parts[0].text;
                  if (text) {
                    fullContent += text;
                    chunks.push(text);

                    if (onChunk) {
                      onChunk(text, parsed);
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error parsing stream chunk:', error);
            }
          }
        }
      }).catch(reject);
    });
  }

  async embeddings(input, options = {}) {
    const model = options.model || 'embedding-001';
    const modelConfig = this.models.get(model);

    if (!modelConfig || !modelConfig.capabilities.includes('embeddings')) {
      throw new Error(`Model ${model} does not support embeddings`);
    }

    const texts = Array.isArray(input) ? input : [input];
    const embeddings = [];

    // Gemini requires individual requests for each text
    for (const text of texts) {
      const requestBody = {
        content: {
          parts: [{ text }]
        }
      };

      if (options.taskType) {
        requestBody.taskType = options.taskType;
      }

      if (options.title) {
        requestBody.title = options.title;
      }

      try {
        const endpoint = `/${this.version}/models/${model}:embedContent`;
        const response = await this.makeRequest(endpoint, requestBody);

        embeddings.push(response.embedding.values);

        // Track usage
        this.trackUsage({ totalTokens: text.length / 4 }, modelConfig.pricing);
      } catch (error) {
        this.handleError(error);
        throw error;
      }
    }

    return {
      embeddings,
      model,
      usage: { totalTokens: texts.join('').length / 4 }
    };
  }

  async vision(imageData, prompt, options = {}) {
    const model = options.model || 'gemini-pro-vision';
    const modelConfig = this.models.get(model);

    if (!modelConfig || !modelConfig.capabilities.includes('vision')) {
      throw new Error(`Model ${model} does not support vision`);
    }

    const contents = [{
      parts: [
        {
          text: prompt
        },
        {
          inlineData: {
            mimeType: this.getMimeType(imageData),
            data: imageData.startsWith('data:') ? imageData.split(',')[1] : imageData
          }
        }
      ]
    }];

    return this.chat(contents, { ...options, model });
  }

  async functionCalling(messages, functions, options = {}) {
    const model = options.model || 'gemini-pro';
    const modelConfig = this.models.get(model);

    if (!modelConfig || !modelConfig.capabilities.includes('function_calling')) {
      throw new Error(`Model ${model} does not support function calling`);
    }

    const enhancedOptions = {
      ...options,
      functions: functions.map(fn => ({
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters || {
          type: 'object',
          properties: fn.properties || {},
          required: fn.required || []
        }
      }))
    };

    const response = await this.chat(messages, enhancedOptions);

    if (response.functionCall) {
      return {
        ...response,
        toolCalls: [{
          id: `call_${Date.now()}`,
          name: response.functionCall.name,
          arguments: JSON.stringify(response.functionCall.args)
        }]
      };
    }

    return response;
  }

  convertMessages(messages) {
    const contents = [];
    let currentContent = { parts: [] };

    for (const message of messages) {
      if (message.role === 'system') {
        // System messages are handled separately in Gemini
        continue;
      }

      const role = message.role === 'assistant' ? 'model' : 'user';

      if (Array.isArray(message.content)) {
        // Multi-modal content
        currentContent = {
          role,
          parts: message.content.map(part => {
            if (part.type === 'text') {
              return { text: part.text };
            } else if (part.type === 'image') {
              return {
                inlineData: {
                  mimeType: part.mimeType || 'image/jpeg',
                  data: part.data
                }
              };
            }
            return part;
          })
        };
      } else {
        currentContent = {
          role,
          parts: [{ text: message.content }]
        };
      }

      contents.push(currentContent);
    }

    return contents;
  }

  async makeRequest(endpoint, body, retries = 0) {
    if (!this.apiKey) {
      throw new Error('Google API key not configured');
    }

    const url = new URL(this.baseURL + endpoint);
    url.searchParams.set('key', this.apiKey);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BUMBA-CLI/1.0'
      },
      timeout: this.timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
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
            const error = this.parseError(res.statusCode, data);

            // Retry on rate limit or server errors
            if ((res.statusCode === 429 || res.statusCode >= 500) && retries < this.maxRetries) {
              const delay = this.getRetryDelay(retries, res.headers);
              setTimeout(() => {
                this.makeRequest(endpoint, body, retries + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              reject(error);
            }
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
    if (!this.apiKey) {
      throw new Error('Google API key not configured');
    }

    const url = new URL(this.baseURL + endpoint);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('alt', 'sse'); // Server-sent events format

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': 'BUMBA-CLI/1.0'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => errorData += chunk);
          res.on('end', () => {
            reject(this.parseError(res.statusCode, errorData));
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

  getDefaultSafetySettings() {
    return [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ];
  }

  checkRateLimits() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    this.usage.requests = this.usage.requests.filter(t => t > oneMinuteAgo);
    this.usage.tokens = this.usage.tokens.filter(t => t.time > oneMinuteAgo);

    // Check per-minute limits
    if (this.usage.requests.length >= this.rateLimits.requestsPerMinute) {
      return false;
    }

    const recentTokens = this.usage.tokens.reduce((sum, t) => sum + t.count, 0);
    if (recentTokens >= this.rateLimits.tokensPerMinute) {
      return false;
    }

    // Check daily limits
    if (this.usage.daily.requests >= this.rateLimits.requestsPerDay) {
      // Reset if new day
      const lastReset = this.usage.daily.lastReset || 0;
      if (now - lastReset > 86400000) {
        this.usage.daily = { requests: 0, tokens: 0, cost: 0, lastReset: now };
      } else {
        return false;
      }
    }

    return true;
  }

  trackUsage(usage, pricing) {
    if (!usage) return;

    const now = Date.now();

    // Track request
    this.usage.requests.push(now);
    this.usage.daily.requests++;

    // Track tokens
    const totalTokens = usage.promptTokenCount + usage.candidatesTokenCount || usage.totalTokens || 0;

    if (totalTokens > 0) {
      this.usage.tokens.push({ time: now, count: totalTokens });
      this.usage.daily.tokens += totalTokens;
    }

    // Calculate cost
    if (pricing) {
      let cost = 0;

      if (pricing.prompt && usage.promptTokenCount) {
        cost += (usage.promptTokenCount / 1000) * pricing.prompt;
      }

      if (pricing.completion && usage.candidatesTokenCount) {
        cost += (usage.candidatesTokenCount / 1000) * pricing.completion;
      }

      if (pricing.usage && totalTokens) {
        cost = (totalTokens / 1000) * pricing.usage;
      }

      this.usage.daily.cost += cost;

      // Emit usage event
      this.emit('usage', {
        tokens: usage,
        cost,
        daily: this.usage.daily
      });
    }
  }

  parseError(statusCode, data) {
    let message = `Google Gemini API error: ${statusCode}`;
    let errorData = {};

    try {
      errorData = JSON.parse(data);
      if (errorData.error) {
        message = errorData.error.message || errorData.error.status || message;
      }
    } catch (e) {
      message += ` - ${data}`;
    }

    const error = new Error(message);
    error.statusCode = statusCode;
    error.data = errorData;

    // Add specific error types
    switch (statusCode) {
      case 400:
        error.type = 'InvalidRequestError';
        break;
      case 401:
        error.type = 'AuthenticationError';
        break;
      case 403:
        error.type = 'PermissionError';
        break;
      case 404:
        error.type = 'NotFoundError';
        break;
      case 429:
        error.type = 'RateLimitError';
        error.retryAfter = errorData.error?.retryAfter;
        break;
      case 500:
      case 502:
      case 503:
        error.type = 'ServerError';
        break;
      default:
        error.type = 'UnknownError';
    }

    return error;
  }

  getRetryDelay(retries, headers) {
    // Check for Retry-After header
    if (headers && headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after']);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000;
      }
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, retries), 60000);
    const jitter = Math.random() * baseDelay * 0.1;
    return baseDelay + jitter;
  }

  handleError(error) {
    this.emit('error', {
      provider: 'google',
      error,
      timestamp: Date.now()
    });

    // Log specific error types
    if (error.type === 'RateLimitError') {
      console.error('Google Gemini rate limit exceeded. Consider reducing request frequency.');
    } else if (error.type === 'AuthenticationError') {
      console.error('Google Gemini authentication failed. Check your API key.');
    }
  }

  getMimeType(imageData) {
    if (imageData.startsWith('data:')) {
      const match = imageData.match(/^data:([^;]+);/);
      return match ? match[1] : 'image/jpeg';
    }

    const extension = imageData.split('.').pop().toLowerCase();
    const types = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp'
    };

    return types[extension] || 'image/jpeg';
  }

  async testConnection() {
    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hello' }],
        { model: 'gemini-pro', maxTokens: 5 }
      );
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
      current: {
        requestsPerMinute: this.usage.requests.length,
        tokensPerMinute: this.usage.tokens.reduce((sum, t) => sum + t.count, 0)
      },
      daily: this.usage.daily,
      limits: this.rateLimits
    };
  }
}

module.exports = { GoogleGeminiProvider };