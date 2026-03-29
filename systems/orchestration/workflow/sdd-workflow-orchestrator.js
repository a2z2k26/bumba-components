/**
 * BUMBA SDD Workflow Orchestrator
 * Orchestrates the Spec-Driven Development workflow: specify → plan → execute
 * Phase 5 Sprint 2
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
// [OPTIONAL] const SpecManager = require('../spec-driven/spec-manager'); // May need @bumba/* package
// [OPTIONAL] const SpecifyCommand = require('../../commands/specify'); // May need @bumba/* package
// [OPTIONAL] const PlanCommand = require('../../commands/plan'); // May need @bumba/* package
// [OPTIONAL] const TasksCommand = require('../../commands/tasks'); // May need @bumba/* package

/**
 * Workflow states
 */
const WorkflowState = {
  IDLE: 'idle',
  SPECIFYING: 'specifying',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused'
};

/**
 * Workflow execution modes
 */
const WorkflowMode = {
  INTERACTIVE: 'interactive',  // User prompted at each stage
  GUIDED: 'guided',            // User prompted with recommendations
  AUTO: 'auto'                 // Fully automatic
};

class SDDWorkflowOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      stateDirectory: options.stateDirectory || path.join(process.cwd(), '.bumba', 'workflows'),
      autoSave: options.autoSave !== false,
      autoCreateGitHubIssue: options.autoCreateGitHubIssue || false,
      autoUpdateCatalog: options.autoUpdateCatalog !== false,
      mode: options.mode || WorkflowMode.INTERACTIVE,
      ...options
    };

    // State management
    this.state = WorkflowState.IDLE;
    this.currentWorkflow = null;
    this.workflowHistory = [];
    this.stateHistory = [];  // Sprint 5.4: Track all state transitions

    // Component references
    this.specManager = new SpecManager();
    this.specifyCommand = new SpecifyCommand();
    this.planCommand = new PlanCommand();
    this.tasksCommand = new TasksCommand();

    // Initialize state directory
    this.initializeStateDirectory();

    // Sprint 5.4: Check for crash recovery
    this.checkCrashRecovery();
  }

  /**
   * Initialize workflow state directory
   */
  initializeStateDirectory() {
    if (!fs.existsSync(this.config.stateDirectory)) {
      fs.mkdirSync(this.config.stateDirectory, { recursive: true });
    }
  }

  /**
   * Execute complete workflow
   */
  async execute(description, options = {}) {
    try {
      // Initialize workflow
      this.currentWorkflow = this.initializeWorkflow(description, options);
      this.setState(WorkflowState.SPECIFYING);
      this.emit('workflow:start', this.currentWorkflow);

      console.log(chalk.cyan.bold('\n🔄 BUMBA SDD Workflow Orchestrator'));
      console.log(chalk.gray('━'.repeat(60)));
      console.log(chalk.white(`  Description: ${description}`));
      console.log(chalk.white(`  Mode: ${options.mode || this.config.mode}`));
      console.log(chalk.gray('━'.repeat(60) + '\n'));

      // Stage 1: Specify
      await this.runSpecifyStage(description, options);

      // Check if user wants to continue
      if (options.mode !== WorkflowMode.AUTO && !await this.confirmContinue('planning')) {
        this.setState(WorkflowState.PAUSED);
        await this.saveWorkflowState();
        return this.currentWorkflow;
      }

      // Stage 2: Plan
      await this.runPlanStage(options);

      // Check if user wants to continue
      if (options.mode !== WorkflowMode.AUTO && !await this.confirmContinue('executing')) {
        this.setState(WorkflowState.PAUSED);
        await this.saveWorkflowState();
        return this.currentWorkflow;
      }

      // Stage 3: Execute
      await this.runExecuteStage(options);

      // Stage 4: Complete
      await this.runCompleteStage();

      this.setState(WorkflowState.COMPLETED);
      this.emit('workflow:complete', this.currentWorkflow);

      // Display completion summary
      this.displayCompletionSummary();

      return this.currentWorkflow;

    } catch (error) {
      this.setState(WorkflowState.FAILED);
      this.currentWorkflow.error = error.message;
      this.emit('workflow:failed', error);
      await this.saveWorkflowState();

      console.error(chalk.red('\n❌ Workflow failed:'), error.message);
      throw error;
    }
  }

  /**
   * Initialize workflow context
   */
  initializeWorkflow(description, options = {}) {
    const workflow = {
      id: this.generateWorkflowId(),
      description: description,
      mode: options.mode || this.config.mode,
      state: WorkflowState.IDLE,
      stages: {
        specify: { status: 'pending', startedAt: null, completedAt: null },
        plan: { status: 'pending', startedAt: null, completedAt: null },
        execute: { status: 'pending', startedAt: null, completedAt: null }
      },
      spec: null,
      plan: null,
      execution: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return workflow;
  }

  /**
   * Run Specify stage
   */
  async runSpecifyStage(description, options = {}) {
    console.log(chalk.green.bold('\n📝 Stage 1: Specification'));
    console.log(chalk.gray('─'.repeat(60)));

    this.setState(WorkflowState.SPECIFYING);
    this.currentWorkflow.stages.specify.status = 'in-progress';
    this.currentWorkflow.stages.specify.startedAt = new Date().toISOString();
    this.emit('stage:specify:start');

    try {
      // Execute specify command
      const result = await this.specifyCommand.execute(description, {
        ...options,
        auto: options.mode === WorkflowMode.AUTO
      });

      if (!result.success) {
        throw new Error(`Specification failed: ${result.error}`);
      }

      // Update workflow
      this.currentWorkflow.spec = result.spec;
      this.currentWorkflow.specId = result.spec.id;
      this.currentWorkflow.stages.specify.status = 'completed';
      this.currentWorkflow.stages.specify.completedAt = new Date().toISOString();
      this.currentWorkflow.stages.specify.result = result;

      this.emit('stage:specify:complete', result.spec);
      await this.saveWorkflowState();

      console.log(chalk.green('✅ Specification stage complete'));

      return result;

    } catch (error) {
      this.currentWorkflow.stages.specify.status = 'failed';
      this.currentWorkflow.stages.specify.error = error.message;
      this.emit('stage:specify:failed', error);
      throw error;
    }
  }

  /**
   * Run Plan stage
   */
  async runPlanStage(options = {}) {
    console.log(chalk.green.bold('\n📋 Stage 2: Planning'));
    console.log(chalk.gray('─'.repeat(60)));

    this.setState(WorkflowState.PLANNING);
    this.currentWorkflow.stages.plan.status = 'in-progress';
    this.currentWorkflow.stages.plan.startedAt = new Date().toISOString();
    this.emit('stage:plan:start');

    try {
      // Execute plan command
      const result = await this.planCommand.execute(this.currentWorkflow.specId, {
        ...options,
        auto: options.mode === WorkflowMode.AUTO
      });

      if (!result.success) {
        throw new Error(`Planning failed: ${result.error}`);
      }

      // Update workflow
      this.currentWorkflow.plan = result.plan;
      this.currentWorkflow.spec = result.spec;  // Updated spec with plan
      this.currentWorkflow.stages.plan.status = 'completed';
      this.currentWorkflow.stages.plan.completedAt = new Date().toISOString();
      this.currentWorkflow.stages.plan.result = result;

      this.emit('stage:plan:complete', result.plan);
      await this.saveWorkflowState();

      console.log(chalk.green('✅ Planning stage complete'));

      return result;

    } catch (error) {
      this.currentWorkflow.stages.plan.status = 'failed';
      this.currentWorkflow.stages.plan.error = error.message;
      this.emit('stage:plan:failed', error);
      throw error;
    }
  }

  /**
   * Run Execute stage
   */
  async runExecuteStage(options = {}) {
    console.log(chalk.green.bold('\n⚡ Stage 3: Execution'));
    console.log(chalk.gray('─'.repeat(60)));

    this.setState(WorkflowState.EXECUTING);
    this.currentWorkflow.stages.execute.status = 'in-progress';
    this.currentWorkflow.stages.execute.startedAt = new Date().toISOString();
    this.emit('stage:execute:start');

    try {
      // Execute tasks command
      const result = await this.tasksCommand.execute(this.currentWorkflow.specId, {
        ...options,
        mode: options.taskMode || 'auto'
      });

      if (!result.success) {
        throw new Error(`Execution failed: ${result.error}`);
      }

      // Update workflow
      this.currentWorkflow.execution = result.results;
      this.currentWorkflow.spec = result.spec;  // Updated spec with execution
      this.currentWorkflow.stages.execute.status = 'completed';
      this.currentWorkflow.stages.execute.completedAt = new Date().toISOString();
      this.currentWorkflow.stages.execute.result = result;

      this.emit('stage:execute:complete', result.results);
      await this.saveWorkflowState();

      console.log(chalk.green('✅ Execution stage complete'));

      return result;

    } catch (error) {
      this.currentWorkflow.stages.execute.status = 'failed';
      this.currentWorkflow.stages.execute.error = error.message;
      this.emit('stage:execute:failed', error);
      throw error;
    }
  }

  /**
   * Run Complete stage
   */
  async runCompleteStage() {
    console.log(chalk.green.bold('\n🎉 Stage 4: Completion'));
    console.log(chalk.gray('─'.repeat(60)));

    this.emit('stage:complete:start');

    try {
      // Update GitHub issue if enabled
      if (this.config.autoCreateGitHubIssue && this.currentWorkflow.spec.githubIssue) {
        await this.updateGitHubIssue();
      }

      // Update catalog if enabled
      if (this.config.autoUpdateCatalog) {
        // Catalog auto-updates via SpecManager hooks
      }

      // Record completion
      this.currentWorkflow.completedAt = new Date().toISOString();
      this.currentWorkflow.duration = this.calculateDuration();

      // Add to history
      this.workflowHistory.push(this.currentWorkflow);

      this.emit('stage:complete:complete');
      await this.saveWorkflowState();

      console.log(chalk.green('✅ Workflow completion processing done'));

    } catch (error) {
      console.warn(chalk.yellow('⚠️  Completion processing had issues:'), error.message);
      // Don't fail the workflow for completion issues
    }
  }

  /**
   * Update GitHub issue with workflow completion
   */
  async updateGitHubIssue() {
    try {
      // [OPTIONAL] const GitHubIssueBridge = require('../github/issue-bridge'); // May need @bumba/* package
      const bridge = new GitHubIssueBridge();
      await bridge.initialize();

      // Add completion comment
      await bridge.github.issues.createComment({
        owner: bridge.config.owner,
        repo: bridge.config.repo,
        issue_number: this.currentWorkflow.spec.githubIssue,
        body: this.formatCompletionComment()
      });

      console.log(chalk.gray('  ℹ️  GitHub issue updated'));

    } catch (error) {
      console.warn(chalk.yellow('  ⚠️  Could not update GitHub issue:'), error.message);
    }
  }

  /**
   * Format GitHub completion comment
   */
  formatCompletionComment() {
    const workflow = this.currentWorkflow;
    const duration = this.calculateDuration();

    let comment = `## ✅ Workflow Completed\n\n`;
    comment += `**Specification:** ${workflow.spec.title}\n`;
    comment += `**Workflow ID:** ${workflow.id}\n`;
    comment += `**Duration:** ${duration}\n\n`;

    comment += `### Stages\n`;
    comment += `- ✅ Specification: ${workflow.stages.specify.status}\n`;
    comment += `- ✅ Planning: ${workflow.stages.plan.status}\n`;
    comment += `- ✅ Execution: ${workflow.stages.execute.status}\n\n`;

    if (workflow.execution) {
      comment += `### Execution Summary\n`;
      comment += `- Tasks Completed: ${workflow.execution.completedTasks}/${workflow.execution.totalTasks}\n`;
      comment += `- Success: ${workflow.execution.success ? 'Yes' : 'No'}\n`;
    }

    comment += `\n---\n*Automated by BUMBA SDD Workflow Orchestrator*`;

    return comment;
  }

  /**
   * Confirm continue to next stage (interactive/guided modes)
   */
  async confirmContinue(nextStage) {
    const inquirer = require('inquirer');

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `Continue to ${nextStage} stage?`,
        default: true
      }
    ]);

    return proceed;
  }

  /**
   * Set workflow state
   * Sprint 5.4: Enhanced with history tracking
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;

    if (this.currentWorkflow) {
      this.currentWorkflow.state = newState;
      this.currentWorkflow.updatedAt = new Date().toISOString();

      // Sprint 5.4: Record state transition in history
      this.recordStateTransition(oldState, newState);
    }

    this.emit('state:change', { from: oldState, to: newState });

    if (this.config.autoSave) {
      this.saveWorkflowState().catch(err => {
        console.error('Failed to auto-save workflow state:', err.message);
      });
    }
  }

  /**
   * Save workflow state to disk
   */
  async saveWorkflowState() {
    if (!this.currentWorkflow) return;

    try {
      const statePath = path.join(
        this.config.stateDirectory,
        `${this.currentWorkflow.id}.json`
      );

      fs.writeFileSync(
        statePath,
        JSON.stringify(this.currentWorkflow, null, 2),
        'utf8'
      );

      this.emit('state:saved', statePath);

    } catch (error) {
      console.error('Failed to save workflow state:', error.message);
      throw error;
    }
  }

  /**
   * Load workflow state from disk
   */
  async loadWorkflowState(workflowId) {
    try {
      const statePath = path.join(
        this.config.stateDirectory,
        `${workflowId}.json`
      );

      if (!fs.existsSync(statePath)) {
        throw new Error(`Workflow state not found: ${workflowId}`);
      }

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      this.currentWorkflow = state;
      this.state = state.state;

      this.emit('state:loaded', state);

      return state;

    } catch (error) {
      console.error('Failed to load workflow state:', error.message);
      throw error;
    }
  }

  /**
   * Resume paused workflow
   */
  async resume(workflowId) {
    console.log(chalk.cyan(`\n🔄 Resuming workflow ${workflowId}...`));

    // Load workflow state
    await this.loadWorkflowState(workflowId);

    if (this.currentWorkflow.state === WorkflowState.COMPLETED) {
      console.log(chalk.yellow('⚠️  Workflow already completed'));
      return this.currentWorkflow;
    }

    if (this.currentWorkflow.state === WorkflowState.FAILED) {
      console.log(chalk.red('❌ Cannot resume failed workflow'));
      return this.currentWorkflow;
    }

    // Determine which stage to resume from
    const currentStage = this.determineCurrentStage();
    console.log(chalk.gray(`  Resuming from ${currentStage} stage...\n`));

    // Resume execution
    const options = { mode: this.currentWorkflow.mode };

    try {
      if (currentStage === 'plan') {
        await this.runPlanStage(options);
        await this.runExecuteStage(options);
        await this.runCompleteStage();
      } else if (currentStage === 'execute') {
        await this.runExecuteStage(options);
        await this.runCompleteStage();
      } else if (currentStage === 'complete') {
        await this.runCompleteStage();
      }

      this.setState(WorkflowState.COMPLETED);
      this.emit('workflow:resumed', this.currentWorkflow);

      return this.currentWorkflow;

    } catch (error) {
      this.setState(WorkflowState.FAILED);
      throw error;
    }
  }

  /**
   * Determine current stage from workflow state
   */
  determineCurrentStage() {
    const stages = this.currentWorkflow.stages;

    if (stages.specify.status !== 'completed') {
      return 'specify';
    }
    if (stages.plan.status !== 'completed') {
      return 'plan';
    }
    if (stages.execute.status !== 'completed') {
      return 'execute';
    }
    return 'complete';
  }

  /**
   * List all workflows
   */
  listWorkflows(options = {}) {
    try {
      const files = fs.readdirSync(this.config.stateDirectory)
        .filter(f => f.endsWith('.json'));

      const workflows = files.map(file => {
        const content = fs.readFileSync(
          path.join(this.config.stateDirectory, file),
          'utf8'
        );
        return JSON.parse(content);
      });

      // Filter by state if specified
      if (options.state) {
        return workflows.filter(w => w.state === options.state);
      }

      // Sort by creation date (newest first)
      workflows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return workflows;

    } catch (error) {
      console.error('Failed to list workflows:', error.message);
      return [];
    }
  }

  /**
   * Get workflow status
   */
  getStatus() {
    if (!this.currentWorkflow) {
      return { state: WorkflowState.IDLE };
    }

    return {
      state: this.state,
      workflow: this.currentWorkflow,
      progress: this.calculateProgress(),
      duration: this.calculateDuration(),
      currentStage: this.determineCurrentStage()
    };
  }

  /**
   * Calculate workflow progress percentage
   */
  calculateProgress() {
    if (!this.currentWorkflow) return 0;

    const stages = this.currentWorkflow.stages;
    let completed = 0;
    const total = 3;  // specify, plan, execute

    if (stages.specify.status === 'completed') completed++;
    if (stages.plan.status === 'completed') completed++;
    if (stages.execute.status === 'completed') completed++;

    return Math.round((completed / total) * 100);
  }

  /**
   * Calculate workflow duration
   */
  calculateDuration() {
    if (!this.currentWorkflow) return '0s';

    const start = new Date(this.currentWorkflow.createdAt);
    const end = this.currentWorkflow.completedAt ?
      new Date(this.currentWorkflow.completedAt) :
      new Date();

    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);

    if (diffMins > 0) {
      return `${diffMins}m ${diffSecs}s`;
    }
    return `${diffSecs}s`;
  }

  /**
   * Display workflow completion summary
   */
  displayCompletionSummary() {
    console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║            WORKFLOW COMPLETED SUCCESSFULLY                ║'));
    console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.white.bold('📊 Summary:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  Workflow ID: ${chalk.cyan(this.currentWorkflow.id)}`);
    console.log(`  Spec ID: ${chalk.cyan(this.currentWorkflow.specId)}`);
    console.log(`  Duration: ${chalk.green(this.calculateDuration())}`);
    console.log(`  Progress: ${chalk.green(this.calculateProgress() + '%')}`);
    console.log();

    console.log(chalk.white.bold('✅ Stages:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  ${chalk.green('✓')} Specification: ${this.formatDuration(this.currentWorkflow.stages.specify)}`);
    console.log(`  ${chalk.green('✓')} Planning: ${this.formatDuration(this.currentWorkflow.stages.plan)}`);
    console.log(`  ${chalk.green('✓')} Execution: ${this.formatDuration(this.currentWorkflow.stages.execute)}`);
    console.log();

    if (this.currentWorkflow.execution) {
      console.log(chalk.white.bold('📋 Execution Results:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`  Tasks Completed: ${chalk.green(this.currentWorkflow.execution.completedTasks)}/${this.currentWorkflow.execution.totalTasks}`);
      console.log(`  Success: ${this.currentWorkflow.execution.success ? chalk.green('Yes') : chalk.red('No')}`);
      console.log();
    }

    console.log(chalk.gray('═'.repeat(60) + '\n'));
  }

  /**
   * Format stage duration
   */
  formatDuration(stage) {
    if (!stage.startedAt || !stage.completedAt) return 'N/A';

    const start = new Date(stage.startedAt);
    const end = new Date(stage.completedAt);
    const diffMs = end - start;
    const diffSecs = Math.floor(diffMs / 1000);

    return chalk.gray(`(${diffSecs}s)`);
  }

  /**
   * Generate unique workflow ID
   */
  generateWorkflowId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `WF-${timestamp}-${random}`;
  }

  // ============================================================================
  // Sprint 5.4: Enhanced State Management Features
  // ============================================================================

  /**
   * Check for interrupted workflows and offer recovery
   * Sprint 5.4: Crash recovery
   */
  checkCrashRecovery() {
    try {
      const workflows = this.listWorkflows();
      const interrupted = workflows.filter(w =>
        w.state !== WorkflowState.COMPLETED &&
        w.state !== WorkflowState.FAILED &&
        w.state !== WorkflowState.PAUSED
      );

      if (interrupted.length > 0 && !process.env.BUMBA_NO_RECOVERY) {
        // Mark interrupted workflows as recoverable
        for (const workflow of interrupted) {
          workflow.recovery = {
            detected: true,
            detectedAt: new Date().toISOString(),
            previousState: workflow.state
          };

          // Save updated state
          const statePath = path.join(
            this.config.stateDirectory,
            `${workflow.id}.json`
          );
          fs.writeFileSync(statePath, JSON.stringify(workflow, null, 2));
        }

        // Note: Recovery is offered through the workflow command UI
        this.emit('recovery:available', interrupted);
      }
    } catch (error) {
      // Silent fail - recovery is optional
    }
  }

  /**
   * Record state transition in history
   * Sprint 5.4: State history tracking
   */
  recordStateTransition(fromState, toState) {
    if (!this.currentWorkflow) return;

    const transition = {
      timestamp: new Date().toISOString(),
      from: fromState,
      to: toState,
      workflowId: this.currentWorkflow.id,
      duration: this.calculateDuration()
    };

    // Add to in-memory history
    this.stateHistory.push(transition);

    // Add to workflow's transition log
    if (!this.currentWorkflow.stateTransitions) {
      this.currentWorkflow.stateTransitions = [];
    }
    this.currentWorkflow.stateTransitions.push(transition);

    // Persist to separate history file
    this.saveStateHistory();

    this.emit('history:transition', transition);
  }

  /**
   * Save state history to disk
   * Sprint 5.4: Persistent history tracking
   */
  saveStateHistory() {
    if (!this.currentWorkflow) return;

    try {
      const historyPath = path.join(
        this.config.stateDirectory,
        `${this.currentWorkflow.id}.history.json`
      );

      fs.writeFileSync(
        historyPath,
        JSON.stringify({
          workflowId: this.currentWorkflow.id,
          description: this.currentWorkflow.description,
          transitions: this.currentWorkflow.stateTransitions || [],
          createdAt: this.currentWorkflow.createdAt,
          updatedAt: new Date().toISOString()
        }, null, 2),
        'utf8'
      );
    } catch (error) {
      // Silent fail - history is optional
    }
  }

  /**
   * Get state history for a workflow
   * Sprint 5.4: History querying
   */
  getStateHistory(workflowId = null) {
    const id = workflowId || (this.currentWorkflow && this.currentWorkflow.id);
    if (!id) return [];

    try {
      const historyPath = path.join(
        this.config.stateDirectory,
        `${id}.history.json`
      );

      if (!fs.existsSync(historyPath)) {
        return [];
      }

      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      return history.transitions || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get complete audit trail for a workflow
   * Sprint 5.4: Audit trail
   */
  getWorkflowAuditTrail(workflowId = null) {
    const id = workflowId || (this.currentWorkflow && this.currentWorkflow.id);
    if (!id) return null;

    try {
      // Load workflow state
      const statePath = path.join(this.config.stateDirectory, `${id}.json`);
      const workflow = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      // Load state history
      const stateHistory = this.getStateHistory(id);

      // Compile audit trail
      return {
        workflowId: id,
        description: workflow.description,
        mode: workflow.mode,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        completedAt: workflow.completedAt,
        currentState: workflow.state,
        stages: workflow.stages,
        stateTransitions: stateHistory,
        events: this.extractWorkflowEvents(workflow),
        snapshots: this.listSnapshots(id)
      };
    } catch (error) {
      console.error('Failed to get audit trail:', error.message);
      return null;
    }
  }

  /**
   * Extract events from workflow
   */
  extractWorkflowEvents(workflow) {
    const events = [];

    // Add stage events
    ['specify', 'plan', 'execute'].forEach(stage => {
      if (workflow.stages[stage].startedAt) {
        events.push({
          type: `stage:${stage}:start`,
          timestamp: workflow.stages[stage].startedAt,
          stage
        });
      }
      if (workflow.stages[stage].completedAt) {
        events.push({
          type: `stage:${stage}:complete`,
          timestamp: workflow.stages[stage].completedAt,
          stage
        });
      }
      if (workflow.stages[stage].error) {
        events.push({
          type: `stage:${stage}:failed`,
          timestamp: workflow.stages[stage].completedAt || workflow.updatedAt,
          stage,
          error: workflow.stages[stage].error
        });
      }
    });

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return events;
  }

  /**
   * Validate workflow state integrity
   * Sprint 5.4: State validation
   */
  validateWorkflowState(workflow = null) {
    const wf = workflow || this.currentWorkflow;
    if (!wf) {
      return { valid: false, errors: ['No workflow to validate'] };
    }

    const errors = [];

    // Required fields
    if (!wf.id) errors.push('Missing workflow ID');
    if (!wf.description) errors.push('Missing description');
    if (!wf.state) errors.push('Missing state');
    if (!wf.mode) errors.push('Missing mode');
    if (!wf.createdAt) errors.push('Missing createdAt timestamp');

    // Validate state value
    if (!Object.values(WorkflowState).includes(wf.state)) {
      errors.push(`Invalid state: ${wf.state}`);
    }

    // Validate mode value
    if (!Object.values(WorkflowMode).includes(wf.mode)) {
      errors.push(`Invalid mode: ${wf.mode}`);
    }

    // Validate stages structure
    if (!wf.stages) {
      errors.push('Missing stages object');
    } else {
      ['specify', 'plan', 'execute'].forEach(stage => {
        if (!wf.stages[stage]) {
          errors.push(`Missing stage: ${stage}`);
        } else {
          if (!wf.stages[stage].status) {
            errors.push(`Missing status for ${stage} stage`);
          }
        }
      });
    }

    // Validate completed workflow
    if (wf.state === WorkflowState.COMPLETED) {
      if (!wf.completedAt) {
        errors.push('Completed workflow missing completedAt timestamp');
      }
      if (!wf.specId) {
        errors.push('Completed workflow missing specId');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: this.getValidationWarnings(wf)
    };
  }

  /**
   * Get validation warnings (non-critical issues)
   */
  getValidationWarnings(workflow) {
    const warnings = [];

    // Check for long-running workflows
    const duration = new Date() - new Date(workflow.createdAt);
    const hourMs = 1000 * 60 * 60;
    if (duration > hourMs * 24 && workflow.state !== WorkflowState.COMPLETED) {
      warnings.push('Workflow running for over 24 hours');
    }

    // Check for stale paused workflows
    if (workflow.state === WorkflowState.PAUSED) {
      const pauseDuration = new Date() - new Date(workflow.updatedAt);
      if (pauseDuration > hourMs * 2) {
        warnings.push('Workflow paused for over 2 hours');
      }
    }

    return warnings;
  }

  /**
   * Create workflow state snapshot
   * Sprint 5.4: Checkpoint/rollback support
   */
  async createSnapshot(label = null) {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow to snapshot');
    }

    const snapshot = {
      id: this.generateSnapshotId(),
      workflowId: this.currentWorkflow.id,
      label: label || `Snapshot at ${new Date().toLocaleString()}`,
      timestamp: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(this.currentWorkflow)), // Deep clone
      currentStage: this.determineCurrentStage()
    };

    // Save snapshot to disk
    const snapshotPath = path.join(
      this.config.stateDirectory,
      'snapshots',
      `${this.currentWorkflow.id}-${snapshot.id}.json`
    );

    // Ensure snapshots directory exists
    const snapshotsDir = path.join(this.config.stateDirectory, 'snapshots');
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }

    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

    this.emit('snapshot:created', snapshot);

    return snapshot;
  }

  /**
   * Restore workflow from snapshot
   * Sprint 5.4: Rollback support
   */
  async restoreSnapshot(snapshotId) {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow');
    }

    const snapshotPath = path.join(
      this.config.stateDirectory,
      'snapshots',
      `${this.currentWorkflow.id}-${snapshotId}.json`
    );

    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    // Restore workflow state
    this.currentWorkflow = snapshot.state;
    this.state = snapshot.state.state;

    // Save restored state
    await this.saveWorkflowState();

    this.emit('snapshot:restored', snapshot);

    console.log(chalk.green(`✅ Restored snapshot: ${snapshot.label}`));

    return snapshot;
  }

  /**
   * List all snapshots for a workflow
   */
  listSnapshots(workflowId = null) {
    const id = workflowId || (this.currentWorkflow && this.currentWorkflow.id);
    if (!id) return [];

    try {
      const snapshotsDir = path.join(this.config.stateDirectory, 'snapshots');
      if (!fs.existsSync(snapshotsDir)) return [];

      const files = fs.readdirSync(snapshotsDir)
        .filter(f => f.startsWith(`${id}-`) && f.endsWith('.json'));

      const snapshots = files.map(file => {
        const content = fs.readFileSync(
          path.join(snapshotsDir, file),
          'utf8'
        );
        const snapshot = JSON.parse(content);
        return {
          id: snapshot.id,
          label: snapshot.label,
          timestamp: snapshot.timestamp,
          currentStage: snapshot.currentStage
        };
      });

      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return snapshots;
    } catch (error) {
      console.error('Failed to list snapshots:', error.message);
      return [];
    }
  }

  /**
   * Generate unique snapshot ID
   */
  generateSnapshotId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SNAP-${timestamp}-${random}`;
  }

  /**
   * Clean up old workflow data
   * Sprint 5.4: Maintenance
   */
  cleanupOldWorkflows(daysOld = 30) {
    try {
      const workflows = this.listWorkflows();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let cleaned = 0;

      workflows.forEach(workflow => {
        const createdAt = new Date(workflow.createdAt);

        // Only clean up completed or failed workflows
        if (
          (workflow.state === WorkflowState.COMPLETED ||
           workflow.state === WorkflowState.FAILED) &&
          createdAt < cutoffDate
        ) {
          // Delete workflow state file
          const statePath = path.join(
            this.config.stateDirectory,
            `${workflow.id}.json`
          );
          if (fs.existsSync(statePath)) {
            fs.unlinkSync(statePath);
            cleaned++;
          }

          // Delete history file
          const historyPath = path.join(
            this.config.stateDirectory,
            `${workflow.id}.history.json`
          );
          if (fs.existsSync(historyPath)) {
            fs.unlinkSync(historyPath);
          }

          // Delete snapshots
          const snapshotsDir = path.join(this.config.stateDirectory, 'snapshots');
          if (fs.existsSync(snapshotsDir)) {
            const snapshots = fs.readdirSync(snapshotsDir)
              .filter(f => f.startsWith(`${workflow.id}-`));
            snapshots.forEach(snap => {
              fs.unlinkSync(path.join(snapshotsDir, snap));
            });
          }
        }
      });

      return { cleaned, cutoffDate: cutoffDate.toISOString() };

    } catch (error) {
      console.error('Failed to clean up workflows:', error.message);
      return { cleaned: 0, error: error.message };
    }
  }
}

// Export class and constants
module.exports = SDDWorkflowOrchestrator;
module.exports.WorkflowState = WorkflowState;
module.exports.WorkflowMode = WorkflowMode;
