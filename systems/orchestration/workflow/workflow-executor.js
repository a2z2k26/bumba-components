/**
 * Sprint 15: Workflow Executor Core
 * Bridge between WorkflowEngine and AgentFactory
 * Implements step-to-task mapping and execution context
 */

const EventEmitter = require('events');
const chalk = require('chalk');

class WorkflowExecutor extends EventEmitter {
  constructor() {
    super();

    // Core components
    this.agentFactory = null;
    this.communicationHub = null;
    this.taskRouter = null;
    this.errorHandler = null;

    // Execution state
    this.activeWorkflows = new Map();
    this.executionContexts = new Map();
    this.agentMappings = new Map();

    // Statistics
    this.stats = {
      workflowsExecuted: 0,
      stepsExecuted: 0,
      agentsSpawned: 0,
      tasksMapped: 0,
      errors: 0
    };

    // Configuration
    this.config = {
      maxConcurrentWorkflows: 10,
      defaultTimeout: 300000, // 5 minutes
      enableMetrics: true,
      enableLogging: true
    };

    this.initialize();
  }

  /**
   * Initialize the executor
   */
  initialize() {
    // Get singleton instances
    this.agentFactory = getAgentFactory();
    this.communicationHub = getHub();
    this.taskRouter = new TaskRouter();
    this.errorHandler = new ErrorHandler();

    // Setup event handlers
    this.setupEventHandlers();

    console.log(chalk.blue(' Workflow Executor initialized'));
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Agent Factory events
    this.agentFactory.on('agent:spawned', (agent) => {
      this.handleAgentSpawned(agent);
    });

    this.agentFactory.on('task:complete', (result) => {
      this.handleTaskComplete(result);
    });

    // Communication Hub events
    this.communicationHub.on('hub:message-received', (data) => {
      this.handleMessageReceived(data);
    });

    // Error Handler events
    this.errorHandler.on('error:recovered', (data) => {
      this.handleErrorRecovered(data);
    });
  }

