/**
 * BUMBA Workflow YAML Parser
 * Parses YAML workflow templates into executable workflow objects
 */

const yaml = require('js-yaml');
const fs = require('fs').promises;
const path = require('path');

class WorkflowYamlParser {
  constructor() {
    this.schemaVersion = '1.0.0';
    this.supportedVersions = ['1.0.0', '1.0'];
  }

  /**
   * Parse YAML content into workflow object
   */
  parse(yamlContent) {
    try {
      const parsed = yaml.load(yamlContent);

      if (!parsed) {
        throw new Error('Empty YAML content');
      }

      // Validate version if present
      if (parsed.version && !this.supportedVersions.includes(parsed.version)) {
        logger.warn(`Unsupported workflow version: ${parsed.version}`);
      }

      return this.normalizeWorkflow(parsed);
    } catch (error) {
      logger.error('Failed to parse YAML:', error);
      throw new Error(`YAML parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse YAML file
   */
  async parseFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const workflow = this.parse(content);

      // Add file metadata
      workflow.metadata = workflow.metadata || {};
      workflow.metadata.sourceFile = filePath;
      workflow.metadata.fileName = path.basename(filePath);

      return workflow;
    } catch (error) {
      logger.error(`Failed to parse YAML file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Normalize workflow structure
   */
  normalizeWorkflow(workflow) {
    // Ensure required fields
    const normalized = {
      id: workflow.id || workflow.name,
      name: workflow.name || 'Unnamed Workflow',
      description: workflow.description || '',
      version: workflow.version || '1.0.0',
      agents: workflow.agents || [],
      steps: this.normalizeSteps(workflow),
      config: this.normalizeConfig(workflow),
      metadata: workflow.metadata || {},
      triggers: workflow.triggers || [],
      conditions: workflow.conditions || {},
      qualityGates: workflow.qualityGates || [],
      loopControl: workflow.loopControl || {},
      // Sprint 14: Agent Factory directives
      agentFactory: this.normalizeAgentFactory(workflow),
      // Sprint 14: Communication patterns
      communication: this.normalizeCommunication(workflow),
      // Sprint 14: Execution metadata
      execution: this.normalizeExecution(workflow)
    };

    return normalized;
  }

  /**
   * Normalize steps from various formats
   */
  normalizeSteps(workflow) {
    let steps = [];

    // Handle different step definitions
    if (workflow.steps) {
      steps = workflow.steps;
    } else if (workflow.execution) {
      steps = this.parseExecutionSection(workflow.execution);
    } else if (workflow.phases) {
      steps = this.parsePhasesSection(workflow.phases);
    } else if (workflow.parallelTracks) {
      steps = this.parseParallelTracks(workflow.parallelTracks);
    }

    // Normalize each step
    return steps.map((step, index) => this.normalizeStep(step, index));
  }

  /**
   * Parse execution section into steps
   */
  parseExecutionSection(execution) {
    const steps = [];

    for (const [key, value] of Object.entries(execution)) {
      if (typeof value === 'object') {
        steps.push({
          name: key,
          ...value
        });
      }
    }

    return steps;
  }

  /**
   * Parse phases into steps
   */
  parsePhasesSection(phases) {
    return phases.map(phase => {
      if (typeof phase === 'string') {
        return { name: phase, type: 'phase' };
      }
      return phase;
    });
  }

  /**
   * Parse parallel tracks into steps
   */
  parseParallelTracks(tracks) {
    return [{
      name: 'parallel_execution',
      type: 'parallel',
      tracks: tracks.map(track => {
        if (typeof track === 'string') {
          return { name: track };
        }
        return track;
      })
    }];
  }

  /**
   * Normalize individual step
   */
  normalizeStep(step, index) {
    const normalized = {
      id: step.id || `step_${index + 1}`,
      name: step.name || `Step ${index + 1}`,
      type: step.type || 'task',
      description: step.description || ''
    };

    // Handle different step types
    switch (normalized.type) {
      case 'iterative':
      case 'loop':
        normalized.maxIterations = step.maxIterations || step.max_iterations || 10;
        normalized.qualityThreshold = step.qualityThreshold || step.quality_threshold || 0.8;
        normalized.terminationConditions = step.terminationConditions || step.termination || [];
        normalized.successCriteria = step.successCriteria || step.success_criteria;
        break;

      case 'parallel':
        normalized.tasks = step.tasks || [];
        normalized.tracks = step.tracks || [];
        break;

      case 'condition':
        normalized.condition = step.condition || step.if;
        normalized.ifTrue = step.ifTrue || step.then;
        normalized.ifFalse = step.ifFalse || step.else;
        break;

      case 'task':
      default:
        normalized.agent = step.agent;
        normalized.task = step.task || {};
        normalized.inputs = step.inputs || {};
        normalized.outputs = step.outputs || [];
        // Sprint 14: Agent Factory directives per step
        normalized.agentConfig = {
          role: step.agentRole || step.role || normalized.agent,
          type: step.agentType || step.type || 'specialist',
          capabilities: step.capabilities || [],
          spawn: step.spawn !== false,
          reuse: step.reuse || false,
          exclusive: step.exclusive || false
        };
        // Sprint 14: Communication config per step
        normalized.communication = {
          broadcast: step.broadcast || false,
          targets: step.targets || [],
          awaitResponse: step.awaitResponse !== false,
          timeout: step.timeout || 30000
        };
        break;
    }

    // Copy additional properties
    Object.keys(step).forEach(key => {
      if (!normalized[key]) {
        normalized[key] = step[key];
      }
    });

    return normalized;
  }

  /**
   * Normalize configuration
   */
  normalizeConfig(workflow) {
    const config = workflow.config || {};

    return {
      executionMode: config.executionMode || config.execution_mode || 'sequential',
      parallel: config.parallel || false,
      timeout: config.timeout || 3600000,
      retries: config.retries || 3,
      errorHandling: config.errorHandling || config.error_handling || 'stop',
      continuous: workflow.continuous || false,
      scheduled: workflow.scheduled || false,
      ...config
    };
  }

  /**
   * Sprint 14: Normalize Agent Factory directives
   */
  normalizeAgentFactory(workflow) {
    const factory = workflow.agentFactory || workflow.factory || {};

    return {
      // Agent spawning configuration
      spawning: {
        mode: factory.spawning?.mode || factory.mode || 'on-demand',
        preSpawn: factory.spawning?.preSpawn || factory.preSpawn || [],
        maxConcurrent: factory.spawning?.maxConcurrent || factory.maxConcurrent || 10,
        reuseAgents: factory.spawning?.reuseAgents !== false,
        cleanupOnComplete: factory.spawning?.cleanupOnComplete !== false
      },

      // Agent assignment rules
      assignment: {
        strategy: factory.assignment?.strategy || factory.strategy || 'capability-based',
        preferredAgents: factory.assignment?.preferredAgents || factory.preferred || {},
        fallbackRoles: factory.assignment?.fallbackRoles || factory.fallback || ['specialist'],
        loadBalancing: factory.assignment?.loadBalancing || factory.balancing || 'round-robin'
      },

      // Agent capabilities mapping
      capabilities: factory.capabilities || {},

      // Agent type definitions
      agentTypes: factory.agentTypes || factory.types || {
        specialist: { maxTasks: 5, timeout: 30000 },
        coordinator: { maxTasks: 10, timeout: 60000 },
        validator: { maxTasks: 3, timeout: 15000 }
      }
    };
  }

  /**
   * Sprint 14: Normalize Communication patterns
   */
  normalizeCommunication(workflow) {
    const comm = workflow.communication || workflow.messaging || {};

    return {
      // Message patterns
      patterns: {
        type: comm.patterns?.type || comm.type || 'request-response',
        broadcast: comm.patterns?.broadcast || comm.broadcast || [],
        pubsub: comm.patterns?.pubsub || comm.pubsub || {},
        direct: comm.patterns?.direct || comm.direct || true
      },

      // Communication channels
      channels: {
        default: comm.channels?.default || comm.defaultChannel || 'workflow',
        custom: comm.channels?.custom || comm.customChannels || [],
        priorities: comm.channels?.priorities || comm.priorities || {
          high: ['error', 'critical'],
          normal: ['info', 'task'],
          low: ['debug', 'trace']
        }
      },

      // Response handling
      responses: {
        timeout: comm.responses?.timeout || comm.timeout || 30000,
        retries: comm.responses?.retries || comm.retries || 3,
        expectResponses: comm.responses?.expectResponses !== false,
        correlationTracking: comm.responses?.correlationTracking !== false
      },

      // Inter-agent communication rules
      interAgent: {
        allowedPaths: comm.interAgent?.allowedPaths || comm.paths || [],
        restrictedPairs: comm.interAgent?.restrictedPairs || comm.restricted || [],
        messageFiltering: comm.interAgent?.messageFiltering || comm.filtering || false
      }
    };
  }

  /**
   * Sprint 14: Normalize Execution metadata
   */
  normalizeExecution(workflow) {
    const exec = workflow.executionMetadata || workflow.execution || {};

    return {
      // Execution context
      context: {
        environment: exec.context?.environment || exec.environment || 'production',
        variables: exec.context?.variables || exec.variables || {},
        secrets: exec.context?.secrets || exec.secrets || [],
        dependencies: exec.context?.dependencies || exec.dependencies || []
      },

      // Execution tracking
      tracking: {
        enableMetrics: exec.tracking?.enableMetrics !== false,
        enableLogging: exec.tracking?.enableLogging !== false,
        logLevel: exec.tracking?.logLevel || exec.logLevel || 'info',
        metricsInterval: exec.tracking?.metricsInterval || 5000,
        trackPerformance: exec.tracking?.trackPerformance !== false
      },

      // Execution hooks
      hooks: {
        beforeStart: exec.hooks?.beforeStart || exec.beforeStart || [],
        afterComplete: exec.hooks?.afterComplete || exec.afterComplete || [],
        onError: exec.hooks?.onError || exec.onError || [],
        onStepComplete: exec.hooks?.onStepComplete || exec.onStepComplete || [],
        onAgentSpawn: exec.hooks?.onAgentSpawn || [],
        onMessage: exec.hooks?.onMessage || []
      },

      // State management
      state: {
        persist: exec.state?.persist || exec.persist || false,
        stateStore: exec.state?.stateStore || exec.stateStore || 'memory',
        checkpoint: exec.state?.checkpoint || exec.checkpoint || false,
        checkpointInterval: exec.state?.checkpointInterval || 60000,
        resumable: exec.state?.resumable || exec.resumable || false
      }
    };
  }

  /**
   * Convert workflow object to YAML
   */
  toYaml(workflow) {
    try {
      return yaml.dump(workflow, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      });
    } catch (error) {
      logger.error('Failed to convert workflow to YAML:', error);
      throw error;
    }
  }

  /**
   * Save workflow to YAML file
   */
  async saveToFile(workflow, filePath) {
    try {
      const yamlContent = this.toYaml(workflow);
      await fs.writeFile(filePath, yamlContent, 'utf8');
      logger.info(`Workflow saved to ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error(`Failed to save workflow to ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Validate workflow structure
   */
  validate(workflow) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!workflow.name) {
      errors.push('Workflow name is required');
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Validate steps
    if (workflow.steps) {
      workflow.steps.forEach((step, index) => {
        if (!step.name) {
          warnings.push(`Step ${index + 1} is missing a name`);
        }

        if (step.type === 'iterative' && !step.maxIterations) {
          warnings.push(`Iterative step ${step.name} missing maxIterations`);
        }

        // Sprint 14: Validate agent factory directives
        if (step.agentConfig) {
          if (step.agentConfig.exclusive && step.agentConfig.reuse) {
            warnings.push(`Step ${step.name}: Cannot have both exclusive and reuse flags`);
          }
        }

        // Sprint 14: Validate communication config
        if (step.communication) {
          if (step.communication.broadcast && step.communication.targets.length > 0) {
            warnings.push(`Step ${step.name}: Broadcast should not have specific targets`);
          }
        }
      });
    }

    // Validate agents if specified
    if (workflow.agents && workflow.agents.length > 0) {
      workflow.steps?.forEach(step => {
        if (step.agent && !workflow.agents.includes(step.agent)) {
          warnings.push(`Step ${step.name} references undefined agent: ${step.agent}`);
        }
      });
    }

    // Sprint 14: Validate Agent Factory settings
    if (workflow.agentFactory) {
      if (workflow.agentFactory.spawning.maxConcurrent < 1) {
        errors.push('Agent Factory maxConcurrent must be at least 1');
      }

      if (workflow.agentFactory.assignment.strategy === 'capability-based' &&
          Object.keys(workflow.agentFactory.capabilities).length === 0) {
        warnings.push('Capability-based assignment requires capabilities mapping');
      }
    }

    // Sprint 14: Validate Communication patterns
    if (workflow.communication) {
      if (!['request-response', 'fire-forget', 'pubsub', 'broadcast'].includes(
        workflow.communication.patterns.type)) {
        warnings.push(`Unknown communication pattern: ${workflow.communication.patterns.type}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = WorkflowYamlParser;
module.exports.YAMLParser = WorkflowYamlParser;