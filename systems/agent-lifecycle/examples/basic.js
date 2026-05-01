/**
 * Agent Lifecycle Basic Example
 * Demonstrating agent lifecycle management
 */

const { AgentOrchestrator, StateEvent } = require('../src/index');

// Create orchestrator
const orchestrator = new AgentOrchestrator({
  maxAgents: 10,
  defaultAgentConfig: {
    maxActiveTime: 10000, // 10 seconds for demo
    maxValidationTime: 3000,
    storeHistory: true
  }
});

// Listen for events
orchestrator.on('agent:stateChange', (data) => {
  console.log(`🔄 Agent ${data.agentId}: ${data.from} → ${data.to}`);
});

orchestrator.on('agent:completed', (data) => {
  console.log(`✅ Agent ${data.agentId} completed in ${data.stats.totalLifetime}ms`);
});

async function demo() {
  console.log('🚀 Agent Lifecycle Agent Lifecycle Demo\n');
  
  // Create some agents
  const agent1 = orchestrator.createAgent('task-1');
  const agent2 = orchestrator.createAgent('task-2');
  const agent3 = orchestrator.createAgent('task-3');
  
  // Simulate workflows
  setTimeout(async () => {
    console.log('\n📋 Starting Agent 1 workflow...');
    await agent1.transition(StateEvent.SPAWN, { task: 'process-data' });
    await agent1.transition(StateEvent.ACTIVATE, { taskCount: 3 });
    
    // Simulate work
    setTimeout(async () => {
      await agent1.transition(StateEvent.VALIDATE, { validationData: 'check-results' });
      await agent1.transition(StateEvent.COMPLETE, { result: 'success' });
    }, 2000);
  }, 1000);
  
  setTimeout(async () => {
    console.log('\n📋 Starting Agent 2 workflow...');
    await agent2.transition(StateEvent.SPAWN, { task: 'generate-report' });
    await agent2.transition(StateEvent.ACTIVATE, { taskCount: 1 });
    
    // This one will timeout
  }, 2000);
  
  setTimeout(async () => {
    console.log('\n📋 Starting Agent 3 workflow...');
    await agent3.transition(StateEvent.SPAWN, { task: 'cleanup-files' });
    
    // Simulate error during spawn
    setTimeout(async () => {
      try {
        await agent3.transition(StateEvent.ERROR, { error: 'resource_unavailable' });
        await agent3.retry({ newResource: true });
        await agent3.transition(StateEvent.ACTIVATE, { taskCount: 1 });
        await agent3.transition(StateEvent.COMPLETE);
      } catch (error) {
        console.log(`❌ Agent 3 failed: ${error.message}`);
      }
    }, 1000);
  }, 3000);
  
  // Show metrics periodically
  const metricsInterval = setInterval(() => {
    const metrics = orchestrator.getMetrics();
    console.log('\n📊 Current Metrics:', {
      active: metrics.activeAgents,
      total: metrics.totalAgents,
      states: metrics.stateDistribution
    });
  }, 3000);
  
  // Stop demo after 20 seconds
  setTimeout(async () => {
    console.log('\n🏁 Completing all agents...');
    await orchestrator.completeAll();
    
    clearInterval(metricsInterval);
    
    console.log('\n📊 Final Summary:');
    console.log(JSON.stringify(orchestrator.getSummary(), null, 2));
    
    process.exit(0);
  }, 20000);
}

demo().catch(console.error);