/**
 * BUMBA Orchestration System - Unified Export Interface
 * Multi-agent workflow orchestration and task management
 * @module orchestration
 */

const { logger } = require('@bumba/shared');

// Helper to safely load a module
function safeRequire(path, name) {
  try {
    return require(path);
  } catch (e) {
    logger.debug(`[Orchestration] Optional module ${name} not loaded:`, e.message);
    return null;
  }
}

// Workflow components
const workflowPath = './workflow';
const workflow = {
  get PipelineManager() { return safeRequire(`${workflowPath}/pipeline-manager`, 'pipeline-manager'); },
  get PipelineOrchestrator() { return safeRequire(`${workflowPath}/pipeline-orchestrator`, 'pipeline-orchestrator'); },
  get PipelineScheduler() { return safeRequire(`${workflowPath}/pipeline-scheduler`, 'pipeline-scheduler'); },
  get LoopController() { return safeRequire(`${workflowPath}/loop-controller`, 'loop-controller'); },
  get AgentAssignment() { return safeRequire(`${workflowPath}/agent-assignment`, 'agent-assignment'); },
  get SafeExpressionEvaluator() { return safeRequire(`${workflowPath}/safe-expression-evaluator`, 'safe-eval'); },
};

// Orchestration components
const orchPath = './orchestration';
const orchestration = {
  get DependencyManager() { return safeRequire(`${orchPath}/dependency-manager`, 'dependency-manager'); },
  get AgentTaskSystem() { return safeRequire(`${orchPath}/agent-task-system`, 'agent-task'); },
  get ConsolidationStrategies() { return safeRequire(`${orchPath}/consolidation-strategies`, 'consolidation'); },
  get EnhancedCoordination() { return safeRequire(`${orchPath}/enhanced-coordination-capabilities`, 'enhanced-coord'); },
  get GitOperations() { return safeRequire(`${orchPath}/git-operations`, 'git-ops'); },
  get NotionClient() { return safeRequire(`${orchPath}/notion-client`, 'notion'); },
};

// Main Orchestrator class
class WorkflowOrchestrator {
  constructor(config = {}) {
    this.config = config;
    this.pipelines = new Map();
    this.agents = new Map();
    logger.info('Workflow Orchestrator initialized');
  }

  async initialize() {
    // Initialize pipeline manager if available
    const PipelineManager = workflow.PipelineManager;
    if (PipelineManager) {
      this.pipelineManager = new PipelineManager(this.config.pipelines || {});
    }
    return this;
  }

  async registerAgent(agentId, agentConfig) {
    this.agents.set(agentId, agentConfig);
    logger.info(`Agent ${agentId} registered`);
  }

  async createPipeline(pipelineId, steps) {
    this.pipelines.set(pipelineId, { id: pipelineId, steps, status: 'pending' });
    return this.pipelines.get(pipelineId);
  }

  async executePipeline(pipelineId) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    pipeline.status = 'running';
    // Execute steps...
    pipeline.status = 'completed';
    return pipeline;
  }

  getStatus() {
    return {
      pipelines: this.pipelines.size,
      agents: this.agents.size,
    };
  }
}

module.exports = {
  // Main orchestrator
  WorkflowOrchestrator,

  // Workflow components
  ...workflow,

  // Orchestration components
  ...orchestration,

  // Factory function
  createOrchestrator: (config) => new WorkflowOrchestrator(config),
};
