/**
 * Agent Factory - Dynamic Agent Creation System
 * Core of the 40 Thieves Architecture
 * Enables spawning of specialized agents on demand
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const chalk = require('chalk');

// Optional dependency: @bumba/memory system
let MemoryManager;
try { MemoryManager = require('@bumba/memory').UnifiedMemory; } catch (e) { MemoryManager = null; }

class AgentFactory extends EventEmitter {
  constructor() {
    super();

    // Agent tracking
    this.agents = new Map();
    this.agentHierarchy = new Map();
    this.agentLifecycles = new Map();

    // Memory system
    this.memoryManager = null;
    this.memoryEnabled = false;

    // Agent templates
    this.templates = {
      chief: {
        maxChildren: 10,
        canSpawn: true,
        lifetime: 'session',
        capabilities: ['analyze', 'delegate', 'spawn', 'synthesize']
      },
      specialist: {
        maxChildren: 3,
        canSpawn: true,
        lifetime: 'task',
        capabilities: ['execute', 'report', 'collaborate']
      },
      worker: {
        maxChildren: 0,
        canSpawn: false,
        lifetime: 'subtask',
        capabilities: ['execute', 'report']
      }
    };

    // Statistics
    this.stats = {
      totalSpawned: 0,
      currentActive: 0,
      totalTerminated: 0,
      totalTokensUsed: 0,
      totalCost: 0
    };

    // Configuration
    this.config = {
      maxTotalAgents: 40,
      maxDepth: 4,
      autoTerminate: true,
      costLimit: null,
      tokenLimit: null,
      mockMode: false  // Enable for testing without API keys
    };

    // Agent pool for optimization
    this.agentPool = new Map();
    this.poolConfig = {
      enabled: true,
      maxPoolSize: 10,
      preSpawn: [
        { type: 'worker', role: 'general', count: 2 },
        { type: 'specialist', role: 'backend', count: 1 },
        { type: 'specialist', role: 'frontend', count: 1 }
      ]
    };

    // Initialize pool if enabled
    if (this.poolConfig.enabled) {
      setTimeout(() => this.initializePool(), 100);
    }

    // Execution hooks for TaskExecutionEngine integration
    this.executionHooks = {
      beforeExecute: [],
      afterExecute: [],
      onError: [],
      onSuccess: []
    };
  }

  /**
   * Initialize memory system
   */
  async initializeMemory(config = {}) {
    if (!MemoryManager) {
      console.log(chalk.yellow('⚠️  Memory system not available'));
      return false;
    }

    try {
      this.memoryManager = new MemoryManager(config);
      await this.memoryManager.initialize();
      this.memoryEnabled = true;
      console.log(chalk.green('✓ Memory system initialized'));
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to initialize memory:'), error.message);
      this.memoryEnabled = false;
      return false;
    }
  }

  /**
   * Register execution hook
   */
  registerHook(type, callback) {
    if (this.executionHooks[type]) {
      this.executionHooks[type].push(callback);
    }
  }

  /**
   * Execute hooks
   */
  async executeHooks(type, data) {
    if (!this.executionHooks[type]) return;

    for (const hook of this.executionHooks[type]) {
      try {
        await hook(data);
      } catch (error) {
        console.error(`Hook error (${type}):`, error.message);
      }
    }
  }

  /**
   * Spawn a new agent dynamically (with pooling optimization)
   */
  async spawnAgent(role, type = 'specialist', params = {}) {
    // Handle different call signatures
    if (typeof role === 'object') {
      params = role;
      role = params.role;
      type = params.type || 'specialist';
    }

    const {
      parent = null,
      provider = null,
      model = null,
      task = null,
      systemPrompt = null,
      capabilities = null,
      metadata = {}
    } = params;

    // Try to get agent from pool first
    const pooledAgent = this.getPooledAgent(type, role);
    if (pooledAgent) {
      // Configure pooled agent
      pooledAgent.parent = parent;
      pooledAgent.provider = provider || this.selectOptimalProvider(role);
      pooledAgent.model = model || this.selectOptimalModel(role);
      pooledAgent.task = task;
      pooledAgent.metadata = {
        ...metadata,
        spawnedAt: Date.now(),
        spawnedBy: parent || 'system',
        fromPool: true
      };

      this.agents.set(pooledAgent.id, pooledAgent);
      this.stats.totalSpawned++;
      this.stats.currentActive++;

      console.log(chalk.green(`✨ Spawned from pool: ${pooledAgent.role} [${pooledAgent.id}]`));
      return pooledAgent;
    }

    // Check limits
    if (this.agents.size >= this.config.maxTotalAgents) {
      throw new Error(`Agent limit reached: ${this.config.maxTotalAgents} agents`);
    }

    // Check parent's spawning capability
    if (parent) {
      const parentAgent = this.agents.get(parent);
      if (!parentAgent) {
        throw new Error(`Parent agent ${parent} not found`);
      }
      if (!parentAgent.canSpawn) {
        throw new Error(`Agent ${parent} cannot spawn children`);
      }
      if (parentAgent.children.length >= parentAgent.maxChildren) {
        throw new Error(`Agent ${parent} has reached child limit`);
      }
    }

    // Generate unique ID
    const agentId = this.generateAgentId(role);

    // Get template
    const template = this.templates[type] || this.templates.specialist;

    // Check for relevant memories
    let relevantMemories = [];
    let injectedContext = '';

    if (this.memoryEnabled && this.memoryManager) {
      try {
        // Search for memories relevant to this agent's role and task
        const searchQueries = [
          role,
          task?.description || task,
          `${type} ${role}`,
          metadata?.context
        ].filter(Boolean);

        for (const query of searchQueries) {
          const memories = await this.memoryManager.searchSemanticMemories(query, {
            nResults: 5,
            category: null
          });

          if (memories.results && memories.results.length > 0) {
            relevantMemories.push(...memories.results);
          }
        }

        // Deduplicate and sort by relevance
        const uniqueMemories = new Map();
        relevantMemories.forEach(m => {
          if (!uniqueMemories.has(m.id) || m.relevanceScore > uniqueMemories.get(m.id).relevanceScore) {
            uniqueMemories.set(m.id, m);
          }
        });

        relevantMemories = Array.from(uniqueMemories.values())
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, 10);

        // Build context from memories
        if (relevantMemories.length > 0) {
          injectedContext = '\n\nRelevant past experiences:\n';
          relevantMemories.forEach((memory, idx) => {
            injectedContext += `${idx + 1}. ${memory.content}\n`;
          });
        }

        // Also check for past agent performance
        const agentHistory = await this.memoryManager.getAgentHistory(role);
        if (agentHistory && agentHistory.length > 0) {
          const successRate = agentHistory.filter(h => h.success).length / agentHistory.length;
          metadata.historicalSuccessRate = successRate;
        }
      } catch (error) {
        console.error(chalk.yellow('Memory injection failed:'), error.message);
      }
    }

    // Create agent instance with defaults and memory context
    const agent = {
      id: agentId,
      type: type || 'specialist',
      role: role || 'general',
      parent,
      children: [],
      provider: provider || this.selectOptimalProvider(role),
      model: model || this.selectOptimalModel(role),
      systemPrompt: (systemPrompt || this.generateSystemPrompt(role, type)) + injectedContext,
      capabilities: capabilities || template.capabilities,
      canSpawn: template.canSpawn,
      maxChildren: template.maxChildren,
      lifetime: template.lifetime,
      status: 'idle',
      task: task,
      memories: relevantMemories.map(m => m.id),
      metadata: {
        ...metadata,
        spawnedAt: Date.now(),
        spawnedBy: parent || 'system',
        depth: this.calculateDepth(parent),
        tokenCount: 0,
        cost: 0,
        memoryEnhanced: relevantMemories.length > 0
      },
      // Methods
      execute: async (taskData) => this.executeAgent(agentId, taskData),
      spawn: async (childParams) => this.spawnChild(agentId, childParams),
      terminate: async () => this.terminateAgent(agentId),
      communicate: async (targetId, message) => this.agentCommunicate(agentId, targetId, message),
      storeMemory: async (memory) => this.storeAgentMemory(agentId, memory)
    };

    // Register agent
    this.agents.set(agentId, agent);

    // Update hierarchy
    if (parent) {
      const parentAgent = this.agents.get(parent);
      parentAgent.children.push(agentId);
      this.agentHierarchy.set(agentId, parent);
    } else {
      this.agentHierarchy.set(agentId, null);
    }

    // Set lifecycle
    this.setupLifecycle(agentId, template.lifetime);

    // Update stats
    this.stats.totalSpawned++;
    this.stats.currentActive++;

    // Emit event
    this.emit('agent:spawned', {
      id: agentId,
      role,
      type,
      parent,
      depth: agent.metadata.depth
    });

    // Log creation
    const depthIndicator = '  '.repeat(agent.metadata.depth);
    console.log(chalk.green(`${depthIndicator}✨ Spawned ${type} agent: ${role} [${agentId}]`));

    if (parent) {
      const parentAgent = this.agents.get(parent);
      console.log(chalk.gray(`${depthIndicator}   Parent: ${parentAgent.role} [${parent}]`));
    }

    return agent;
  }

  /**
   * Spawn a child agent
   */
  async spawnChild(parentId, childParams) {
    const parent = this.agents.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent ${parentId} not found`);
    }

    return await this.spawnAgent({
      ...childParams,
      parent: parentId,
      type: childParams.type || 'worker'
    });
  }

  /**
   * Execute task with automatic agent assignment
   * Core integration point for TaskExecutionEngine
   */
  async executeTask(taskData) {
    // Auto-spawn agent if not provided
    const agent = taskData.agentId
      ? this.agents.get(taskData.agentId)
      : await this.spawnAgent({
          role: taskData.agentRole || taskData.agent || 'specialist',
          type: taskData.agentType || 'specialist',
          task: taskData
        });

    if (!agent) {
      throw new Error('Failed to assign agent for task');
    }

    return await this.executeAgent(agent.id, taskData);
  }

  /**
   * Enable mock mode for testing
   */
  enableMockMode() {
    this.config.mockMode = true;
    console.log(chalk.yellow('🧪 Mock mode enabled - no API calls will be made'));
  }

  /**
   * Execute agent task
   */
  async executeAgent(agentId, taskData) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Update status
    agent.status = 'executing';
    this.emit('agent:executing', { id: agentId, task: taskData });

    // Execute before hooks
    await this.executeHooks('beforeExecute', { agent, taskData });

    try {
      // Check if we're in mock mode
      if (this.config.mockMode) {
        // Return mock result for testing
        const mockResult = {
          agentId: agentId,
          success: true,
          output: `[MOCK] Task executed by ${agent.role}: ${taskData.title || 'Unnamed task'}`,
          tokens: 100,
          cost: 0.002,
          timestamp: Date.now()
        };

        // Update metrics with mock data
        agent.metadata.tokenCount += mockResult.tokens;
        agent.metadata.cost += mockResult.cost;
        this.stats.totalTokensUsed += mockResult.tokens;
        this.stats.totalCost += mockResult.cost;

        // Update status
        agent.status = 'idle';
        agent.lastResult = mockResult;

        this.emit('agent:executed', {
          id: agentId,
          task: taskData,
          result: mockResult
        });

        // Execute after hooks
        await this.executeHooks('afterExecute', { agent, taskData, result: mockResult });

        return mockResult;
      }

      // Get orchestrator for actual AI execution
      const orchestrator = await this.getOrchestrator();

      // Execute with agent's configuration
      const result = await orchestrator.executeWithProvider(
        agent.provider,
        agent.model,
        taskData,
        agent.role,
        {
          systemPrompt: agent.systemPrompt,
          parentContext: agent.parent ? this.getParentContext(agent.parent) : null,
          siblingContext: this.getSiblingContext(agentId),
          depth: agent.metadata.depth
        }
      );

      // Update metrics
      agent.metadata.tokenCount += result.tokens || 0;
      agent.metadata.cost += result.cost || 0;
      this.stats.totalTokensUsed += result.tokens || 0;
      this.stats.totalCost += result.cost || 0;

      // Update status
      agent.status = 'idle';
      agent.lastResult = result;

      this.emit('agent:executed', {
        id: agentId,
        success: true,
        tokens: result.tokens,
        cost: result.cost
      });

      // Execute success hooks
      await this.executeHooks('onSuccess', { agent, result });

      // Execute after hooks
      await this.executeHooks('afterExecute', { agent, result });

      return result;

    } catch (error) {
      agent.status = 'error';
      this.emit('agent:error', { id: agentId, error: error.message });

      // Execute error hooks
      await this.executeHooks('onError', { agent, error });

      throw error;
    }
  }

  /**
   * Agent-to-agent communication
   */
  async agentCommunicate(fromId, toId, message) {
    const fromAgent = this.agents.get(fromId);
    const toAgent = this.agents.get(toId);

    if (!fromAgent || !toAgent) {
      throw new Error('Agent not found');
    }

    this.emit('agent:communication', {
      from: fromId,
      to: toId,
      message
    });

    // Execute communication as a task for the target agent
    return await this.executeAgent(toId, {
      type: 'communication',
      from: fromAgent.role,
      message,
      context: fromAgent.lastResult
    });
  }

  /**
   * Register external agent spawner (Sprint 19: Department Manager support)
   */
  registerExternalSpawner(config) {
    const spawnerId = `spawner_${config.name}_${Date.now()}`;

    // Store spawner configuration
    if (!this.externalSpawners) {
      this.externalSpawners = new Map();
    }

    this.externalSpawners.set(spawnerId, {
      ...config,
      id: spawnerId
    });

    console.log(chalk.green(`✅ Registered external spawner: ${config.name}`));

    this.emit('spawner:registered', config);

    return spawnerId;
  }

  /**
   * Terminate an agent and its children
   */
  async terminateAgent(agentId, cascade = true) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Terminate children first if cascading
    if (cascade && agent.children.length > 0) {
      for (const childId of agent.children) {
        await this.terminateAgent(childId, true);
      }
    }

    // Remove from parent's children list
    if (agent.parent) {
      const parent = this.agents.get(agent.parent);
      if (parent) {
        parent.children = parent.children.filter(id => id !== agentId);
      }
    }

    // Clear lifecycle
    const lifecycle = this.agentLifecycles.get(agentId);
    if (lifecycle && lifecycle.timer) {
      clearTimeout(lifecycle.timer);
    }
    this.agentLifecycles.delete(agentId);

    // Remove from hierarchy
    this.agentHierarchy.delete(agentId);

    // Remove agent
    this.agents.delete(agentId);

    // Update stats
    this.stats.currentActive--;
    this.stats.totalTerminated++;

    // Log termination
    const depthIndicator = '  '.repeat(agent.metadata.depth);
    console.log(chalk.red(`${depthIndicator}🔚 Terminated ${agent.type}: ${agent.role} [${agentId}]`));

    this.emit('agent:terminated', {
      id: agentId,
      role: agent.role,
      lifetime: Date.now() - agent.metadata.spawnedAt,
      tokens: agent.metadata.tokenCount,
      cost: agent.metadata.cost
    });
  }

  /**
   * Setup agent lifecycle management
   */
  setupLifecycle(agentId, lifetime) {
    const lifecycleConfig = {
      session: null, // Lives until session ends
      task: 30 * 60 * 1000, // 30 minutes
      subtask: 10 * 60 * 1000 // 10 minutes
    };

    const duration = lifecycleConfig[lifetime];
    if (duration && this.config.autoTerminate) {
      const timer = setTimeout(() => {
        console.log(chalk.yellow(`⏰ Auto-terminating ${agentId} (${lifetime} expired)`));
        this.terminateAgent(agentId);
      }, duration);

      this.agentLifecycles.set(agentId, {
        lifetime,
        timer,
        expiresAt: Date.now() + duration
      });
    }
  }

  /**
   * Store agent memory
   */
  async storeAgentMemory(agentId, memory) {
    if (!this.memoryEnabled || !this.memoryManager) {
      return null;
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      const memoryData = {
        agentId,
        taskId: agent.task?.id || null,
        content: memory.content || memory,
        type: memory.type || 'general',
        importance: memory.importance || 5,
        success: memory.success !== undefined ? memory.success : true,
        metadata: {
          role: agent.role,
          agentType: agent.type,
          ...memory.metadata
        }
      };

      const result = await this.memoryManager.addSemanticMemory(memoryData);

      // Also save to operational memory
      await this.memoryManager.saveAgentState(agentId, {
        ...agent,
        lastMemory: result.id
      });

      return result;
    } catch (error) {
      console.error(chalk.red('Failed to store agent memory:'), error.message);
      return null;
    }
  }

  /**
   * Select optimal provider for role
   */
  selectOptimalProvider(role) {
    // Role-based provider selection
    const providerMap = {
      // Strategic roles prefer GPT-4
      'product': 'openai',
      'architect': 'openai',
      'strategist': 'openai',

      // Technical roles prefer Claude
      'developer': 'anthropic',
      'debugger': 'anthropic',
      'reviewer': 'anthropic',

      // Creative roles prefer GPT-4
      'designer': 'openai',
      'ux': 'openai',
      'creative': 'openai',

      // Fast iteration roles prefer Groq
      'validator': 'groq',
      'tester': 'groq',
      'monitor': 'groq'
    };

    // Check for role keywords
    for (const [keyword, provider] of Object.entries(providerMap)) {
      if (role && role.toLowerCase().includes(keyword)) {
        return provider;
      }
    }

    // Default to OpenAI
    return process.env.DEFAULT_AGENT_PROVIDER || 'openai';
  }

  /**
   * Select optimal model for role
   */
  selectOptimalModel(role) {
    // Default if no role provided
    if (!role) {
      return 'gpt-4';
    }

    const roleStr = role.toLowerCase();

    // Complex tasks need powerful models
    if (roleStr.includes('chief') || roleStr.includes('architect') || roleStr.includes('strategist')) {
      return 'gpt-4';
    }

    // Code tasks benefit from Claude
    if (roleStr.includes('developer') || roleStr.includes('engineer')) {
      return 'claude-sonnet-4-5-20250929';
    }

    // Fast tasks can use smaller models
    if (roleStr.includes('validator') || roleStr.includes('tester')) {
      return 'gpt-3.5-turbo';
    }

    return 'gpt-4';
  }

  /**
   * Generate system prompt for agent
   */
  generateSystemPrompt(role, type) {
    const basePrompt = `You are a ${role} agent in a multi-agent system.`;

    const typePrompts = {
      chief: `You are a chief-level agent responsible for high-level decisions, delegation, and spawning specialists.`,
      specialist: `You are a specialist agent with deep expertise in your domain. You can spawn workers for specific subtasks.`,
      worker: `You are a worker agent focused on executing specific tasks efficiently and reporting results.`
    };

    const capabilities = {
      chief: `You can: analyze complex problems, delegate to specialists, spawn new agents, synthesize results.`,
      specialist: `You can: execute domain-specific tasks, collaborate with peers, spawn workers, provide expertise.`,
      worker: `You can: execute assigned tasks, report progress, collaborate when requested.`
    };

    return `${basePrompt}\n${typePrompts[type]}\n${capabilities[type]}\n\nYour role: ${role}\nFocus on your expertise and collaborate effectively with other agents.`;
  }

  /**
   * Generate unique agent ID
   */
  generateAgentId(role) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    const rolePrefix = role ? role.substring(0, 3).toUpperCase() : 'AGT';
    return `${rolePrefix}-${timestamp}-${random}`;
  }

  /**
   * Calculate agent depth in hierarchy
   */
  calculateDepth(parentId) {
    if (!parentId) return 0;

    let depth = 1;
    let currentParent = parentId;

    while (currentParent && depth < this.config.maxDepth) {
      const parent = this.agentHierarchy.get(currentParent);
      if (!parent) break;
      currentParent = parent;
      depth++;
    }

    return depth;
  }

  /**
   * Get parent context for agent
   */
  getParentContext(parentId) {
    const parent = this.agents.get(parentId);
    if (!parent) return null;

    return {
      role: parent.role,
      task: parent.task,
      lastResult: parent.lastResult,
      depth: parent.metadata.depth
    };
  }

  /**
   * Get sibling context for agent
   */
  getSiblingContext(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.parent) return [];

    const parent = this.agents.get(agent.parent);
    if (!parent) return [];

    return parent.children
      .filter(id => id !== agentId)
      .map(id => {
        const sibling = this.agents.get(id);
        return sibling ? {
          role: sibling.role,
          status: sibling.status,
          lastResult: sibling.lastResult
        } : null;
      })
      .filter(Boolean);
  }

  /**
   * Get orchestrator instance
   */
  async getOrchestrator() {
    try {
      const { MultiAPIOrchestrator } = require('@bumba/ai-gateway');
      return new MultiAPIOrchestrator();
    } catch (error) {
      // AI Gateway not installed - return null
      return null;
    }
  }

  /**
   * Get hierarchy visualization
   */
  getHierarchyVisualization(agentId = null) {
    const lines = [];

    const renderAgent = (id, indent = 0) => {
      const agent = this.agents.get(id);
      if (!agent) return;

      const prefix = '  '.repeat(indent) + (indent > 0 ? '└─ ' : '');
      const status = agent.status === 'executing' ? '🔄' : '✅';
      lines.push(`${prefix}${status} ${agent.role} [${agent.type}] - ${agent.id}`);

      for (const childId of agent.children) {
        renderAgent(childId, indent + 1);
      }
    };

    if (agentId) {
      renderAgent(agentId);
    } else {
      // Render all root agents
      for (const [id, parent] of this.agentHierarchy) {
        if (!parent) {
          renderAgent(id);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get factory statistics
   */
  getStats() {
    return {
      ...this.stats,
      hierarchyDepth: Math.max(...Array.from(this.agents.values()).map(a => a.metadata.depth)) || 0,
      agentsByType: {
        chief: Array.from(this.agents.values()).filter(a => a.type === 'chief').length,
        specialist: Array.from(this.agents.values()).filter(a => a.type === 'specialist').length,
        worker: Array.from(this.agents.values()).filter(a => a.type === 'worker').length
      },
      agentsByStatus: {
        idle: Array.from(this.agents.values()).filter(a => a.status === 'idle').length,
        executing: Array.from(this.agents.values()).filter(a => a.status === 'executing').length,
        error: Array.from(this.agents.values()).filter(a => a.status === 'error').length
      }
    };
  }

  /**
   * Initialize the agent factory
   */
  async initialize() {
    if (this.isInitialized) {
      return this;
    }

    console.log(chalk.blue('🏭 Initializing Agent Factory'));

    // Initialize pool if configured
    if (this.poolConfig && this.poolConfig.enabled) {
      await this.initializePool();
    }

    // Initialize external spawners map if not exists
    if (!this.externalSpawners) {
      this.externalSpawners = new Map();
    }

    this.isInitialized = true;

    console.log(chalk.green('✅ Agent Factory initialized'));
    return this;
  }

  /**
   * Initialize agent pool for optimization
   */
  async initializePool() {
    if (!this.poolConfig.enabled) return;

    for (const preset of this.poolConfig.preSpawn) {
      for (let i = 0; i < preset.count; i++) {
        try {
          const agent = await this.createPooledAgent(preset.type, preset.role);
          const poolKey = `${preset.type}-${preset.role}`;

          if (!this.agentPool.has(poolKey)) {
            this.agentPool.set(poolKey, []);
          }

          this.agentPool.get(poolKey).push(agent);
        } catch (error) {
          // Pool initialization is non-critical
        }
      }
    }
  }

  /**
   * Create a pooled agent
   */
  async createPooledAgent(type, role) {
    const agentId = this.generateAgentId(`pool-${role}`);
    const template = this.templates[type] || this.templates.specialist;

    return {
      id: agentId,
      type,
      role,
      pooled: true,
      status: 'pooled',
      template,
      created: Date.now()
    };
  }

  /**
   * Get agent from pool
   */
  getPooledAgent(type, role) {
    if (!this.poolConfig.enabled) return null;

    const poolKey = `${type}-${role}`;
    const pool = this.agentPool.get(poolKey);

    if (pool && pool.length > 0) {
      const agent = pool.shift();
      agent.status = 'idle';
      agent.pooled = false;
      return agent;
    }

    return null;
  }

  /**
   * Return agent to pool
   */
  returnToPool(agent) {
    if (!this.poolConfig.enabled || !agent.pooled) return false;

    const poolKey = `${agent.type}-${agent.role}`;

    if (!this.agentPool.has(poolKey)) {
      this.agentPool.set(poolKey, []);
    }

    const pool = this.agentPool.get(poolKey);

    if (pool.length < this.poolConfig.maxPoolSize) {
      // Reset agent state
      agent.status = 'pooled';
      agent.parent = null;
      agent.children = [];
      agent.task = null;
      pool.push(agent);
      return true;
    }

    return false;
  }

  /**
   * Create and manage task queue
   */
  createTaskQueue() {
    if (!this.taskQueue) {
      this.taskQueue = {
        pending: [],
        active: new Map(),
        completed: [],
        failed: [],

        // Add task to queue
        add: (task) => {
          this.taskQueue.pending.push({
            ...task,
            id: task.id || crypto.randomBytes(8).toString('hex'),
            status: 'pending',
            queuedAt: Date.now()
          });
          this.emit('queue:task-added', task);
        },

        // Get next task
        next: () => {
          const task = this.taskQueue.pending.shift();
          if (task) {
            task.status = 'active';
            task.startedAt = Date.now();
            this.taskQueue.active.set(task.id, task);
            this.emit('queue:task-started', task);
          }
          return task;
        },

        // Mark task complete
        complete: (taskId, result) => {
          const task = this.taskQueue.active.get(taskId);
          if (task) {
            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = result;
            this.taskQueue.active.delete(taskId);
            this.taskQueue.completed.push(task);
            this.emit('queue:task-completed', task);
          }
        },

        // Mark task failed
        fail: (taskId, error) => {
          const task = this.taskQueue.active.get(taskId);
          if (task) {
            task.status = 'failed';
            task.failedAt = Date.now();
            task.error = error;
            this.taskQueue.active.delete(taskId);
            this.taskQueue.failed.push(task);
            this.emit('queue:task-failed', task);
          }
        },

        // Get queue stats
        stats: () => ({
          pending: this.taskQueue.pending.length,
          active: this.taskQueue.active.size,
          completed: this.taskQueue.completed.length,
          failed: this.taskQueue.failed.length
        })
      };
    }
    return this.taskQueue;
  }

  /**
   * Process task queue
   */
  async processTaskQueue(options = {}) {
    const { maxConcurrent = 3, autoSpawn = true } = options;
    const queue = this.createTaskQueue();

    while (queue.pending.length > 0 || queue.active.size > 0) {
      // Start new tasks if under limit
      while (queue.active.size < maxConcurrent && queue.pending.length > 0) {
        const task = queue.next();
        if (!task) break;

        // Process task asynchronously
        this.executeTask(task)
          .then(result => queue.complete(task.id, result))
          .catch(error => queue.fail(task.id, error));
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return queue.stats();
  }

  /**
   * Terminate all agents
   */
  async terminateAll() {
    console.log(chalk.yellow('\n🔚 Terminating all agents...'));

    // Get root agents
    const rootAgents = [];
    for (const [id, parent] of this.agentHierarchy) {
      if (!parent) {
        rootAgents.push(id);
      }
    }

    // Terminate from roots (will cascade)
    for (const id of rootAgents) {
      await this.terminateAgent(id, true);
    }

    console.log(chalk.red(`✅ All agents terminated. Total spawned: ${this.stats.totalSpawned}`));
  }
}

// Singleton instance
let instance;

module.exports = {
  AgentFactory,
  getInstance: () => {
    if (!instance) {
      instance = new AgentFactory();
    }
    return instance;
  }
};