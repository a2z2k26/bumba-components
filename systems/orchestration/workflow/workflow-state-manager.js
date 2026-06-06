/**
 * Sprint 17: Workflow State Manager
 * Tracks workflow execution state, manages step transitions,
 * and handles parallel execution state
 */

const EventEmitter = require('events');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

class WorkflowStateManager extends EventEmitter {
  constructor() {
    super();

    // State storage
    this.workflowStates = new Map();
    this.stepStates = new Map();
    this.parallelExecutions = new Map();
    this.checkpoints = new Map();

    // State transitions
    this.transitions = new Map();
    this.transitionHistory = new Map();

    // Statistics
    this.stats = {
      workflowsTracked: 0,
      stepsCompleted: 0,
      stateTransitions: 0,
      checkpointsSaved: 0,
      statesRestored: 0
    };

    // Configuration
    this.config = {
      persistState: false,
      stateDirectory: './workflow-states',
      checkpointInterval: 60000,
      maxHistorySize: 100,
      enableStateValidation: true
    };

    this.initialize();
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    // Setup valid state transitions
    this.setupStateTransitions();

    // Create state directory if persistence enabled
    if (this.config.persistState) {
      await this.ensureStateDirectory();
    }

    console.log(chalk.blue(' Workflow State Manager initialized'));
  }

  /**
   * Setup valid state transitions
   */
  setupStateTransitions() {
    // Workflow states
    this.transitions.set('workflow', {
      'pending': ['initializing', 'running', 'cancelled'],  // Allow direct running
      'initializing': ['running', 'failed'],
      'running': ['paused', 'completing', 'completed', 'failed'],  // Allow direct completed
      'paused': ['resuming', 'running', 'cancelled'],  // Allow direct running
      'resuming': ['running', 'failed'],
      'completing': ['completed', 'failed'],
      'completed': [],
      'failed': ['retrying', 'pending'],  // Allow reset to pending
      'retrying': ['running', 'failed'],
      'cancelled': []
    });

    // Step states
    this.transitions.set('step', {
      'pending': ['preparing', 'executing', 'skipped'],  // Allow direct executing for simpler flows
      'preparing': ['executing', 'failed'],
      'executing': ['validating', 'completed', 'failed'],  // Allow direct completion
      'validating': ['completed', 'failed'],
      'completed': [],
      'failed': ['retrying', 'skipped'],
      'retrying': ['executing', 'failed'],
      'skipped': []
    });

    // Parallel execution states
    this.transitions.set('parallel', {
      'pending': ['spawning'],
      'spawning': ['running', 'failed'],
      'running': ['synchronizing', 'failed'],
      'synchronizing': ['merging', 'failed'],
      'merging': ['completed', 'failed'],
      'completed': [],
      'failed': []
    });
  }

  /**
   * Create workflow state
   */
  createWorkflowState(workflowId, metadata = {}) {
    const state = {
      workflowId,
      status: 'pending',
      metadata,
      startTime: null,
      endTime: null,
      currentStep: null,
      completedSteps: [],
      failedSteps: [],
      skippedSteps: [],
      variables: {},
      outputs: {},
      errors: [],
      checkpoints: [],
      createdAt: Date.now()
    };

    this.workflowStates.set(workflowId, state);
    this.stats.workflowsTracked++;

    // Initialize transition history
    this.transitionHistory.set(workflowId, []);

    console.log(chalk.green(` Created workflow state: ${workflowId}`));

    this.emit('workflow:created', { workflowId, state });

    return state;
  }

  /**
   * Update workflow state
   */
  async updateWorkflowState(workflowId, newStatus, data = {}) {
    const state = this.workflowStates.get(workflowId);

    if (!state) {
      throw new Error(`Workflow state not found: ${workflowId}`);
    }

    // Validate transition
    if (this.config.enableStateValidation) {
      this.validateTransition('workflow', state.status, newStatus);
    }

    // Record transition
    this.recordTransition(workflowId, 'workflow', state.status, newStatus);

    // Update state
    const previousStatus = state.status;
    state.status = newStatus;

    // Handle status-specific updates
    switch (newStatus) {
      case 'running':
        state.startTime = state.startTime || Date.now();
        break;

      case 'completed':
      case 'failed':
      case 'cancelled':
        state.endTime = Date.now();
        break;

      case 'paused':
        state.pausedAt = Date.now();
        break;

      case 'resuming':
        state.resumedAt = Date.now();
        break;
    }

    // Merge additional data
    Object.assign(state, data);

    // Persist if configured
    if (this.config.persistState) {
      await this.persistWorkflowState(workflowId, state);
    }

    this.stats.stateTransitions++;

    console.log(chalk.cyan(` Workflow ${workflowId}: ${previousStatus} → ${newStatus}`));

    this.emit('workflow:state-changed', {
      workflowId,
      previousStatus,
      newStatus,
      state
    });

    return state;
  }