  /**
   * Alias for executeWorkflow method
   */
  async execute(workflow, options = {}) {
    return this.executeWorkflow(workflow, options);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflow, options = {}) {
    const workflowId = workflow.id || `workflow_${Date.now()}`;

    try {
      // Check concurrent limit
      if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
        throw new Error('Maximum concurrent workflows reached');
      }

      // Create execution context
      const context = this.createExecutionContext(workflow, options);
      this.executionContexts.set(workflowId, context);

      // Mark workflow as active
      this.activeWorkflows.set(workflowId, {
        workflow,
        context,
        status: 'running',
        startTime: Date.now()
      });

      console.log(chalk.green(`▶ Starting workflow: ${workflow.name}`));

      // Pre-spawn agents if configured
      await this.preSpawnAgents(workflow, context);

      // Execute workflow steps
      const result = await this.executeSteps(workflow, context);

      // Cleanup
      await this.cleanupWorkflow(workflowId);

      this.stats.workflowsExecuted++;

      console.log(chalk.green(` Workflow completed: ${workflow.name}`));

      return result;

    } catch (error) {
      this.stats.errors++;
      await this.handleWorkflowError(workflowId, error);
      throw error;
    }
  }

  /**
   * Create execution context
   */
  createExecutionContext(workflow, options) {
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      startTime: Date.now(),
      variables: { ...workflow.execution?.context?.variables, ...options.variables },
      state: {},
      agents: new Map(),
      messages: [],
      metrics: {
        stepsExecuted: 0,
        tasksExecuted: 0,
        messagesExchanged: 0
      },
      config: {
        ...workflow.config,
        ...workflow.agentFactory,
        ...workflow.communication,
        ...options
      }
    };
  }

  /**
   * Pre-spawn agents based on workflow config
   */
  async preSpawnAgents(workflow, context) {
    const preSpawnList = workflow.agentFactory?.spawning?.preSpawn || [];

    for (const agentConfig of preSpawnList) {
      try {
        const agent = await this.agentFactory.spawnAgent({
          type: agentConfig.type || 'specialist',
          role: agentConfig.role,
          task: { title: `Pre-spawned for ${workflow.name}` }
        });

        // Register with communication hub
        this.communicationHub.registerAgent(agent.id, {
          role: agent.role,
          type: agent.type,
          workflowId: context.workflowId
        });

        // Store in context
        context.agents.set(agent.role, agent);
        this.stats.agentsSpawned++;

        console.log(chalk.cyan(` Pre-spawned agent: ${agent.role}`));

      } catch (error) {
        console.error(chalk.red(`Failed to pre-spawn agent: ${agentConfig.role}`));
      }
    }
  }

  /**
   * Execute workflow steps
   */
  async executeSteps(workflow, context) {
    const steps = workflow.steps || [];
    const results = [];

    for (const step of steps) {
      try {
        console.log(chalk.blue(` Executing step: ${step.name}`));

        // Update context metrics
        context.metrics.stepsExecuted++;
        this.stats.stepsExecuted++;

        // Execute based on step type
        let result;
        switch (step.type) {
          case 'parallel':
            result = await this.executeParallelSteps(step, context);
            break;

          case 'iterative':
          case 'loop':
            result = await this.executeIterativeStep(step, context);
            break;

          case 'condition':
            result = await this.executeConditionalStep(step, context);
            break;

          case 'task':
          default:
            result = await this.executeTaskStep(step, context);
            break;
        }

        results.push({
          stepId: step.id,
          stepName: step.name,
          result
        });

        // Update context state
        if (step.outputs) {
          this.updateContextState(context, step.outputs, result);
        }

        // Emit step complete event
        this.emit('step:complete', {
          workflowId: context.workflowId,
          step,
          result
        });

      } catch (error) {
        // Handle step error
        const recovered = await this.handleStepError(step, context, error);
        if (!recovered) throw error;
      }
    }

    return results;
  }

  /**
   * Execute task step (maps to Agent Factory)
   */
  async executeTaskStep(step, context) {
    // Map step to task
    const task = this.mapStepToTask(step, context);
    this.stats.tasksMapped++;

    // Determine agent assignment
    let agent = null;

    // Check if agent should be reused
    if (step.agentConfig?.reuse && context.agents.has(step.agentConfig.role)) {
      agent = context.agents.get(step.agentConfig.role);
      console.log(chalk.gray(` Reusing agent: ${agent.role}`));
    } else if (step.agentConfig?.spawn !== false) {
      // Spawn new agent
      agent = await this.agentFactory.spawnAgent({
        type: step.agentConfig?.type || 'specialist',
        role: step.agentConfig?.role || step.agent,
        task,
        capabilities: step.agentConfig?.capabilities
      });

      // Register with communication hub
      this.communicationHub.registerAgent(agent.id, {
        role: agent.role,
        type: agent.type,
        workflowId: context.workflowId
      });

      context.agents.set(agent.role, agent);
      this.stats.agentsSpawned++;
      console.log(chalk.cyan(` Spawned agent: ${agent.role}`));
    }

    // Execute task through agent factory
    const result = await this.agentFactory.executeTask({
      ...task,
      agentId: agent?.id
    });

    // Handle communication if configured
    if (step.communication?.broadcast) {
      await this.broadcastStepResult(step, result, context);
    }

    context.metrics.tasksExecuted++;

    return result;
  }

  /**
   * Execute parallel steps
   */
  async executeParallelSteps(step, context) {
    const tracks = step.tracks || step.tasks || [];

    console.log(chalk.magenta(` Executing ${tracks.length} parallel tracks`));

    const promises = tracks.map(track =>
      this.executeTaskStep({
        ...track,
        type: 'task',
        agentConfig: {
          ...track.agentConfig,
          spawn: true // Always spawn for parallel
        }
      }, context)
    );

    return await Promise.all(promises);
  }

  /**
   * Execute iterative step
   */
  async executeIterativeStep(step, context) {
    const maxIterations = step.maxIterations || 10;
    const qualityThreshold = step.qualityThreshold || 0.8;
    const results = [];

    console.log(chalk.yellow(` Starting iterative step (max: ${maxIterations})`));

    for (let i = 0; i < maxIterations; i++) {
      const iterationResult = await this.executeTaskStep({
        ...step,
        type: 'task',
        name: `${step.name}_iteration_${i + 1}`
      }, context);

      results.push(iterationResult);

      // Check termination conditions
      if (this.checkTerminationConditions(step, iterationResult, results)) {
        console.log(chalk.green(` Iteration complete at ${i + 1}`));
        break;
      }

      // Check quality threshold
      if (iterationResult.quality >= qualityThreshold) {
        console.log(chalk.green(` Quality threshold met at iteration ${i + 1}`));
        break;
      }
    }

    return results;
  }

  /**
   * Execute conditional step
   */
  async executeConditionalStep(step, context) {
    const condition = this.evaluateCondition(step.condition, context);

    console.log(chalk.yellow(` Condition evaluated: ${condition}`));

    if (condition) {
      if (step.ifTrue) {
        return await this.executeTaskStep({
          ...step.ifTrue,
          type: 'task',
          name: `${step.name}_true`
        }, context);
      }
    } else {
      if (step.ifFalse) {
        return await this.executeTaskStep({
          ...step.ifFalse,
          type: 'task',
          name: `${step.name}_false`
        }, context);
      }
    }

    return null;
  }

  /**
   * Map step to task format
   */
  mapStepToTask(step, context) {
    return {
      id: `${context.workflowId}_${step.id}`,
      title: step.name,
      description: step.description,
      type: this.taskRouter.determineTaskType(step),
      agent: step.agent,
      agentRole: step.agentConfig?.role,
      agentType: step.agentConfig?.type,
      priority: step.priority || 'normal',
      inputs: this.resolveInputs(step.inputs, context),
      metadata: {
        workflowId: context.workflowId,
        stepId: step.id,
        stepType: step.type
      }
    };
  }

  /**
   * Resolve step inputs from context
   */
  resolveInputs(inputs, context) {
    if (!inputs) return {};

    const resolved = {};
    for (const [key, value] of Object.entries(inputs)) {
      // Check if value is a variable reference
      if (typeof value === 'string' && value.startsWith('$')) {
        const varName = value.substring(1);
        resolved[key] = context.variables[varName] || context.state[varName] || value;
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Update context state with outputs
   */
  updateContextState(context, outputs, result) {
    if (Array.isArray(outputs)) {
      outputs.forEach(output => {
        if (typeof output === 'string') {
          context.state[output] = result;
        } else if (output.name && output.path) {
          context.state[output.name] = this.extractPath(result, output.path);
        }
      });
    }
  }

  /**
   * Extract value from result using path
   */
  extractPath(obj, path) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Broadcast step result
   */
  async broadcastStepResult(step, result, context) {
    const agent = context.agents.get(step.agentConfig?.role);
    if (!agent) return;

    await this.communicationHub.broadcast(
      agent.id,
      'step.complete',
      {
        stepId: step.id,
        stepName: step.name,
        result,
        workflowId: context.workflowId
      },
      step.communication?.targets
    );

    context.metrics.messagesExchanged++;
  }

  /**
   * Check termination conditions
   */
  checkTerminationConditions(step, currentResult, allResults) {
    if (!step.terminationConditions) return false;

    for (const condition of step.terminationConditions) {
      if (condition.type === 'convergence') {
        // Check if results are converging
        if (allResults.length >= 2) {
          const prev = allResults[allResults.length - 2];
          const curr = allResults[allResults.length - 1];
          if (JSON.stringify(prev) === JSON.stringify(curr)) {
            return true;
          }
        }
      } else if (condition.type === 'threshold') {
        if (currentResult[condition.field] >= condition.value) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Evaluate condition
   */
  evaluateCondition(condition, context) {
    if (typeof condition === 'boolean') return condition;
    if (typeof condition === 'string') {
      // Simple variable check
      return !!context.state[condition];
    }
    if (typeof condition === 'object') {
      // Complex condition evaluation
      // This could be expanded with a proper expression evaluator
      return true;
    }
    return false;
  }

  /**
   * Handle step error
   */
  async handleStepError(step, context, error) {
    console.error(chalk.red(` Step error: ${step.name}`), error.message);

    // Try error recovery
    const strategy = this.errorHandler.determineStrategy(error);
    const recovered = await this.errorHandler.handleError(error, {
      context: 'workflow_step',
      step,
      workflowId: context.workflowId
    }, strategy);

    return recovered;
  }

  /**
   * Handle workflow error
   */
  async handleWorkflowError(workflowId, error) {
    console.error(chalk.red(` Workflow error: ${workflowId}`), error.message);

    // Clean up workflow
    await this.cleanupWorkflow(workflowId);

    this.emit('workflow:error', {
      workflowId,
      error
    });
  }

  /**
   * Cleanup workflow
   */
  async cleanupWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    const context = this.executionContexts.get(workflowId);

    if (context && workflow?.workflow?.agentFactory?.spawning?.cleanupOnComplete) {
      // Terminate spawned agents
      for (const [role, agent] of context.agents) {
        try {
          this.communicationHub.unregisterAgent(agent.id);
          await this.agentFactory.terminateAgent(agent.id);
          console.log(chalk.gray(` Cleaned up agent: ${role}`));
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }

    // Remove from tracking
    this.activeWorkflows.delete(workflowId);
    this.executionContexts.delete(workflowId);
  }

  /**
   * Handle agent spawned event
   */
  handleAgentSpawned(agent) {
    this.emit('executor:agent-spawned', agent);
  }

  /**
   * Handle task complete event
   */
  handleTaskComplete(result) {
    this.emit('executor:task-complete', result);
  }

  /**
   * Handle message received event
   */
  handleMessageReceived(data) {
    // Route to appropriate workflow context
    const context = Array.from(this.executionContexts.values())
      .find(ctx => ctx.agents.has(data.agentId));

    if (context) {
      context.messages.push(data);
      context.metrics.messagesExchanged++;
    }
  }

  /**
   * Handle error recovered event
   */
  handleErrorRecovered(data) {
    this.emit('executor:error-recovered', data);
  }

  /**
   * Register workflow agent (Sprint 19: Department Manager support)
   */
  registerWorkflowAgent(agentProfile) {
    if (!agentProfile.id || !agentProfile.executor) {
      throw new Error('Agent profile must have id and executor');
    }

    this.agentMappings.set(agentProfile.id, agentProfile);

    console.log(chalk.green(` Registered workflow agent: ${agentProfile.name}`));

    this.emit('agent:registered', agentProfile);

    return agentProfile.id;
  }

  /**
   * Get executor statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeWorkflows: this.activeWorkflows.size,
      executionContexts: this.executionContexts.size,
      agentMappings: this.agentMappings.size
    };
  }

  /**
   * Clear executor state
   */
  async clear() {
    // Cleanup all active workflows
    for (const workflowId of this.activeWorkflows.keys()) {
      await this.cleanupWorkflow(workflowId);
    }

    this.activeWorkflows.clear();
    this.executionContexts.clear();
    this.agentMappings.clear();

    this.stats = {
      workflowsExecuted: 0,
      stepsExecuted: 0,
      agentsSpawned: 0,
      tasksMapped: 0,
      errors: 0
    };
  }
}

// Export singleton
let instance;

module.exports = {
  WorkflowExecutor,
  getInstance: () => {
    if (!instance) {
      instance = new WorkflowExecutor();
    }
    return instance;
  }
};