/**
 * BUMBA Multi-API Orchestrator
 * Intelligently routes tasks across ALL available AI providers
 * Uses the best model from each provider for specific tasks
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// Load project-specific .env file
const dotenv = require('dotenv');
const projectEnvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(projectEnvPath)) {
  dotenv.config({ path: projectEnvPath });
  console.log(chalk.gray('📋 Loaded project .env file for AI providers'));
}

class MultiAPIOrchestrator {
  constructor() {
    this.providers = new Map();
    this.availableAPIs = EnvLoader.getAvailableAPIs();

    // Track recently used models for diversity
    this.recentlyUsedModels = [];
    this.maxRecentModels = 5;

    // Initialize free tier manager
    this.freeTierManager = new FreeTierManager();

    this.initializeProviders();
  }

  initializeProviders() {
    console.log(chalk.yellow('\n🔍 Detecting available AI providers...'));

    // Initialize all available providers
    const providers = [];
    const fromEnv = [];

    // OpenRouter (200+ models)
    if (this.availableAPIs.openrouter) {
      this.providers.set('openrouter', new OpenRouterIntegration({
        apiKey: process.env.OPENROUTER_API_KEY,
        cacheEnabled: false
      }));
      providers.push('OpenRouter (200+ models)');
      if (process.env.OPENROUTER_API_KEY) fromEnv.push('OpenRouter');
    }

    // OpenAI
    if (this.availableAPIs.openai) {
      this.providers.set('openai', this.createOpenAIProvider());
      providers.push('OpenAI (GPT-4, GPT-3.5)');
      if (process.env.OPENAI_API_KEY) fromEnv.push('OpenAI');
    }

    // Anthropic Claude
    if (this.availableAPIs.anthropic) {
      this.providers.set('anthropic', this.createAnthropicProvider());
      providers.push('Anthropic (Claude 3)');
      if (process.env.ANTHROPIC_API_KEY) fromEnv.push('Anthropic');
    }

    // Google Gemini
    if (this.availableAPIs.google) {
      this.providers.set('google', this.createGoogleProvider());
      providers.push('Google (Gemini Pro)');
      if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) fromEnv.push('Google');
    }

    // Mistral
    if (this.availableAPIs.mistral) {
      this.providers.set('mistral', this.createMistralProvider());
      providers.push('Mistral (7B, Mixtral)');
      if (process.env.MISTRAL_API_KEY) fromEnv.push('Mistral');
    }

    // Cohere
    if (this.availableAPIs.cohere) {
      this.providers.set('cohere', this.createCohereProvider());
      providers.push('Cohere (Command)');
      if (process.env.COHERE_API_KEY) fromEnv.push('Cohere');
    }

    // Local models
    if (this.availableAPIs.local) {
      this.providers.set('local', this.createLocalProvider());
      providers.push('Local (Ollama)');
      if (process.env.OLLAMA_BASE_URL || process.env.LOCAL_LLM_URL) fromEnv.push('Local');
    }

    if (providers.length > 0) {
      console.log(chalk.green(`\n✅ ${providers.length} AI Providers Available:`));
      providers.forEach(p => console.log(chalk.cyan(`   • ${p}`)));

      if (fromEnv.length > 0) {
        console.log(chalk.gray(`\n📋 Credentials loaded from .env: ${fromEnv.join(', ')}`));
      }
    } else {
      console.log(chalk.red('\n❌ No AI providers configured'));
      console.log(chalk.yellow('Please add API keys to your project .env file'));
      console.log(chalk.gray('  1. Copy .env.example to .env'));
      console.log(chalk.gray('  2. Add your API keys'));
      console.log(chalk.gray('  3. Restart BUMBA'));
    }

    return providers.length;
  }

  /**
   * Execute task with intelligent multi-API orchestration
   */
  async orchestrate(task, options = {}) {
    console.log(chalk.cyan('\n' + '═'.repeat(70)));
    console.log(chalk.cyan('🚀 MULTI-API INTELLIGENT ORCHESTRATION'));
    console.log(chalk.cyan('═'.repeat(70)));

    // Analyze task to determine requirements
    const analysis = this.analyzeTask(task);
    console.log(chalk.yellow('\n📊 Task Analysis:'));
    console.log(chalk.gray(`   Type: ${analysis.type}`));
    console.log(chalk.gray(`   Complexity: ${analysis.complexity}`));
    console.log(chalk.gray(`   Requirements: ${analysis.requirements.join(', ')}`));

    // Select optimal model from EACH provider (now async with free tier prioritization)
    const selectedModels = await this.selectOptimalModels(analysis);

    console.log(chalk.yellow('\n🎯 Selected Models from Available Providers:'));
    selectedModels.forEach(model => {
      console.log(chalk.cyan(`   ${model.icon} ${model.role}`));
      console.log(chalk.gray(`      Provider: ${model.provider}`));
      console.log(chalk.gray(`      Model: ${model.model}`));
      console.log(chalk.gray(`      Specialty: ${model.specialty}\n`));
    });

    // Execute with each selected model
    const responses = [];
    console.log(chalk.yellow('🔄 Executing parallel API calls...\n'));

    for (let i = 0; i < selectedModels.length; i++) {
      const model = selectedModels[i];
      const progress = `[${i + 1}/${selectedModels.length}]`;

      console.log(chalk.blue(`${progress} ${model.icon} Calling ${model.provider}...`));
      console.log(chalk.gray(`     Model: ${model.model}`));

      try {
        const startTime = Date.now();
        const response = await this.executeWithProvider(
          model.provider,
          model.model,
          task,
          model.role,
          analysis
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(chalk.green(`     ✅ Success (${duration}s)`));

        const content = response?.content || response?.text || response;
        const preview = String(content).slice(0, 100).replace(/\n/g, ' ');
        console.log(chalk.white(`     Preview: "${preview}..."\n`));

        responses.push({
          provider: model.provider,
          model: model.model,
          role: model.role,
          content: String(content),
          duration,
          success: true
        });

        // Track free tier usage if applicable
        if (model.tierKey) {
          const tokens = this.freeTierManager.estimateTokens(task + String(content));
          await this.freeTierManager.trackUsage(model.tierKey, tokens, 1);
        }

      } catch (error) {
        console.log(chalk.red(`     ❌ Failed: ${error.message}\n`));
        responses.push({
          provider: model.provider,
          model: model.model,
          role: model.role,
          error: error.message,
          success: false
        });
      }
    }

    // Synthesize responses
    console.log(chalk.green('🎨 Synthesizing responses from all providers...\n'));
    const synthesis = await this.synthesizeResponses(responses, task);

    // Show final statistics
    const successful = responses.filter(r => r.success).length;
    console.log(chalk.cyan('═'.repeat(70)));
    console.log(chalk.green(`📊 Orchestration Complete:`));
    console.log(chalk.gray(`   • ${successful}/${selectedModels.length} models responded successfully`));
    console.log(chalk.gray(`   • ${this.providers.size} providers used`));
    console.log(chalk.gray(`   • Total time: ${responses.reduce((a, r) => a + parseFloat(r.duration || 0), 0).toFixed(2)}s`));
    console.log(chalk.cyan('═'.repeat(70) + '\n'));

    return synthesis;
  }

  /**
   * Analyze task to determine requirements
   */
  analyzeTask(task) {
    const taskLower = task.toLowerCase();
    const requirements = [];

    if (taskLower.includes('code') || taskLower.includes('function') ||
        taskLower.includes('implement') || taskLower.includes('build')) {
      requirements.push('coding');
    }

    if (taskLower.includes('reason') || taskLower.includes('logic') ||
        taskLower.includes('explain') || taskLower.includes('why')) {
      requirements.push('reasoning');
    }

    if (taskLower.includes('creative') || taskLower.includes('story') ||
        taskLower.includes('write')) {
      requirements.push('creative');
    }

    if (taskLower.includes('analyze') || taskLower.includes('data') ||
        taskLower.includes('review')) {
      requirements.push('analysis');
    }

    if (requirements.length === 0) {
      requirements.push('general');
    }

    return {
      type: this.detectTaskType(taskLower),
      complexity: task.split(' ').length > 15 ? 'complex' : 'simple',
      requirements
    };
  }

  detectTaskType(task) {
    if (task.includes('build') || task.includes('create')) return 'creation';
    if (task.includes('debug') || task.includes('fix')) return 'debugging';
    if (task.includes('explain') || task.includes('how')) return 'explanation';
    if (task.includes('analyze') || task.includes('review')) return 'analysis';
    return 'general';
  }

  /**
   * Select optimal models with free-tier prioritization and diversity
   */
  async selectOptimalModels(analysis) {
    const models = [];
    const taskType = this.mapAnalysisToTaskType(analysis);

    // Get free tier recommendations first
    const freeTierModel1 = await this.freeTierManager.getBestAvailableModel({
      taskType,
      allowPaid: false
    }).catch(() => null);

    const freeTierModel2 = await this.freeTierManager.getBestAvailableModel({
      taskType: 'general',
      allowPaid: false
    }).catch(() => null);

    // Add free models first (priority)
    if (freeTierModel1 && this.providers.has('openrouter')) {
      const modelConfig = this.createModelConfig(freeTierModel1, analysis, true);
      if (!this.wasRecentlyUsed(modelConfig.model)) {
        models.push(modelConfig);
        this.trackModelUsage(modelConfig.model);
      }
    }

    if (freeTierModel2 && this.providers.has('openrouter') &&
        freeTierModel2.model !== freeTierModel1?.model) {
      const modelConfig = this.createModelConfig(freeTierModel2, analysis, false);
      if (!this.wasRecentlyUsed(modelConfig.model)) {
        models.push(modelConfig);
        this.trackModelUsage(modelConfig.model);
      }
    }

    // Add diverse models from other providers if available and not recently used
    if (this.providers.has('google') && models.length < 3 && !this.wasRecentlyUsed('gemini-pro')) {
      models.push({
        provider: 'google',
        model: 'gemini-pro',
        role: 'Creative Thinker',
        icon: '🎨',
        specialty: 'Creative solutions and broad knowledge'
      });
      this.trackModelUsage('gemini-pro');
    }

    // Only use paid models if free models are exhausted or unavailable
    if (models.length < 2) {
      // Anthropic - Fix model name
      if (this.providers.has('anthropic') && !this.wasRecentlyUsed('claude-3-haiku-20240307')) {
        models.push({
          provider: 'anthropic',
          model: 'claude-3-haiku-20240307',
          role: 'Reasoning Expert',
          icon: '🧠',
          specialty: 'Deep reasoning and careful analysis'
        });
        this.trackModelUsage('claude-3-haiku-20240307');
      }

      // OpenAI fallback
      if (this.providers.has('openai') && models.length < 3 && !this.wasRecentlyUsed('gpt-4o-mini')) {
        models.push({
          provider: 'openai',
          model: 'gpt-4o-mini',
          role: 'Fast Responder',
          icon: '⚡',
          specialty: 'Quick, efficient responses'
        });
        this.trackModelUsage('gpt-4o-mini');
      }
    }

    // Ensure we have at least 2 diverse models
    if (models.length < 2 && this.providers.size > 0) {
      const firstProvider = Array.from(this.providers.keys())[0];
      const defaultModel = this.getDefaultModel(firstProvider);
      if (!this.wasRecentlyUsed(defaultModel)) {
        models.push({
          provider: firstProvider,
          model: defaultModel,
          role: 'Synthesis Specialist',
          icon: '🎯',
          specialty: 'Combining insights from all models'
        });
        this.trackModelUsage(defaultModel);
      }
    }

    console.log(chalk.green(`✅ Selected ${models.length} diverse models (${models.filter(m => m.isFree).length} free)`));
    return models;
  }

  /**
   * Map analysis requirements to free tier task types
   */
  mapAnalysisToTaskType(analysis) {
    if (analysis.requirements.includes('reasoning') || analysis.type === 'analysis') {
      return 'reasoning';
    } else if (analysis.requirements.includes('coding') || analysis.type === 'creation') {
      return 'coding';
    } else {
      return 'general';
    }
  }

  /**
   * Create model configuration from free tier recommendation
   */
  createModelConfig(freeTierModel, analysis, isPrimary) {
    const roles = {
      reasoning: 'Deep Reasoning Specialist',
      coding: 'Advanced Code Generator',
      general: isPrimary ? 'Primary Analyst' : 'Secondary Analyst'
    };

    const icons = {
      reasoning: '🔬',
      coding: '💻',
      general: isPrimary ? '🎯' : '🌟'
    };

    const taskType = freeTierModel.specialization || 'general';

    return {
      provider: freeTierModel.provider,
      model: freeTierModel.model,
      role: roles[taskType] || roles.general,
      icon: icons[taskType] || icons.general,
      specialty: `FREE: ${freeTierModel.specialization || 'general purpose'}`,
      isFree: freeTierModel.isFree,
      tierKey: freeTierModel.tierKey
    };
  }

  /**
   * Check if model was recently used (for diversity)
   */
  wasRecentlyUsed(modelName) {
    return this.recentlyUsedModels.includes(modelName);
  }

  /**
   * Track model usage for diversity
   */
  trackModelUsage(modelName) {
    this.recentlyUsedModels.push(modelName);
    if (this.recentlyUsedModels.length > this.maxRecentModels) {
      this.recentlyUsedModels.shift();
    }
  }

  /**
   * Execute with specific provider
   */
  async executeWithProvider(providerName, modelName, task, role, analysis) {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider ${providerName} not available`);
    }

    const prompt = this.createSpecializedPrompt(task, role, analysis);

    // Handle different provider interfaces
    if (provider.execute) {
      // OpenRouter style
      return await provider.execute(prompt, {
        model: modelName,
        temperature: 0.7,
        maxTokens: 1500
      });
    } else if (provider.complete) {
      // Generic completion interface
      return await provider.complete(prompt, {
        model: modelName,
        temperature: 0.7,
        maxTokens: 1500
      });
    } else {
      // Direct call
      return await this.makeDirectAPICall(providerName, modelName, prompt);
    }
  }

  createSpecializedPrompt(task, role, analysis) {
    const prompts = {
      'Code Specialist': `As a coding specialist, provide implementation for: ${task}\n\nFocus on clean, efficient, production-ready code.`,
      'Reasoning Expert': `As a reasoning expert, analyze this step-by-step: ${task}\n\nProvide logical analysis and clear reasoning.`,
      'Creative Thinker': `As a creative thinker, explore innovative solutions for: ${task}\n\nThink outside the box.`,
      'Fast Responder': `Provide a quick, concise response to: ${task}\n\nBe efficient and to the point.`,
      'Deep Reasoning Specialist': `Perform deep logical analysis on: ${task}\n\nBreak down the problem systematically.`,
      'Advanced Coder': `Generate advanced code implementation for: ${task}\n\nUse best practices and modern patterns.`,
      'Synthesis Specialist': `Synthesize a comprehensive solution for: ${task}\n\nCombine multiple perspectives.`,
      'default': task
    };

    return prompts[role] || prompts.default;
  }

  /**
   * Make direct API calls for providers without wrappers
   */
  async makeDirectAPICall(provider, model, prompt) {
    // Implementation for direct API calls to each provider
    switch (provider) {
      case 'openai':
        return this.callOpenAI(prompt, model);
      case 'anthropic':
        return this.callAnthropic(prompt, model);
      case 'google':
        return this.callGoogle(prompt, model);
      case 'mistral':
        return this.callMistral(prompt, model);
      case 'cohere':
        return this.callCohere(prompt, model);
      case 'local':
        return this.callLocal(prompt, model);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // Provider-specific API calls
  async callOpenAI(prompt, model) {
    if (!process.env.OPENAI_API_KEY) {
      console.log(chalk.yellow('OpenAI: No API key found'));
      return { content: '[OpenAI not configured]' };
    }

    console.log(chalk.gray(`OpenAI: Calling with model ${model || 'gpt-4o-mini'}`));
    console.log(chalk.gray(`OpenAI: Key starts with: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`));

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1500
        })
      });

      const data = await response.json();

      // Check for API errors
      if (!response.ok) {
        console.error(chalk.red(`OpenAI API Error: ${response.status}`));
        console.error(chalk.red(`Response: ${JSON.stringify(data)}`));
        return {
          content: `[OpenAI Error: ${data.error?.message || response.statusText}]`,
          provider: 'openai',
          model
        };
      }

      return {
        content: data.choices?.[0]?.message?.content || 'No response',
        provider: 'openai',
        model
      };
    } catch (error) {
      console.error(chalk.red(`OpenAI Exception: ${error.message}`));
      return {
        content: `[OpenAI Exception: ${error.message}]`,
        provider: 'openai',
        model
      };
    }
  }

  async callAnthropic(prompt, model) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(chalk.yellow('Anthropic: No API key found'));
      return { content: '[Anthropic not configured]' };
    }

    console.log(chalk.gray(`Anthropic: Calling with model ${model || 'claude-3-haiku-20240307'}`));
    console.log(chalk.gray(`Anthropic: Key starts with: ${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...`));

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500
        })
      });

      const data = await response.json();

      // Check for API errors
      if (!response.ok) {
        console.error(chalk.red(`Anthropic API Error: ${response.status}`));
        console.error(chalk.red(`Response: ${JSON.stringify(data)}`));
        return {
          content: `[Anthropic Error: ${data.error?.message || response.statusText}]`,
          provider: 'anthropic',
          model
        };
      }

      return {
        content: data.content?.[0]?.text || 'No response',
        provider: 'anthropic',
        model
      };
    } catch (error) {
      console.error(chalk.red(`Anthropic Exception: ${error.message}`));
      return {
        content: `[Anthropic Exception: ${error.message}]`,
        provider: 'anthropic',
        model
      };
    }
  }

  async callGoogle(prompt, model) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { content: '[Google not configured]' };
    }

    console.log(chalk.gray(`Google: Calling with model ${model || 'gemini-pro'}`));
    console.log(chalk.gray(`Google: Key starts with: ${apiKey.substring(0, 10)}...`));

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-pro'}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await response.json();

      // Check for API errors
      if (!response.ok || data.error) {
        console.error(chalk.red(`Google API Error: ${response.status}`));
        console.error(chalk.red(`Response: ${JSON.stringify(data)}`));
        return {
          content: `[Google Error: ${data.error?.message || response.statusText}]`,
          provider: 'google',
          model
        };
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        console.error(chalk.red(`Google returned empty response`));
        console.error(chalk.red(`Data: ${JSON.stringify(data)}`));
        return {
          content: '[Google returned empty response]',
          provider: 'google',
          model
        };
      }

      return {
        content,
        provider: 'google',
        model
      };
    } catch (error) {
      console.error(chalk.red(`Google Exception: ${error.message}`));
      return {
        content: `[Google Exception: ${error.message}]`,
        provider: 'google',
        model
      };
    }
  }

  async callMistral(prompt, model) {
    if (!process.env.MISTRAL_API_KEY) {
      return { content: '[Mistral not configured]' };
    }

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'mistral-medium',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1500
        })
      });

      const data = await response.json();
      return {
        content: data.choices?.[0]?.message?.content || 'No response',
        provider: 'mistral',
        model
      };
    } catch (error) {
      throw new Error(`Mistral API error: ${error.message}`);
    }
  }

  async callCohere(prompt, model) {
    if (!process.env.COHERE_API_KEY) {
      return { content: '[Cohere not configured]' };
    }

    try {
      const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'command',
          prompt: prompt,
          max_tokens: 1500,
          temperature: 0.7
        })
      });

      const data = await response.json();
      return {
        content: data.generations?.[0]?.text || 'No response',
        provider: 'cohere',
        model
      };
    } catch (error) {
      throw new Error(`Cohere API error: ${error.message}`);
    }
  }

  async callLocal(prompt, model) {
    const localUrl = process.env.LOCAL_LLM_URL || process.env.OLLAMA_HOST || 'http://localhost:11434';

    try {
      const response = await fetch(`${localUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama2',
          prompt: prompt,
          stream: false
        })
      });

      const data = await response.json();
      return {
        content: data.response || 'No response',
        provider: 'local',
        model
      };
    } catch (error) {
      throw new Error(`Local LLM error: ${error.message}`);
    }
  }

  /**
   * Synthesize responses from multiple providers
   */
  async synthesizeResponses(responses, originalTask) {
    // Filter out errors, empty responses, and API errors
    const successful = responses.filter(r => {
      if (!r.success) return false;
      const content = String(r.content || '').trim();
      if (!content || content === 'No response') return false;
      if (content.includes('[OpenAI Error:') || content.includes('[Anthropic Error:')) return false;
      return true;
    });

    if (successful.length === 0) {
      return 'No models were able to respond successfully. Please check your API configurations and try again.';
    }

    // If only one successful response, return it directly with minimal formatting
    if (successful.length === 1) {
      const response = successful[0];
      return `**${response.role}** (${response.provider}/${response.model}):\n\n${response.content}`;
    }

    // For multiple responses, use OpenRouter to synthesize them intelligently
    if (this.providers.has('openrouter') && successful.length > 1) {
      try {
        const synthesisPrompt = `You are a synthesis specialist. Multiple AI models have responded to this task: "${originalTask}"

Here are their responses:

${successful.map((r, i) => `**Response ${i + 1}** from ${r.role} (${r.provider}):
${r.content}

`).join('\n')}

Please create a comprehensive, unified response that:
1. Combines the best insights from all models
2. Resolves any contradictions by favoring the most detailed/accurate information
3. Presents the information in a clear, cohesive format
4. Adds value beyond just concatenating responses

Provide a single, synthesized answer that represents the collective intelligence of all models.`;

        const openrouter = this.providers.get('openrouter');
        const synthesisResult = await openrouter.execute(synthesisPrompt, {
          model: 'openai/gpt-4o-mini',
          temperature: 0.3,
          maxTokens: 2000
        });

        return synthesisResult.content || synthesisResult.text || this.fallbackSynthesis(successful, originalTask);
      } catch (error) {
        console.log(chalk.yellow('⚠️  Synthesis failed, using fallback'));
        return this.fallbackSynthesis(successful, originalTask);
      }
    }

    // Fallback synthesis
    return this.fallbackSynthesis(successful, originalTask);
  }

  /**
   * Fallback synthesis when intelligent synthesis fails
   */
  fallbackSynthesis(successful, originalTask) {
    // Find the longest/most detailed response
    const best = successful.reduce((prev, curr) =>
      (curr.content.length > prev.content.length) ? curr : prev
    );

    let synthesis = `## Multi-Model Response\n\n`;
    synthesis += `**Primary Answer** (${best.role} - ${best.provider}):\n\n`;
    synthesis += best.content + '\n\n';

    // Add other perspectives if significantly different
    const others = successful.filter(r => r !== best);
    if (others.length > 0) {
      synthesis += `**Additional Perspectives:**\n\n`;
      others.forEach(r => {
        if (r.content.length > 200 && r.content !== best.content) {
          synthesis += `*${r.role}:* ${r.content.slice(0, 300)}...\n\n`;
        }
      });
    }

    return synthesis;
  }

  // Provider factory methods
  createOpenAIProvider() {
    return {
      name: 'openai',
      execute: async (prompt, options) => this.callOpenAI(prompt, options.model)
    };
  }

  createAnthropicProvider() {
    return {
      name: 'anthropic',
      execute: async (prompt, options) => this.callAnthropic(prompt, options.model)
    };
  }

  createGoogleProvider() {
    return {
      name: 'google',
      execute: async (prompt, options) => this.callGoogle(prompt, options.model)
    };
  }

  createMistralProvider() {
    return {
      name: 'mistral',
      execute: async (prompt, options) => this.callMistral(prompt, options.model)
    };
  }

  createCohereProvider() {
    return {
      name: 'cohere',
      execute: async (prompt, options) => this.callCohere(prompt, options.model)
    };
  }

  createLocalProvider() {
    return {
      name: 'local',
      execute: async (prompt, options) => this.callLocal(prompt, options.model)
    };
  }

  getDefaultModel(provider) {
    const defaults = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-haiku-20240307',
      google: 'gemini-pro',
      mistral: 'mistral-medium',
      cohere: 'command',
      local: 'llama2',
      openrouter: 'openai/gpt-4o-mini'
    };
    return defaults[provider] || 'default';
  }
}

module.exports = MultiAPIOrchestrator;