  /**
   * Create step state
   */
  createStepState(workflowId, stepId, metadata = {}) {
    const state = {
      workflowId,
      stepId,
      status: 'pending',
      metadata,
      startTime: null,
      endTime: null,
      attempts: 0,
      inputs: {},
      outputs: {},
      errors: [],
      createdAt: Date.now()
    };

    const key = `${workflowId}:${stepId}`;
    this.stepStates.set(key, state);

    console.log(chalk.green(` Created step state: ${stepId}`));

    this.emit('step:created', { workflowId, stepId, state });

    return state;
  }

  /**
   * Update step state
   */
  async updateStepState(workflowId, stepId, newStatus, data = {}) {
    const key = `${workflowId}:${stepId}`;
    const state = this.stepStates.get(key);

    if (!state) {
      throw new Error(`Step state not found: ${stepId}`);
    }

    // Validate transition
    if (this.config.enableStateValidation) {
      this.validateTransition('step', state.status, newStatus);
    }

    // Record transition
    this.recordTransition(key, 'step', state.status, newStatus);

    // Update state
    const previousStatus = state.status;
    state.status = newStatus;

    // Handle status-specific updates
    switch (newStatus) {
      case 'executing':
        state.startTime = state.startTime || Date.now();
        state.attempts++;
        break;

      case 'completed':
        state.endTime = Date.now();
        this.markStepComplete(workflowId, stepId);
        this.stats.stepsCompleted++;
        break;

      case 'failed':
        state.endTime = Date.now();
        this.markStepFailed(workflowId, stepId);
        break;

      case 'skipped':
        this.markStepSkipped(workflowId, stepId);
        break;
    }

    // Merge additional data
    Object.assign(state, data);

    this.stats.stateTransitions++;

    console.log(chalk.cyan(` Step ${stepId}: ${previousStatus} → ${newStatus}`));

    this.emit('step:state-changed', {
      workflowId,
      stepId,
      previousStatus,
      newStatus,
      state
    });

    return state;
  }

  /**
   * Create parallel execution state
   */
  createParallelState(workflowId, parallelId, tracks) {
    const state = {
      workflowId,
      parallelId,
      status: 'pending',
      tracks: tracks.map(track => ({
        id: track.id || `track_${Date.now()}`,
        name: track.name,
        status: 'pending',
        startTime: null,
        endTime: null
      })),
      startTime: null,
      endTime: null,
      completedTracks: [],
      failedTracks: [],
      results: {},
      createdAt: Date.now()
    };

    const key = `${workflowId}:${parallelId}`;
    this.parallelExecutions.set(key, state);

    console.log(chalk.green(` Created parallel state: ${parallelId} with ${tracks.length} tracks`));

    this.emit('parallel:created', { workflowId, parallelId, state });

    return state;
  }

  /**
   * Update parallel track state
   */
  updateParallelTrackState(workflowId, parallelId, trackId, status, result = null) {
    const key = `${workflowId}:${parallelId}`;
    const state = this.parallelExecutions.get(key);

    if (!state) {
      throw new Error(`Parallel state not found: ${parallelId}`);
    }

    const track = state.tracks.find(t => t.id === trackId);

    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    // Update track status
    track.status = status;

    switch (status) {
      case 'running':
        track.startTime = Date.now();
        if (!state.startTime) {
          state.startTime = Date.now();
          state.status = 'running';
        }
        break;

      case 'completed':
        track.endTime = Date.now();
        state.completedTracks.push(trackId);
        if (result) {
          state.results[trackId] = result;
        }
        break;

      case 'failed':
        track.endTime = Date.now();
        state.failedTracks.push(trackId);
        break;
    }

    // Check if all tracks are complete
    const allTracksComplete = state.tracks.every(t =>
      t.status === 'completed' || t.status === 'failed'
    );

    if (allTracksComplete) {
      state.status = state.failedTracks.length > 0 ? 'failed' : 'completed';
      state.endTime = Date.now();
    }

    console.log(chalk.cyan(` Parallel track ${trackId}: ${status}`));

    this.emit('parallel:track-updated', {
      workflowId,
      parallelId,
      trackId,
      status,
      state
    });

    return state;
  }

