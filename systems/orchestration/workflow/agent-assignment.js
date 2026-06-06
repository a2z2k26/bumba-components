/**
 * Sprint 16: Agent Assignment Logic
 * Maps workflow agents to factory roles
 * Implements capability-based assignment and dynamic spawning
 */

const EventEmitter = require('events');
const chalk = require('chalk');

class AgentAssignment extends EventEmitter {
  constructor() {
    super();

    // Assignment mappings
    this.roleCapabilities = new Map();
    this.agentPool = new Map();
    this.assignments = new Map();
    this.workloadTracking = new Map();

    // Statistics
    this.stats = {
      totalAssignments: 0,
      capabilityMatches: 0,
      fallbackAssignments: 0,
      poolReuses: 0,
      newSpawns: 0
    };

    // Configuration
    this.config = {
      enablePooling: true,
      maxPoolSize: 20,
      loadBalancing: 'round-robin',
      assignmentStrategy: 'capability-based'
    };

    this.initialize();
  }

  /**
   * Initialize agent assignment
   */
  initialize() {
    // Setup default role capabilities
    this.setupDefaultCapabilities();

    console.log(chalk.blue(' Agent Assignment system initialized'));
  }

  /**
   * Setup default role capabilities
   */
  setupDefaultCapabilities() {
    // Default capability mappings
    this.roleCapabilities.set('specialist', [
      'task-execution',
      'data-processing',
      'analysis',
      'reporting'
    ]);

    this.roleCapabilities.set('coordinator', [
      'workflow-management',
      'agent-coordination',
      'task-distribution',
      'resource-allocation'
    ]);

    this.roleCapabilities.set('validator', [
      'quality-check',
      'data-validation',
      'result-verification',
      'compliance-check'
    ]);

    this.roleCapabilities.set('analyzer', [
      'data-analysis',
      'pattern-recognition',
      'trend-analysis',
      'statistical-processing'
    ]);

    this.roleCapabilities.set('transformer', [
      'data-transformation',
      'format-conversion',
      'schema-mapping',
      'data-cleaning'
    ]);

    this.roleCapabilities.set('researcher', [
      'information-gathering',
      'web-search',
      'document-analysis',
      'knowledge-extraction'
    ]);

    this.roleCapabilities.set('builder', [
      'code-generation',
      'template-processing',
      'artifact-creation',
      'system-building'
    ]);

    this.roleCapabilities.set('tester', [
      'test-execution',
      'validation',
      'regression-testing',
      'performance-testing'
    ]);

    this.roleCapabilities.set('monitor', [
      'system-monitoring',
      'health-check',
      'metric-collection',
      'alert-management'
    ]);

    this.roleCapabilities.set('orchestrator', [
      'workflow-orchestration',
      'process-management',
      'scheduling',
      'dependency-resolution'
    ]);
  }

  /**
   * Assign agent to task based on requirements
   */
  async assignAgent(taskRequirements, workflowConfig = {}) {
    try {
      const assignment = {
        taskId: taskRequirements.id || `task_${Date.now()}`,
        timestamp: Date.now()
      };

      // Determine assignment strategy
      const strategy = workflowConfig.assignment?.strategy ||
                      this.config.assignmentStrategy;

      let agent = null;

      switch (strategy) {
        case 'capability-based':
          agent = await this.capabilityBasedAssignment(taskRequirements, workflowConfig);
          break;

        case 'role-based':
          agent = await this.roleBasedAssignment(taskRequirements, workflowConfig);
          break;

        case 'load-balanced':
          agent = await this.loadBalancedAssignment(taskRequirements, workflowConfig);
          break;

        case 'round-robin':
          agent = await this.roundRobinAssignment(taskRequirements, workflowConfig);
          break;

        default:
          agent = await this.defaultAssignment(taskRequirements, workflowConfig);
      }

      // Track assignment
      assignment.agentId = agent.id;
      assignment.agentRole = agent.role;
      assignment.strategy = strategy;

      this.assignments.set(assignment.taskId, assignment);
      this.stats.totalAssignments++;

      // Emit assignment event
      this.emit('agent:assigned', assignment);

      console.log(chalk.green(` Assigned ${agent.role} to task ${assignment.taskId}`));

      return agent;

    } catch (error) {
      console.error(chalk.red(' Agent assignment failed:'), error.message);
      throw error;
    }
  }

  /**
   * Capability-based assignment
   */
  async capabilityBasedAssignment(requirements, config) {
    const requiredCapabilities = requirements.capabilities || [];
    const preferredRole = requirements.role || requirements.agent;

    // Check if we can reuse from pool
    if (this.config.enablePooling && config.spawning?.reuseAgents !== false) {
      const poolAgent = this.findInPool(requiredCapabilities, preferredRole);
      if (poolAgent) {
        this.stats.poolReuses++;
        console.log(chalk.gray(` Reusing ${poolAgent.role} from pool`));
        return poolAgent;
      }
    }

    // Find best matching role based on capabilities
    const bestRole = this.findBestRoleMatch(requiredCapabilities, preferredRole);

    if (bestRole) {
      this.stats.capabilityMatches++;
      return await this.spawnAgentWithRole(bestRole, requirements, config);
    }

    // Fallback to default role
    const fallbackRoles = config.assignment?.fallbackRoles || ['specialist'];
    this.stats.fallbackAssignments++;

    return await this.spawnAgentWithRole(fallbackRoles[0], requirements, config);
  }

