/**
 * Adaptive Planner - Section 2 from Optimization Plan
 * Skip sprint planning for simple tasks
 * Expected impact: 200-300ms saved per simple task
 */

class AdaptivePlanner {
  async plan(task) {
    const complexity = this.estimateComplexity(task);

    if (complexity < 3) {
      // Direct execution path
      return { sprints: [{ tasks: [task] }] };
    }

    if (complexity < 7) {
      // Simplified planning
      return this.simplePlan(task);
    }

    // Full sprint decomposition only for complex projects
    return this.sprintSystem.decompose(task);
  }

  estimateComplexity(task) {
    let score = 1;
    if (task.description.includes('implement')) score += 2;
    if (task.description.includes('refactor')) score += 3;
    if (task.description.includes('system')) score += 2;
    if (task.multiFile) score += 2;
    return score;
  }

  simplePlan(task) {
    // Simplified planning for medium complexity tasks
    return {
      sprints: [{
        id: 1,
        tasks: [task],
        complexity: 'medium',
        skipFullPlanning: true
      }]
    };
  }

  // Initialize sprint system lazily (optional dependency)
  get sprintSystem() {
    if (!this._sprintSystem) {
      try {
        this._sprintSystem = require('@bumba/coordination').SprintSystem;
      } catch(e) {
        // Fallback: return tasks as single sprint
        this._sprintSystem = { decompose: (task) => ({ sprints: [{ id: 1, tasks: [task] }] }) };
      }
    }
    return this._sprintSystem;
  }
}

const adaptivePlanner = new AdaptivePlanner();

module.exports = {
  AdaptivePlanner,
  adaptivePlanner
};