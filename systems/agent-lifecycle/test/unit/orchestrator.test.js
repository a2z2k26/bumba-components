const { AgentOrchestrator, AgentState, StateEvent } = require('../../src/index');

describe('Agent Lifecycle AgentOrchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator({
      maxAgents: 5,
      defaultAgentConfig: {
        maxActiveTime: 1000,
        storeHistory: true
      }
    });
  });

  afterEach(async () => {
    await orchestrator.completeAll();
  });

  describe('Agent Management', () => {
    test('should create agents', () => {
      const agent = orchestrator.createAgent('agent-1');
      expect(agent).toBeDefined();
      expect(agent.agentId).toBe('agent-1');
      expect(orchestrator.agents.size).toBe(1);
    });

    test('should prevent duplicate agent IDs', () => {
      orchestrator.createAgent('agent-1');
      expect(() => orchestrator.createAgent('agent-1'))
        .toThrow('Agent agent-1 already exists');
    });

    test('should respect max agents limit', () => {
      for (let i = 1; i <= 5; i++) {
        orchestrator.createAgent(`agent-${i}`);
      }

      expect(() => orchestrator.createAgent('agent-6'))
        .toThrow('Maximum agent limit (5) reached');
    });

    test('should get agent by ID', () => {
      const created = orchestrator.createAgent('agent-1');
      const retrieved = orchestrator.getAgent('agent-1');
      expect(retrieved).toBe(created);
    });

    test('should remove agent', () => {
      orchestrator.createAgent('agent-1');
      orchestrator.removeAgent('agent-1');
      expect(orchestrator.agents.size).toBe(0);
      expect(orchestrator.getAgent('agent-1')).toBeUndefined();
    });

    test('should apply default config to agents', () => {
      const agent = orchestrator.createAgent('agent-1');
      expect(agent.config.maxActiveTime).toBe(1000);
      expect(agent.config.storeHistory).toBe(true);
    });

    test('should override default config', () => {
      const agent = orchestrator.createAgent('agent-1', {
        maxActiveTime: 5000
      });
      expect(agent.config.maxActiveTime).toBe(5000);
    });
  });

  describe('Event Handling', () => {
    test('should handle agent state changes', async () => {
      const stateChangeHandler = jest.fn();
      orchestrator.on('agent:stateChange', stateChangeHandler);

      const agent = orchestrator.createAgent('agent-1');
      await agent.transition(StateEvent.SPAWN);

      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          from: AgentState.IDLE,
          to: AgentState.SPAWNING
        })
      );
    });

    test('should handle agent completion', async () => {
      const completionHandler = jest.fn();
      orchestrator.on('agent:completed', completionHandler);

      const agent = orchestrator.createAgent('agent-1');
      await agent.forceComplete();

      expect(completionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1'
        })
      );
    });

    test('should auto-remove completed agents', async () => {
      const agent = orchestrator.createAgent('agent-1');
      await agent.forceComplete();

      expect(orchestrator.agents.size).toBe(0);
      expect(orchestrator.metrics.totalCompleted).toBe(1);
    });
  });

  describe('Metrics', () => {
    test('should track agent creation', () => {
      orchestrator.createAgent('agent-1');
      orchestrator.createAgent('agent-2');

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalSpawned).toBe(2);
      expect(metrics.totalAgents).toBe(2);
    });

    test('should track state distribution', async () => {
      const agent1 = orchestrator.createAgent('agent-1');
      const agent2 = orchestrator.createAgent('agent-2');
      const agent3 = orchestrator.createAgent('agent-3');

      await agent1.transition(StateEvent.SPAWN);
      await agent2.transition(StateEvent.SPAWN);
      await agent2.transition(StateEvent.ACTIVATE);

      const metrics = orchestrator.getMetrics();
      expect(metrics.stateDistribution[AgentState.IDLE]).toBe(1);
      expect(metrics.stateDistribution[AgentState.SPAWNING]).toBe(1);
      expect(metrics.stateDistribution[AgentState.ACTIVE]).toBe(1);
      expect(metrics.activeAgents).toBe(1);
    });

    test('should calculate utilization', () => {
      orchestrator.createAgent('agent-1');
      orchestrator.createAgent('agent-2');

      const metrics = orchestrator.getMetrics();
      expect(metrics.utilization).toBe('40.0%');
    });

    test('should update metrics on state changes', async () => {
      const agent = orchestrator.createAgent('agent-1');

      let metrics = orchestrator.getMetrics();
      expect(metrics.stateDistribution[AgentState.IDLE]).toBe(1);

      await agent.transition(StateEvent.SPAWN);

      metrics = orchestrator.getMetrics();
      expect(metrics.stateDistribution[AgentState.IDLE]).toBe(0);
      expect(metrics.stateDistribution[AgentState.SPAWNING]).toBe(1);
    });
  });

  describe('Query Methods', () => {
    test('should get agents in specific state', async () => {
      const agent1 = orchestrator.createAgent('agent-1');
      const agent2 = orchestrator.createAgent('agent-2');
      const agent3 = orchestrator.createAgent('agent-3');

      await agent1.transition(StateEvent.SPAWN);
      await agent1.transition(StateEvent.ACTIVATE);
      await agent2.transition(StateEvent.SPAWN);
      await agent2.transition(StateEvent.ACTIVATE);

      const activeAgents = orchestrator.getAgentsInState(AgentState.ACTIVE);
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents[0].id).toBe('agent-1');
      expect(activeAgents[1].id).toBe('agent-2');
    });

    test('should get complete summary', async () => {
      const agent1 = orchestrator.createAgent('agent-1');
      const agent2 = orchestrator.createAgent('agent-2');

      await agent1.transition(StateEvent.SPAWN);

      const summary = orchestrator.getSummary();
      expect(summary.totalAgents).toBe(2);
      expect(summary.agents).toHaveLength(2);
      expect(summary.agents[0]).toMatchObject({
        id: 'agent-1',
        state: AgentState.SPAWNING
      });
      expect(summary.metrics.totalSpawned).toBe(2);
    });
  });

  describe('Bulk Operations', () => {
    test('should complete all agents', async () => {
      const agent1 = orchestrator.createAgent('agent-1');
      const agent2 = orchestrator.createAgent('agent-2');
      const agent3 = orchestrator.createAgent('agent-3');

      await agent1.transition(StateEvent.SPAWN);
      await agent2.transition(StateEvent.SPAWN);
      await agent2.transition(StateEvent.ACTIVATE);

      await orchestrator.completeAll('shutdown');

      expect(agent1.isCompleted()).toBe(true);
      expect(agent2.isCompleted()).toBe(true);
      expect(agent3.isCompleted()).toBe(true);
      expect(orchestrator.agents.size).toBe(0);
    });

    test('should handle partial failures in completeAll', async () => {
      const agent1 = orchestrator.createAgent('agent-1');
      const agent2 = orchestrator.createAgent('agent-2');

      jest.spyOn(agent1, 'forceComplete').mockRejectedValue(new Error('Failed'));

      await orchestrator.completeAll();

      expect(agent2.isCompleted()).toBe(true);
    });
  });

  describe('Configuration', () => {
    test('should disable metrics when configured', () => {
      const noMetricsOrch = new AgentOrchestrator({
        enableMetrics: false
      });

      const agent = noMetricsOrch.createAgent('agent-1');

      const initialMetrics = { ...noMetricsOrch.metrics };

      noMetricsOrch.handleStateChange({
        agentId: 'agent-1',
        from: AgentState.IDLE,
        to: AgentState.SPAWNING
      });

      expect(noMetricsOrch.metrics).toEqual(initialMetrics);

      noMetricsOrch.completeAll();
    });
  });
});