  /**
   * Role-based assignment
   */
  async roleBasedAssignment(requirements, config) {
    const requestedRole = requirements.role || requirements.agent || 'specialist';

    // Check pool first
    if (this.config.enablePooling) {
      const poolAgent = this.findInPoolByRole(requestedRole);
      if (poolAgent) {
        this.stats.poolReuses++;
        return poolAgent;
      }
    }

    return await this.spawnAgentWithRole(requestedRole, requirements, config);
  }

  /**
   * Load-balanced assignment
   */
  async loadBalancedAssignment(requirements, config) {
    // Find agent with lowest workload
    let lowestLoad = Infinity;
    let bestAgent = null;

    for (const [agentId, agent] of this.agentPool) {
      const load = this.workloadTracking.get(agentId) || 0;
      if (load < lowestLoad && this.agentMatchesRequirements(agent, requirements)) {
        lowestLoad = load;
        bestAgent = agent;
      }
    }

    if (bestAgent) {
      // Update workload
      this.workloadTracking.set(bestAgent.id, lowestLoad + 1);
      this.stats.poolReuses++;
      return bestAgent;
    }

    // Spawn new if no suitable agent found
    return await this.spawnAgentWithRole(
      requirements.role || 'specialist',
      requirements,
      config
    );
  }

  /**
   * Round-robin assignment
   */
  async roundRobinAssignment(requirements, config) {
    const eligibleAgents = Array.from(this.agentPool.values())
      .filter(agent => this.agentMatchesRequirements(agent, requirements));

    if (eligibleAgents.length > 0) {
      // Get next agent in rotation
      if (!this.roundRobinIndex) this.roundRobinIndex = 0;
      const agent = eligibleAgents[this.roundRobinIndex % eligibleAgents.length];
      this.roundRobinIndex++;
      this.stats.poolReuses++;
      return agent;
    }

    // Spawn new if no suitable agent
    return await this.spawnAgentWithRole(
      requirements.role || 'specialist',
      requirements,
      config
    );
  }

  /**
   * Default assignment (fallback)
   */
  async defaultAssignment(requirements, config) {
    // Try to match by role first
    const requestedRole = requirements.role || requirements.agent;

    if (requestedRole) {
      const poolAgent = this.findInPoolByRole(requestedRole);
      if (poolAgent) {
        this.stats.poolReuses++;
        return poolAgent;
      }
    }

    // Spawn new agent
    return await this.spawnAgentWithRole(
      requestedRole || 'specialist',
      requirements,
      config
    );
  }

  /**
   * Find agent in pool by capabilities
   */
  findInPool(requiredCapabilities, preferredRole) {
    for (const [agentId, agent] of this.agentPool) {
      // Check role preference first
      if (preferredRole && agent.role === preferredRole) {
        if (this.hasCapabilities(agent, requiredCapabilities)) {
          return agent;
        }
      }
    }

    // Check any agent with capabilities
    for (const [agentId, agent] of this.agentPool) {
      if (this.hasCapabilities(agent, requiredCapabilities)) {
        return agent;
      }
    }

    return null;
  }

  /**
   * Find agent in pool by role
   */
  findInPoolByRole(role) {
    for (const [agentId, agent] of this.agentPool) {
      if (agent.role === role && this.isAgentAvailable(agent)) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Check if agent has required capabilities
   */
  hasCapabilities(agent, requiredCapabilities) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return true;
    }

    const agentCapabilities = agent.capabilities ||
                            this.roleCapabilities.get(agent.role) || [];

    return requiredCapabilities.every(cap => agentCapabilities.includes(cap));
  }

  /**
   * Check if agent matches requirements
   */
  agentMatchesRequirements(agent, requirements) {
    // Check role match
    if (requirements.role && agent.role !== requirements.role) {
      return false;
    }

    // Check capabilities
    if (requirements.capabilities) {
      if (!this.hasCapabilities(agent, requirements.capabilities)) {
        return false;
      }
    }

    // Check availability
    return this.isAgentAvailable(agent);
  }

  /**
   * Check if agent is available
   */
  isAgentAvailable(agent) {
    // Check workload
    const workload = this.workloadTracking.get(agent.id) || 0;
    const maxTasks = agent.maxTasks || 5;

    return workload < maxTasks && agent.status === 'active';
  }

