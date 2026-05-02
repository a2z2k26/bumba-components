const { AgentLifecycle, AgentState, StateEvent } = require('../../src/index');

describe('Agent Lifecycle AgentLifecycle', () => {
  let agent;

  beforeEach(() => {
    agent = new AgentLifecycle('test-agent', {
      maxIdleTime: 1000,
      maxActiveTime: 2000,
      maxValidationTime: 500,
      maxRetries: 2
    });
  });

  afterEach(() => {
    agent.cleanup();
  });

  describe('State Transitions', () => {
    test('should start in IDLE state', () => {
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    test('should transition from IDLE to SPAWNING', async () => {
      const result = await agent.transition(StateEvent.SPAWN);
      expect(result).toBe(true);
      expect(agent.getState()).toBe(AgentState.SPAWNING);
    });

    test('should transition through complete workflow', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE);
      expect(agent.getState()).toBe(AgentState.ACTIVE);

      await agent.transition(StateEvent.VALIDATE);
      expect(agent.getState()).toBe(AgentState.VALIDATING);

      await agent.transition(StateEvent.COMPLETE);
      expect(agent.getState()).toBe(AgentState.COMPLETING);

      await agent.transition(StateEvent.COMPLETE);
      expect(agent.getState()).toBe(AgentState.COMPLETED);
    });

    test('should reject invalid transitions', async () => {
      await expect(agent.transition(StateEvent.ACTIVATE))
        .rejects.toThrow('Invalid transition');
    });

    test('should handle error transitions', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ERROR);
      expect(agent.getState()).toBe(AgentState.IDLE);
    });
  });

  describe('Retry Logic', () => {
    test('should retry with count tracking', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ERROR);

      await agent.retry();
      expect(agent.retryCount).toBe(1);
      expect(agent.getState()).toBe(AgentState.SPAWNING);
    });

    test('should respect max retries', async () => {
      await agent.transition(StateEvent.SPAWN);

      for (let i = 0; i < 2; i++) {
        await agent.transition(StateEvent.ERROR);
        await agent.retry();
      }

      await agent.transition(StateEvent.ERROR);
      await expect(agent.retry()).rejects.toThrow('Max retries');
    });
  });

  describe('Timeouts', () => {
    let timerAgent;

    beforeEach(() => {
      jest.useFakeTimers();
      // Create agent after fake timers are installed so its setTimeout calls are captured
      timerAgent = new AgentLifecycle('timer-agent', {
        maxIdleTime: 1000,
        maxActiveTime: 2000,
        maxValidationTime: 500
      });
    });

    afterEach(() => {
      timerAgent.cleanup();
      jest.useRealTimers();
    });

    test('should timeout in IDLE state', () => {
      const stateChangeHandler = jest.fn();
      timerAgent.on('stateChange', stateChangeHandler);

      jest.advanceTimersByTime(1001);

      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: StateEvent.TIMEOUT,
          data: { reason: 'idle_timeout' }
        })
      );
    });

    test('should timeout in ACTIVE state', async () => {
      await timerAgent.transition(StateEvent.SPAWN);
      await timerAgent.transition(StateEvent.ACTIVATE);

      const stateChangeHandler = jest.fn();
      timerAgent.on('stateChange', stateChangeHandler);

      jest.advanceTimersByTime(2001);

      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: AgentState.ACTIVE,
          to: AgentState.COMPLETING,
          event: StateEvent.TIMEOUT
        })
      );
    });

    test('should clear timers on state change', async () => {
      await timerAgent.transition(StateEvent.SPAWN);

      await timerAgent.transition(StateEvent.ACTIVATE);
      expect(timerAgent.timers.spawning).toBeUndefined();
    });
  });

  describe('State History', () => {
    test('should track state history when enabled', async () => {
      await agent.transition(StateEvent.SPAWN, { task: 'test' });
      await agent.transition(StateEvent.ACTIVATE);

      const history = agent.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        from: AgentState.IDLE,
        to: AgentState.SPAWNING,
        event: StateEvent.SPAWN,
        data: { task: 'test' }
      });
    });

    test('should not track history when disabled', async () => {
      const noHistoryAgent = new AgentLifecycle('no-history', {
        storeHistory: false
      });

      await noHistoryAgent.transition(StateEvent.SPAWN);
      expect(noHistoryAgent.getHistory()).toHaveLength(0);

      noHistoryAgent.cleanup();
    });
  });

  describe('Metadata Management', () => {
    test('should store metadata on state entry', async () => {
      await agent.transition(StateEvent.SPAWN, { task: 'process' });

      const metadata = agent.getMetadata();
      expect(metadata.spawnStartTime).toBeDefined();
      expect(metadata.spawnData).toEqual({ task: 'process' });
    });

    test('should update metadata', () => {
      agent.updateMetadata({ custom: 'value' });
      expect(agent.getMetadata().custom).toBe('value');
    });

    test('should track task count', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE, { taskCount: 5 });

      expect(agent.getMetadata().taskCount).toBe(5);
      expect(agent.hasActiveTasks()).toBe(true);
    });
  });

  describe('Statistics', () => {
    test('should track time in states', async () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      await agent.transition(StateEvent.SPAWN);
      jest.advanceTimersByTime(100);

      await agent.transition(StateEvent.ACTIVATE);
      jest.advanceTimersByTime(200);

      const stats = agent.getStatistics();
      expect(stats.timeInStates[AgentState.SPAWNING]).toBe(100);
      expect(stats.timeInStates[AgentState.ACTIVE]).toBe(200);

      jest.useRealTimers();
    });

    test('should track total transitions', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE);

      const stats = agent.getStatistics();
      expect(stats.totalTransitions).toBe(2);
    });

    test('should record errors', () => {
      const error = new Error('Test error');
      agent.recordError(error);

      const stats = agent.getStatistics();
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].error).toBe('Test error');
    });
  });

  describe('Helper Methods', () => {
    test('should check state correctly', async () => {
      expect(agent.isInState(AgentState.IDLE)).toBe(true);
      expect(agent.isAvailable()).toBe(false);
      expect(agent.isCompleted()).toBe(false);
      expect(agent.canAcceptWork()).toBe(true);

      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE);

      expect(agent.isAvailable()).toBe(true);
      expect(agent.canAcceptWork()).toBe(true);
    });

    test('should force complete', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE, { taskCount: 5 });

      await agent.forceComplete('emergency');
      expect(agent.isCompleted()).toBe(true);
      expect(agent.getMetadata().completionReason).toBe('emergency');
    });
  });

  describe('Event Emissions', () => {
    test('should emit lifecycle events', async () => {
      const startHandler = jest.fn();
      const endHandler = jest.fn();
      const stateHandler = jest.fn();

      agent.on('lifecycle:started', startHandler);
      agent.on('lifecycle:ended', endHandler);
      agent.on('stateChange', stateHandler);

      const newAgent = new AgentLifecycle('event-test');
      newAgent.on('lifecycle:started', startHandler);
      newAgent.on('lifecycle:ended', endHandler);
      newAgent.on('stateChange', stateHandler);

      await newAgent.transition(StateEvent.SPAWN);
      await newAgent.forceComplete();

      expect(startHandler).toHaveBeenCalled();
      expect(endHandler).toHaveBeenCalled();
      expect(stateHandler).toHaveBeenCalled();
    });

    test('should emit state-specific events', async () => {
      const enterActiveHandler = jest.fn();
      agent.on('enter:active', enterActiveHandler);

      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE, { data: 'test' });

      expect(enterActiveHandler).toHaveBeenCalledWith({
        agentId: 'test-agent',
        previousState: AgentState.SPAWNING,
        data: { data: 'test' }
      });
    });
  });

  describe('Transition Validation', () => {
    test('should validate resource check for spawning', async () => {
      const result = await agent.transition(StateEvent.SPAWN, {
        resourceCheck: false
      });
      expect(result).toBe(false);
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    test('should prevent completion with active tasks', async () => {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE, { taskCount: 3 });

      const result = await agent.transition(StateEvent.COMPLETE);
      expect(result).toBe(false);
      expect(agent.getState()).toBe(AgentState.ACTIVE);
    });
  });
});