  /**
   * Create checkpoint
   */
  async createCheckpoint(workflowId) {
    const workflowState = this.workflowStates.get(workflowId);

    if (!workflowState) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const checkpoint = {
      id: `checkpoint_${Date.now()}`,
      workflowId,
      timestamp: Date.now(),
      workflowState: { ...workflowState },
      stepStates: this.getWorkflowStepStates(workflowId),
      parallelStates: this.getWorkflowParallelStates(workflowId)
    };

    // Store checkpoint
    if (!this.checkpoints.has(workflowId)) {
      this.checkpoints.set(workflowId, []);
    }

    this.checkpoints.get(workflowId).push(checkpoint);

    // Persist if configured
    if (this.config.persistState) {
      await this.persistCheckpoint(workflowId, checkpoint);
    }

    this.stats.checkpointsSaved++;

    console.log(chalk.green(` Created checkpoint: ${checkpoint.id}`));

    this.emit('checkpoint:created', { workflowId, checkpoint });

    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  async restoreFromCheckpoint(workflowId, checkpointId) {
    const checkpoints = this.checkpoints.get(workflowId) || [];
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // Restore workflow state
    this.workflowStates.set(workflowId, { ...checkpoint.workflowState });

    // Restore step states
    for (const [stepId, state] of Object.entries(checkpoint.stepStates)) {
      const key = `${workflowId}:${stepId}`;
      this.stepStates.set(key, { ...state });
    }

    // Restore parallel states
    for (const [parallelId, state] of Object.entries(checkpoint.parallelStates)) {
      const key = `${workflowId}:${parallelId}`;
      this.parallelExecutions.set(key, { ...state });
    }

    this.stats.statesRestored++;

    console.log(chalk.green(` Restored from checkpoint: ${checkpointId}`));

    this.emit('checkpoint:restored', {
      workflowId,
      checkpointId,
      checkpoint
    });

    return checkpoint;
  }

  /**
   * Get workflow step states
   */
  getWorkflowStepStates(workflowId) {
    const states = {};

    for (const [key, state] of this.stepStates) {
      if (key.startsWith(`${workflowId}:`)) {
        const stepId = key.split(':')[1];
        states[stepId] = { ...state };
      }
    }

    return states;
  }

  /**
   * Get workflow parallel states
   */
  getWorkflowParallelStates(workflowId) {
    const states = {};

    for (const [key, state] of this.parallelExecutions) {
      if (key.startsWith(`${workflowId}:`)) {
        const parallelId = key.split(':')[1];
        states[parallelId] = { ...state };
      }
    }

    return states;
  }

  /**
   * Validate state transition
   */
  validateTransition(type, fromState, toState) {
    const validTransitions = this.transitions.get(type)?.[fromState] || [];

    if (!validTransitions.includes(toState)) {
      throw new Error(`Invalid transition for ${type}: ${fromState} → ${toState}`);
    }
  }

  /**
   * Record state transition
   */
  recordTransition(id, type, fromState, toState) {
    if (!this.transitionHistory.has(id)) {
      this.transitionHistory.set(id, []);
    }

    const history = this.transitionHistory.get(id);
    history.push({
      type,
      from: fromState,
      to: toState,
      timestamp: Date.now()
    });

    // Limit history size
    if (history.length > this.config.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Mark step as complete
   */
  markStepComplete(workflowId, stepId) {
    const workflowState = this.workflowStates.get(workflowId);

    if (workflowState) {
      if (!workflowState.completedSteps.includes(stepId)) {
        workflowState.completedSteps.push(stepId);
      }

      // Update current step
      workflowState.currentStep = null;
    }
  }

  /**
   * Mark step as failed
   */
  markStepFailed(workflowId, stepId) {
    const workflowState = this.workflowStates.get(workflowId);

    if (workflowState) {
      if (!workflowState.failedSteps.includes(stepId)) {
        workflowState.failedSteps.push(stepId);
      }
    }
  }

  /**
   * Mark step as skipped
   */
  markStepSkipped(workflowId, stepId) {
    const workflowState = this.workflowStates.get(workflowId);

    if (workflowState) {
      if (!workflowState.skippedSteps.includes(stepId)) {
        workflowState.skippedSteps.push(stepId);
      }
    }
  }

  /**
   * Set workflow variables
   */
  setWorkflowVariables(workflowId, variables) {
    const workflowState = this.workflowStates.get(workflowId);

    if (workflowState) {
      workflowState.variables = {
        ...workflowState.variables,
        ...variables
      };

      this.emit('workflow:variables-updated', {
        workflowId,
        variables: workflowState.variables
      });
    }
  }

  /**
   * Set workflow outputs
   */
  setWorkflowOutputs(workflowId, outputs) {
    const workflowState = this.workflowStates.get(workflowId);

    if (workflowState) {
      workflowState.outputs = {
        ...workflowState.outputs,
        ...outputs
      };

      this.emit('workflow:outputs-updated', {
        workflowId,
        outputs: workflowState.outputs
      });
    }
  }

  /**
   * Ensure state directory exists
   */
  async ensureStateDirectory() {
    try {
      await fs.mkdir(this.config.stateDirectory, { recursive: true });
    } catch (error) {
      console.error(chalk.red('Failed to create state directory:'), error.message);
    }
  }

  /**
   * Persist workflow state
   */
  async persistWorkflowState(workflowId, state) {
    try {
      const filePath = path.join(this.config.stateDirectory, `${workflowId}.json`);
      await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      console.error(chalk.red('Failed to persist workflow state:'), error.message);
    }
  }

  /**
   * Persist checkpoint
   */
  async persistCheckpoint(workflowId, checkpoint) {
    try {
      const filePath = path.join(
        this.config.stateDirectory,
        `${workflowId}_${checkpoint.id}.checkpoint`
      );
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf8');
    } catch (error) {
      console.error(chalk.red('Failed to persist checkpoint:'), error.message);
    }
  }

  /**
   * Load persisted state
   */
  async loadPersistedState(workflowId) {
    try {
      const filePath = path.join(this.config.stateDirectory, `${workflowId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const state = JSON.parse(data);

      this.workflowStates.set(workflowId, state);

      console.log(chalk.green(` Loaded persisted state: ${workflowId}`));

      return state;
    } catch (error) {
      console.error(chalk.red('Failed to load persisted state:'), error.message);
      return null;
    }
  }

  /**
   * Get workflow state
   */
  getWorkflowState(workflowId) {
    return this.workflowStates.get(workflowId);
  }

  /**
   * Get step state
   */
  getStepState(workflowId, stepId) {
    const key = `${workflowId}:${stepId}`;
    return this.stepStates.get(key);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeWorkflows: this.workflowStates.size,
      totalSteps: this.stepStates.size,
      parallelExecutions: this.parallelExecutions.size,
      checkpoints: Array.from(this.checkpoints.values())
        .reduce((sum, cps) => sum + cps.length, 0)
    };
  }

  /**
   * Generic transition method for compatibility
   */
  async transition(entityId, fromState, toState, type = 'workflow') {
    // Validate transition
    const isValid = this.validateTransition(type, fromState, toState);
    if (!isValid) {
      throw new Error(`Invalid transition: ${fromState} → ${toState}`);
    }

    // Record transition
    this.recordTransition(entityId, type, fromState, toState);

    // Update state based on type
    if (type === 'workflow') {
      return await this.updateWorkflowState(entityId, toState);
    } else if (type === 'step') {
      const [workflowId, stepId] = entityId.split(':');
      return await this.updateStepState(workflowId, stepId, toState);
    }

    return true;
  }

  /**
   * Clear state manager
   */
  clear() {
    this.workflowStates.clear();
    this.stepStates.clear();
    this.parallelExecutions.clear();
    this.checkpoints.clear();
    this.transitionHistory.clear();

    this.stats = {
      workflowsTracked: 0,
      stepsCompleted: 0,
      stateTransitions: 0,
      checkpointsSaved: 0,
      statesRestored: 0
    };

    console.log(chalk.yellow(' State manager cleared'));
  }

  /**
   * Save state to storage (for test compatibility)
   * Persists workflow state for recovery
   */
  saveState(workflowId, state) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    // Store in memory (can be extended to use file system or database)
    const existingState = this.workflowStates.get(workflowId);
    if (existingState) {
      Object.assign(existingState, state);
    } else {
      this.workflowStates.set(workflowId, state);
    }

    this.stats.checkpointsSaved++;
    return true;
  }

  /**
   * Alias for saveState
   */
  save(workflowId, state) {
    return this.saveState(workflowId, state);
  }

  /**
   * Alias for saveState
   */
  persist(workflowId, state) {
    return this.saveState(workflowId, state);
  }
}

// Export singleton
let instance;

module.exports = {
  WorkflowStateManager,
  getInstance: () => {
    if (!instance) {
      instance = new WorkflowStateManager();
    }
    return instance;
  }
};