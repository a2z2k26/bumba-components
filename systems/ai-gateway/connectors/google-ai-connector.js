/**
 * Google AI (Gemini) API Connector for BUMBA
 * Handles all interactions with Google's Generative AI API
 */

const EventEmitter = require('events');

class GoogleAIConnector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      apiKey: options.apiKey || process.env.GOOGLE_API_KEY,
      baseURL: options.baseURL || 'https://generativelanguage.googleapis.com',
      apiVersion: options.apiVersion || 'v1beta',
      timeout: options.timeout || 60000,
      maxRetries: options.maxRetries || 3,
      ...options
    };
    
    // Validate API key
    if (!this.options.apiKey) {
      throw new Error('Google AI API key is required');
    }
    
    // Rate limiting
    this.rateLimits = {
      requests: { limit: 60, window: 60000, current: 0, lastReset: Date.now() },
      tokens: { limit: 1000000, window: 60000, current: 0, lastReset: Date.now() }
    };
    
    // Usage tracking
    this.usage = {
      totalPromptTokens: 0,
      totalCandidatesTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      requests: 0,
      cachedContentTokens: 0
    };
    
    // Model configurations with pricing
    this.models = {
      'gemini-1.5-pro': {
        maxInputTokens: 2097152,
        maxOutputTokens: 8192,
        costPer1M: { 
          input: { under128k: 1.25, over128k: 2.50 },
          output: { under128k: 5.00, over128k: 10.00 }
        }
      },
      'gemini-1.5-pro-002': {
        maxInputTokens: 2097152,
        maxOutputTokens: 8192,
        costPer1M: { 
          input: { under128k: 1.25, over128k: 2.50 },
          output: { under128k: 5.00, over128k: 10.00 }
        }
      },
      'gemini-1.5-flash': {
        maxInputTokens: 1048576,
        maxOutputTokens: 8192,
        costPer1M: { 
          input: { under128k: 0.075, over128k: 0.15 },
          output: { under128k: 0.30, over128k: 0.60 }
        }
      },
      'gemini-1.5-flash-002': {
        maxInputTokens: 1048576,
        maxOutputTokens: 8192,
        costPer1M: { 
          input: { under128k: 0.075, over128k: 0.15 },
          output: { under128k: 0.30, over128k: 0.60 }
        }
      },
      'gemini-1.0-pro': {
        maxInputTokens: 32768,
        maxOutputTokens: 8192,
        costPer1M: { 
          input: { default: 0.50 },
          output: { default: 1.50 }
        }
      },
      'gemini-pro-vision': {
        maxInputTokens: 16384,
        maxOutputTokens: 2048,
        costPer1M: { 
          input: { default: 0.50 },
          output: { default: 1.50 }
        }
      }
    };
    
    // Safety settings
    this.defaultSafetySettings = [
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

  /**
   * Make authenticated request to Google AI API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.options.baseURL}/${this.options.apiVersion}${endpoint}?key=${this.options.apiKey}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    // Check rate limits
    await this.checkRateLimits();
    
    let lastError;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: options.method || 'POST',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeout)
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          
          if (response.status === 429) {
            // Rate limited
            await this.delay(Math.pow(2, attempt) * 1000);
            continue;
          }
          
          if (response.status === 503) {
            // Service unavailable
            await this.delay(Math.pow(2, attempt) * 1000);
            continue;
          }
          
          throw new Error(error.error?.message || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Track usage
        if (data.usageMetadata) {
          this.trackUsage(data.usageMetadata, options.model);
        }
        
        return data;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < this.options.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Generate content (main chat completion method)
   */
  async generateContent(prompt, options = {}) {
    const model = options.model || 'gemini-1.5-pro';
    
    // Convert prompt to contents format
    const contents = this.formatContents(prompt);
    
    const body = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.9,
        topP: options.topP ?? 1,
        topK: options.topK ?? 1,
        maxOutputTokens: options.maxTokens || 2048,
        stopSequences: options.stopSequences,
        candidateCount: options.candidateCount || 1,
        responseMimeType: options.responseMimeType || 'text/plain'
      },
      safetySettings: options.safetySettings || this.defaultSafetySettings
    };
    
    // Add system instruction if provided
    if (options.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: options.systemInstruction }]
      };
    }
    
    // Add tools if provided
    if (options.tools) {
      body.tools = options.tools;
      body.toolConfig = options.toolConfig;
    }
    
    // Add cached content if provided
    if (options.cachedContent) {
      body.cachedContent = options.cachedContent;
    }
    
    const endpoint = `/models/${model}:generateContent`;
    
    if (options.stream) {
      return this.streamGenerateContent(endpoint, body);
    }
    
    const response = await this.makeRequest(endpoint, {
      method: 'POST',
      body
    });
    
    this.emit('generation', {
      model,
      prompt: contents.length,
      response: response.candidates?.[0]?.content
    });
    
    return response;
  }

  /**
   * Stream content generation
   */
  async streamGenerateContent(endpoint, body) {
    const url = `${this.options.baseURL}/${this.options.apiVersion}${endpoint}?key=${this.options.apiKey}&alt=sse`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Stream request failed');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    return {
      async *[Symbol.asyncIterator]() {
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              try {
                const parsed = JSON.parse(data);
                yield parsed;
              } catch {
                // Invalid JSON, skip
              }
            }
          }
        }
      }
    };
  }

  /**
   * Chat conversation (maintains context)
   */
  async chat(messages, options = {}) {
    const model = options.model || 'gemini-1.5-pro';
    
    // Convert messages to Gemini format
    const contents = this.convertMessagesToContents(messages);
    
    return this.generateContent(contents, options);
  }

  /**
   * Generate embeddings
   */
  async embedContent(content, options = {}) {
    const model = options.model || 'embedding-001';
    
    const body = {
      model: `models/${model}`,
      content: {
        parts: [{ text: content }]
      },
      taskType: options.taskType || 'RETRIEVAL_DOCUMENT',
      title: options.title
    };
    
    const response = await this.makeRequest(`/models/${model}:embedContent`, {
      method: 'POST',
      body
    });
    
    return response;
  }

  /**
   * Batch embed contents
   */
  async batchEmbedContents(contents, options = {}) {
    const model = options.model || 'embedding-001';
    
    const requests = contents.map(content => ({
      model: `models/${model}`,
      content: {
        parts: [{ text: content }]
      },
      taskType: options.taskType || 'RETRIEVAL_DOCUMENT'
    }));
    
    const response = await this.makeRequest(`/models/${model}:batchEmbedContents`, {
      method: 'POST',
      body: { requests }
    });
    
    return response;
  }

  /**
   * Count tokens
   */
  async countTokens(content, options = {}) {
    const model = options.model || 'gemini-1.5-pro';
    
    const body = {
      contents: this.formatContents(content),
      generateContentRequest: options.generateContentRequest
    };
    
    const response = await this.makeRequest(`/models/${model}:countTokens`, {
      method: 'POST',
      body
    });
    
    return response;
  }

  /**
   * Function calling
   */
  async callFunction(prompt, functions, options = {}) {
    const tools = [{
      functionDeclarations: functions.map(fn => ({
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters
      }))
    }];
    
    const response = await this.generateContent(prompt, {
      ...options,
      tools,
      toolConfig: {
        functionCallingConfig: {
          mode: options.mode || 'AUTO',
          allowedFunctionNames: options.allowedFunctions
        }
      }
    });
    
    // Extract function calls
    const functionCalls = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            arguments: part.functionCall.args
          });
        }
      }
    }
    
    return {
      ...response,
      functionCalls
    };
  }

  /**
   * Code execution
   */
  async executeCode(code, options = {}) {
    const prompt = [
      {
        text: options.prompt || 'Execute this code and provide the output:'
      },
      {
        executableCode: {
          language: options.language || 'PYTHON',
          code
        }
      }
    ];
    
    return this.generateContent(prompt, {
      ...options,
      tools: [{
        codeExecution: {}
      }]
    });
  }

  /**
   * Grounding with Google Search
   */
  async groundWithSearch(prompt, options = {}) {
    const tools = [{
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: options.mode || 'MODE_DYNAMIC',
          dynamicThreshold: options.threshold || 0.5
        }
      }
    }];
    
    return this.generateContent(prompt, {
      ...options,
      tools
    });
  }

  /**
   * Vision: Analyze image
   */
  async analyzeImage(imageData, prompt, options = {}) {
    const contents = [
      {
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: imageData.mimeType || 'image/jpeg',
              data: imageData.base64 || imageData
            }
          }
        ]
      }
    ];
    
    return this.generateContent(contents, {
      ...options,
      model: options.model || 'gemini-1.5-pro'
    });
  }

  /**
   * Vision: Analyze video
   */
  async analyzeVideo(videoUri, prompt, options = {}) {
    const contents = [
      {
        parts: [
          {
            text: prompt
          },
          {
            fileData: {
              mimeType: 'video/mp4',
              fileUri: videoUri
            }
          }
        ]
      }
    ];
    
    return this.generateContent(contents, {
      ...options,
      model: options.model || 'gemini-1.5-pro'
    });
  }

  /**
   * Audio: Analyze audio
   */
  async analyzeAudio(audioData, prompt, options = {}) {
    const contents = [
      {
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: audioData.mimeType || 'audio/mp3',
              data: audioData.base64 || audioData
            }
          }
        ]
      }
    ];
    
    return this.generateContent(contents, {
      ...options,
      model: options.model || 'gemini-1.5-pro'
    });
  }

  /**
   * Upload file for processing
   */
  async uploadFile(file, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.options.apiKey}`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'File upload failed');
    }
    
    const fileData = await response.json();
    
    // Wait for file to be processed
    if (options.waitForProcessing) {
      return this.waitForFile(fileData.name);
    }
    
    return fileData;
  }

  /**
   * Wait for file processing
   */
  async waitForFile(fileName, maxWait = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const file = await this.getFile(fileName);
      
      if (file.state === 'ACTIVE') {
        return file;
      }
      
      if (file.state === 'FAILED') {
        throw new Error(`File processing failed: ${file.error?.message}`);
      }
      
      await this.delay(2000);
    }
    
    throw new Error('File processing timeout');
  }

  /**
   * Get file metadata
   */
  async getFile(fileName) {
    const response = await this.makeRequest(`/files/${fileName}`, {
      method: 'GET'
    });
    
    return response;
  }

  /**
   * List files
   */
  async listFiles(options = {}) {
    const params = new URLSearchParams();
    if (options.pageSize) params.append('pageSize', String(options.pageSize));
    if (options.pageToken) params.append('pageToken', options.pageToken);
    
    const response = await this.makeRequest(`/files?${params}`, {
      method: 'GET'
    });
    
    return response;
  }

  /**
   * Delete file
   */
  async deleteFile(fileName) {
    const response = await this.makeRequest(`/files/${fileName}`, {
      method: 'DELETE'
    });
    
    return response;
  }

  /**
   * Context caching
   */
  async createCachedContent(content, options = {}) {
    const model = options.model || 'gemini-1.5-pro';
    
    const body = {
      model: `models/${model}`,
      contents: this.formatContents(content),
      systemInstruction: options.systemInstruction ? {
        parts: [{ text: options.systemInstruction }]
      } : undefined,
      ttl: options.ttl || '3600s',
      displayName: options.displayName
    };
    
    const response = await this.makeRequest('/cachedContents', {
      method: 'POST',
      body
    });
    
    return response;
  }

  /**
   * Get cached content
   */
  async getCachedContent(name) {
    const response = await this.makeRequest(`/cachedContents/${name}`, {
      method: 'GET'
    });
    
    return response;
  }

  /**
   * List cached contents
   */
  async listCachedContents(options = {}) {
    const params = new URLSearchParams();
    if (options.pageSize) params.append('pageSize', String(options.pageSize));
    if (options.pageToken) params.append('pageToken', options.pageToken);
    
    const response = await this.makeRequest(`/cachedContents?${params}`, {
      method: 'GET'
    });
    
    return response;
  }

  /**
   * Delete cached content
   */
  async deleteCachedContent(name) {
    const response = await this.makeRequest(`/cachedContents/${name}`, {
      method: 'DELETE'
    });
    
    return response;
  }

  /**
   * Fine-tuning: Create tuned model
   */
  async createTunedModel(baseModel, trainingData, options = {}) {
    const body = {
      displayName: options.displayName || 'Tuned Model',
      baseModel: `models/${baseModel}`,
      tuningTask: {
        hyperparameters: {
          epochCount: options.epochs || 5,
          batchSize: options.batchSize || 4,
          learningRate: options.learningRate || 0.001
        },
        trainingData: {
          examples: {
            examples: trainingData
          }
        }
      }
    };
    
    const response = await this.makeRequest('/tunedModels', {
      method: 'POST',
      body
    });
    
    return response;
  }

  /**
   * List available models
   */
  async listModels() {
    const response = await this.makeRequest('/models', {
      method: 'GET'
    });
    
    return response;
  }

  /**
   * Get model details
   */
  async getModel(modelId) {
    const response = await this.makeRequest(`/models/${modelId}`, {
      method: 'GET'
    });
    
    return response;
  }

  /**
   * Format contents for API
   */
  formatContents(input) {
    if (typeof input === 'string') {
      return [{ parts: [{ text: input }] }];
    }
    
    if (Array.isArray(input)) {
      // Already formatted
      if (input[0]?.parts) {
        return input;
      }
      
      // Array of strings
      return [{ parts: input.map(text => ({ text })) }];
    }
    
    // Single content object
    if (input.parts) {
      return [input];
    }
    
    // Single part
    return [{ parts: [input] }];
  }

  /**
   * Convert chat messages to Gemini format
   */
  convertMessagesToContents(messages) {
    const contents = [];
    
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      
      if (typeof msg.content === 'string') {
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
      } else if (Array.isArray(msg.content)) {
        contents.push({
          role,
          parts: msg.content
        });
      } else {
        contents.push({
          role,
          parts: [msg.content]
        });
      }
    }
    
    return contents;
  }

  /**
   * Check rate limits
   */
  async checkRateLimits() {
    const now = Date.now();
    
    // Reset counters if window has passed
    if (now - this.rateLimits.requests.lastReset > this.rateLimits.requests.window) {
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = now;
    }
    
    if (now - this.rateLimits.tokens.lastReset > this.rateLimits.tokens.window) {
      this.rateLimits.tokens.current = 0;
      this.rateLimits.tokens.lastReset = now;
    }
    
    // Check if at limit
    if (this.rateLimits.requests.current >= this.rateLimits.requests.limit) {
      const waitTime = this.rateLimits.requests.window - (now - this.rateLimits.requests.lastReset);
      await this.delay(waitTime);
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = Date.now();
    }
    
    this.rateLimits.requests.current++;
  }

  /**
   * Track usage and costs
   */
  trackUsage(usageMetadata, model) {
    this.usage.totalPromptTokens += usageMetadata.promptTokenCount || 0;
    this.usage.totalCandidatesTokens += usageMetadata.candidatesTokenCount || 0;
    this.usage.totalTokens += usageMetadata.totalTokenCount || 0;
    this.usage.requests++;
    
    if (usageMetadata.cachedContentTokenCount) {
      this.usage.cachedContentTokens += usageMetadata.cachedContentTokenCount;
    }
    
    // Calculate costs
    if (model && this.models[model]) {
      const costs = this.models[model].costPer1M;
      const promptTokens = usageMetadata.promptTokenCount || 0;
      const candidateTokens = usageMetadata.candidatesTokenCount || 0;
      
      let inputCost, outputCost;
      
      if (costs.input.under128k) {
        // Tiered pricing
        if (promptTokens <= 128000) {
          inputCost = promptTokens * costs.input.under128k / 1000000;
        } else {
          inputCost = (128000 * costs.input.under128k / 1000000) +
                     ((promptTokens - 128000) * costs.input.over128k / 1000000);
        }
        
        if (candidateTokens <= 128000) {
          outputCost = candidateTokens * costs.output.under128k / 1000000;
        } else {
          outputCost = (128000 * costs.output.under128k / 1000000) +
                      ((candidateTokens - 128000) * costs.output.over128k / 1000000);
        }
      } else {
        // Flat pricing
        inputCost = promptTokens * costs.input.default / 1000000;
        outputCost = candidateTokens * costs.output.default / 1000000;
      }
      
      this.usage.totalCost += inputCost + outputCost;
    }
    
    this.emit('usage', {
      promptTokens: usageMetadata.promptTokenCount,
      candidateTokens: usageMetadata.candidatesTokenCount,
      cost: this.usage.totalCost,
      requests: this.usage.requests
    });
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return {
      ...this.usage,
      rateLimits: this.rateLimits
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.usage = {
      totalPromptTokens: 0,
      totalCandidatesTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      requests: 0,
      cachedContentTokens: 0
    };
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate API key
   */
  async validateApiKey() {
    try {
      const models = await this.listModels();
      return {
        valid: true,
        models: models.models?.map(m => m.name) || []
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Object.keys(this.models);
  }

  /**
   * Get model info
   */
  getModelInfo(modelId) {
    return this.models[modelId] || null;
  }
}

module.exports = GoogleAIConnector;