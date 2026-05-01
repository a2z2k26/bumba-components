/**
 * Agent Lifecycle LLM Agent Orchestration Example
 * Demonstrates managing multiple LLM agents with rate limiting and retries
 * Part of the BUMBA Platform
 */

const { AgentOrchestrator, StateEvent, AgentState } = require('../src/index');

class LLMAgentManager {
  constructor() {
    this.orchestrator = new AgentOrchestrator({
      maxAgents: 10,
      defaultAgentConfig: {
        maxActiveTime: 30000,  // 30s per query
        maxValidationTime: 5000,  // 5s to validate
        maxRetries: 2
      }
    });

    this.setupEventHandlers();
    this.requestQueue = [];
    this.activeRequests = new Map();
  }

  setupEventHandlers() {
    this.orchestrator.on('agent:stateChange', ({ agentId, from, to, data }) => {
      console.log(`[${new Date().toISOString()}] Agent ${agentId}: ${from} → ${to}`);

      if (to === AgentState.COMPLETED) {
        this.handleCompletion(agentId);
      }
    });

    this.orchestrator.on('agent:completed', ({ agentId, stats }) => {
      const duration = stats.totalLifetime;
      const retries = stats.retryCount;
      console.log(`✅ Agent ${agentId} completed in ${duration}ms with ${retries} retries`);
    });
  }

  async processQuery(queryId, prompt, options = {}) {
    const agent = this.orchestrator.createAgent(queryId, options);

    try {
      // Start spawning
      await agent.transition(StateEvent.SPAWN, {
        prompt,
        model: options.model || 'gpt-4',
        temperature: options.temperature || 0.7
      });

      // Simulate API rate limit check
      await this.checkRateLimit();

      // Activate and process
      await agent.transition(StateEvent.ACTIVATE, {
        taskCount: 1,
        timestamp: Date.now()
      });

      // Simulate LLM API call
      const response = await this.callLLMAPI(prompt, agent);

      // Validate response
      await agent.transition(StateEvent.VALIDATE, {
        response,
        validationRules: options.validationRules
      });

      const isValid = await this.validateResponse(response, options.validationRules);

      if (!isValid && agent.retryCount < agent.config.maxRetries) {
        // Retry with modified prompt
        await agent.transition(StateEvent.ACTIVATE);
        return this.processQuery(queryId + '-retry', prompt + ' (Please be more specific)', options);
      }

      // Complete
      await agent.transition(StateEvent.COMPLETE, {
        response,
        success: isValid
      });

      return response;

    } catch (error) {
      console.error(`❌ Error in agent ${queryId}:`, error.message);

      if (agent.retryCount < agent.config.maxRetries) {
        await agent.retry({ error: error.message });
        return this.processQuery(queryId, prompt, options);
      }

      await agent.forceComplete('error');
      throw error;
    }
  }

  async checkRateLimit() {
    const activeAgents = this.orchestrator.getAgentsInState(AgentState.ACTIVE);

    if (activeAgents.length >= 5) {
      console.log('⏳ Rate limit reached, waiting...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.checkRateLimit();
    }
  }

  async callLLMAPI(prompt, agent) {
    const metadata = agent.getMetadata();
    console.log(`🤖 Calling LLM API for ${agent.agentId} with model ${metadata.spawnData.model}`);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Simulate different response types
    const responses = [
      { text: `Response to: ${prompt}`, confidence: 0.95, tokens: 150 },
      { text: `Analysis of: ${prompt}`, confidence: 0.85, tokens: 200 },
      { text: `Summary for: ${prompt}`, confidence: 0.90, tokens: 100 },
      { error: 'Rate limited' },
      { error: 'Invalid response format' }
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];

    if (response.error) {
      throw new Error(response.error);
    }

    return response;
  }

  async validateResponse(response, rules = {}) {
    // Simulate validation
    if (rules.minConfidence && response.confidence < rules.minConfidence) {
      console.log(`⚠️  Confidence ${response.confidence} below threshold ${rules.minConfidence}`);
      return false;
    }

    if (rules.maxTokens && response.tokens > rules.maxTokens) {
      console.log(`⚠️  Token count ${response.tokens} exceeds limit ${rules.maxTokens}`);
      return false;
    }

    return true;
  }

  handleCompletion(agentId) {
    const request = this.activeRequests.get(agentId);
    if (request) {
      this.activeRequests.delete(agentId);
      this.processNextInQueue();
    }
  }

  async processNextInQueue() {
    if (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift();
      await this.processQuery(next.id, next.prompt, next.options);
    }
  }

  getStatus() {
    const metrics = this.orchestrator.getMetrics();
    return {
      ...metrics,
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      agentStates: this.orchestrator.getAgentsInState(AgentState.ACTIVE).map(a => ({
        id: a.id,
        state: a.agent.getState(),
        retries: a.agent.retryCount,
        metadata: a.agent.getMetadata()
      }))
    };
  }
}

// Demo
async function demo() {
  console.log('🚀 LLM Agent Orchestration Demo\n');

  const manager = new LLMAgentManager();

  // Process multiple queries in parallel
  const queries = [
    { id: 'query-1', prompt: 'Explain quantum computing', options: { minConfidence: 0.8 } },
    { id: 'query-2', prompt: 'Write a haiku about coding', options: { maxTokens: 50 } },
    { id: 'query-3', prompt: 'Analyze market trends', options: { model: 'gpt-3.5-turbo' } },
    { id: 'query-4', prompt: 'Summarize this article', options: { minConfidence: 0.9 } },
    { id: 'query-5', prompt: 'Generate code review', options: { temperature: 0.3 } }
  ];

  const promises = queries.map(q =>
    manager.processQuery(q.id, q.prompt, q.options)
      .then(result => ({ id: q.id, success: true, result }))
      .catch(error => ({ id: q.id, success: false, error: error.message }))
  );

  // Monitor status
  const statusInterval = setInterval(() => {
    const status = manager.getStatus();
    console.log('\n📊 Status:', {
      active: status.activeAgents,
      total: status.totalAgents,
      completed: status.totalCompleted
    });
  }, 2000);

  // Wait for all queries
  const results = await Promise.all(promises);

  clearInterval(statusInterval);

  // Show results
  console.log('\n📋 Results:');
  results.forEach(r => {
    if (r.success) {
      console.log(`✅ ${r.id}: ${JSON.stringify(r.result)}`);
    } else {
      console.log(`❌ ${r.id}: ${r.error}`);
    }
  });

  // Final metrics
  console.log('\n📊 Final Metrics:', manager.getStatus());

  process.exit(0);
}

if (require.main === module) {
  demo().catch(console.error);
}

module.exports = LLMAgentManager;