  /**
   * Find best role match based on capabilities
   */
  findBestRoleMatch(requiredCapabilities, preferredRole) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return preferredRole || 'specialist';
    }

    let bestMatch = null;
    let bestScore = 0;

    // Check preferred role first
    if (preferredRole) {
      const roleCapabilities = this.roleCapabilities.get(preferredRole) || [];
      const score = this.calculateCapabilityScore(roleCapabilities, requiredCapabilities);
      if (score > 0) {
        return preferredRole;
      }
    }

    // Find best matching role
    for (const [role, capabilities] of this.roleCapabilities) {
      const score = this.calculateCapabilityScore(capabilities, requiredCapabilities);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = role;
      }
    }

    return bestMatch;
  }

  /**
   * Calculate capability matching score
   */
  calculateCapabilityScore(roleCapabilities, requiredCapabilities) {
    let matches = 0;
    for (const required of requiredCapabilities) {
      if (roleCapabilities.includes(required)) {
        matches++;
      }
    }
    return matches / requiredCapabilities.length;
  }

  /**
   * Spawn agent with specific role
   */
  async spawnAgentWithRole(role, requirements, config) {
    // Create agent config
    const agentConfig = {
      role,
      type: requirements.type || config.agentTypes?.[role]?.type || 'specialist',
      capabilities: this.roleCapabilities.get(role) || [],
      maxTasks: config.agentTypes?.[role]?.maxTasks || 5,
      timeout: config.agentTypes?.[role]?.timeout || 30000,
      status: 'active'
    };

    // Simulate agent spawn (would integrate with AgentFactory)
    const agent = {
      id: `agent_${role}_${Date.now()}`,
      ...agentConfig,
      spawnedAt: Date.now()
    };

    // Add to pool if pooling enabled
    if (this.config.enablePooling && this.agentPool.size < this.config.maxPoolSize) {
      this.agentPool.set(agent.id, agent);
    }

    // Initialize workload tracking
    this.workloadTracking.set(agent.id, 1);

    this.stats.newSpawns++;

    console.log(chalk.cyan(` Spawned new ${role} agent: ${agent.id}`));

    this.emit('agent:spawned', agent);

    return agent;
  }

  /**
   * Release agent assignment
   */
  releaseAgent(agentId, taskId) {
    // Update workload
    const currentLoad = this.workloadTracking.get(agentId) || 0;
    if (currentLoad > 0) {
      this.workloadTracking.set(agentId, currentLoad - 1);
    }

    // Remove assignment
    this.assignments.delete(taskId);

    console.log(chalk.gray(` Released agent ${agentId} from task ${taskId}`));

    this.emit('agent:released', { agentId, taskId });
  }

  /**
   * Update role capabilities
   */
  updateRoleCapabilities(role, capabilities) {
    this.roleCapabilities.set(role, capabilities);

    console.log(chalk.blue(` Updated capabilities for role: ${role}`));

    this.emit('capabilities:updated', { role, capabilities });
  }

  /**
   * Add custom role
   */
  addCustomRole(role, capabilities) {
    if (this.roleCapabilities.has(role)) {
      console.warn(chalk.yellow(` Role ${role} already exists, updating...`));
    }

    this.roleCapabilities.set(role, capabilities);

    console.log(chalk.green(` Added custom role: ${role}`));

    this.emit('role:added', { role, capabilities });
  }

  /**
   * Get agent workload
   */
  getAgentWorkload(agentId) {
    return this.workloadTracking.get(agentId) || 0;
  }

  /**
   * Get pool status
   */
  getPoolStatus() {
    const status = {
      poolSize: this.agentPool.size,
      maxPoolSize: this.config.maxPoolSize,
      agents: []
    };

    for (const [agentId, agent] of this.agentPool) {
      status.agents.push({
        id: agentId,
        role: agent.role,
        workload: this.workloadTracking.get(agentId) || 0,
        maxTasks: agent.maxTasks,
        status: agent.status
      });
    }

    return status;
  }

  /**
   * Get assignment statistics
   */
  getStats() {
    return {
      ...this.stats,
      poolSize: this.agentPool.size,
      activeAssignments: this.assignments.size,
      totalWorkload: Array.from(this.workloadTracking.values())
        .reduce((sum, load) => sum + load, 0),
      poolUtilization: this.agentPool.size > 0
        ? (Array.from(this.workloadTracking.values())
            .reduce((sum, load) => sum + load, 0) /
           (this.agentPool.size * 5) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear assignment state
   */
  clear() {
    this.agentPool.clear();
    this.assignments.clear();
    this.workloadTracking.clear();

    this.stats = {
      totalAssignments: 0,
      capabilityMatches: 0,
      fallbackAssignments: 0,
      poolReuses: 0,
      newSpawns: 0
    };

    this.roundRobinIndex = 0;

    console.log(chalk.yellow(' Agent assignment state cleared'));
  }
}

// Export singleton
let instance;

module.exports = {
  AgentAssignment,
  getInstance: () => {
    if (!instance) {
      instance = new AgentAssignment();
    }
    return instance;
  }
};