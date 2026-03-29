/**
 * Analytics Dashboard Template
 * Generates analytics dashboard with velocity charts, burndown, and metrics
 */

const BaseNotionTemplate = require('./base-template');

class AnalyticsTemplate extends BaseNotionTemplate {
  constructor(config = {}) {
    super({
      name: 'Analytics Dashboard',
      description: 'Project analytics with velocity, burndown, and distribution metrics',
      ...config
    });
  }

  /**
   * Generate analytics dashboard blocks
   * @param {object} data - Analytics data
   * @param {array} data.sprints - Sprint array with completion data
   * @param {object} data.velocity - Velocity data
   * @param {object} data.burndown - Burndown data
   * @param {object} data.distribution - Task distribution data
   * @returns {array} Array of Notion blocks
   */
  generate(data) {
    if (!this.validate(data)) {
      throw new Error('Invalid analytics data for template');
    }

    const blocks = [];

    // Analytics Header
    blocks.push(this.createHeading('📊 Analytics Dashboard', 1));
    blocks.push(this.createParagraph('Project metrics, velocity, and performance analytics'));
    blocks.push(this.createDivider());

    // Key Metrics Summary
    blocks.push(this.createHeading('🎯 Key Metrics', 2));

    const metrics = this.calculateKeyMetrics(data);

    blocks.push(this.createCallout(
      `Overall Completion: ${metrics.overallCompletion}%`,
      '📈',
      'blue_background'
    ));

    blocks.push(this.createParagraph(''));
    blocks.push(this.createBulletPoint(`Total Sprints: ${metrics.totalSprints}`));
    blocks.push(this.createBulletPoint(`Completed Sprints: ${metrics.completedSprints}`));
    blocks.push(this.createBulletPoint(`Total Tasks: ${metrics.totalTasks}`));
    blocks.push(this.createBulletPoint(`Completed Tasks: ${metrics.completedTasks}`));
    blocks.push(this.createBulletPoint(`Average Sprint Completion: ${metrics.avgSprintCompletion}%`));

    blocks.push(this.createDivider());

    // Velocity Chart
    blocks.push(this.createHeading('🚀 Velocity Trend', 2));
    blocks.push(this.createParagraph('Tasks completed per sprint'));
    blocks.push(this.createParagraph(''));

    if (data.sprints && data.sprints.length > 0) {
      const velocityChart = this.createVelocityChart(data.sprints);
      blocks.push(this.createCodeBlock(velocityChart, 'text'));

      blocks.push(this.createParagraph(''));
      blocks.push(this.createParagraph('**Sprint Breakdown:**'));

      data.sprints.forEach(sprint => {
        const completed = sprint.tasks?.filter(t => t.status === 'completed').length || 0;
        const total = sprint.tasks?.length || 0;
        blocks.push(this.createBulletPoint(
          `Sprint ${sprint.sprintNumber}: ${completed}/${total} tasks completed`
        ));
      });
    } else {
      blocks.push(this.createParagraph('No sprint data available for velocity analysis.'));
    }

    blocks.push(this.createDivider());

    // Burndown Chart
    blocks.push(this.createHeading('🔥 Burndown Analysis', 2));
    blocks.push(this.createParagraph('Remaining work over time'));
    blocks.push(this.createParagraph(''));

    if (data.sprints && data.sprints.length > 0) {
      const burndownData = this.calculateBurndownData(data.sprints);
      const burndownChart = this.createBurndownChart(burndownData);

      blocks.push(this.createCodeBlock(burndownChart, 'text'));

      blocks.push(this.createParagraph(''));
      blocks.push(this.createCallout(
        `Remaining Tasks: ${burndownData.remaining}\nTotal Tasks: ${burndownData.total}\nProgress: ${burndownData.completion}%`,
        '🔥',
        burndownData.onTrack ? 'green_background' : 'yellow_background'
      ));
    } else {
      blocks.push(this.createParagraph('No data available for burndown analysis.'));
    }

    blocks.push(this.createDivider());

    // Task Distribution
    blocks.push(this.createHeading('📊 Task Distribution', 2));

    if (data.distribution) {
      // By Status
      blocks.push(this.createHeading('By Status', 3));
      const statusChart = this.createDistributionChart({
        'Completed': data.distribution.completed || 0,
        'In Progress': data.distribution.inProgress || 0,
        'Pending': data.distribution.pending || 0
      });
      blocks.push(this.createCodeBlock(statusChart, 'text'));

      blocks.push(this.createParagraph(''));

      // By Effort
      if (data.distribution.byEffort) {
        blocks.push(this.createHeading('By Effort Level', 3));
        const effortChart = this.createDistributionChart({
          'Low': data.distribution.byEffort.low || 0,
          'Medium': data.distribution.byEffort.medium || 0,
          'High': data.distribution.byEffort.high || 0
        });
        blocks.push(this.createCodeBlock(effortChart, 'text'));
        blocks.push(this.createParagraph(''));
      }

      // By Assignee
      if (data.distribution.byAssignee) {
        blocks.push(this.createHeading('By Assignee', 3));
        Object.entries(data.distribution.byAssignee).forEach(([assignee, count]) => {
          blocks.push(this.createBulletPoint(`${assignee}: ${count} tasks`));
        });
      }
    } else {
      blocks.push(this.createParagraph('No distribution data available.'));
    }

    blocks.push(this.createDivider());

    // Timeline View
    blocks.push(this.createHeading('📅 Timeline', 2));
    blocks.push(this.createParagraph('Sprint timeline and milestones'));
    blocks.push(this.createParagraph(''));

    if (data.sprints && data.sprints.length > 0) {
      data.sprints.forEach(sprint => {
        const status = sprint.status || 'pending';
        const icon = status === 'Complete' ? '✅' : status === 'In Progress' ? '🔄' : '⏸️';

        blocks.push(this.createCallout(
          `${icon} Sprint ${sprint.sprintNumber}: ${sprint.title}\n${sprint.duration || 'Duration not specified'}`,
          icon,
          status === 'Complete' ? 'green_background' : 'gray_background'
        ));
      });
    } else {
      blocks.push(this.createParagraph('No sprint timeline available.'));
    }

    blocks.push(this.createDivider());

    // Performance Insights
    blocks.push(this.createHeading('💡 Insights', 2));

    const insights = this.generateInsights(data, metrics);
    if (insights.length > 0) {
      insights.forEach(insight => {
        blocks.push(this.createBulletPoint(insight));
      });
    } else {
      blocks.push(this.createParagraph('Complete more sprints to see performance insights.'));
    }

    return blocks;
  }

  /**
   * Calculate key metrics from data
   * @param {object} data - Analytics data
   * @returns {object} Calculated metrics
   */
  calculateKeyMetrics(data) {
    const sprints = data.sprints || [];

    let totalTasks = 0;
    let completedTasks = 0;
    let completedSprints = 0;
    let sprintCompletions = [];

    sprints.forEach(sprint => {
      const tasks = sprint.tasks || [];
      totalTasks += tasks.length;

      const completed = tasks.filter(t => t.status === 'completed').length;
      completedTasks += completed;

      if (tasks.length > 0) {
        const completion = (completed / tasks.length) * 100;
        sprintCompletions.push(completion);

        if (completion === 100) {
          completedSprints++;
        }
      }
    });

    const avgSprintCompletion = sprintCompletions.length > 0
      ? Math.round(sprintCompletions.reduce((a, b) => a + b, 0) / sprintCompletions.length)
      : 0;

    return {
      totalSprints: sprints.length,
      completedSprints,
      totalTasks,
      completedTasks,
      overallCompletion: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      avgSprintCompletion
    };
  }

  /**
   * Create velocity chart (ASCII)
   * @param {array} sprints - Sprint data
   * @returns {string} ASCII chart
   */
  createVelocityChart(sprints) {
    let chart = 'Velocity Chart (Tasks Completed Per Sprint)\n\n';

    sprints.forEach(sprint => {
      const completed = sprint.tasks?.filter(t => t.status === 'completed').length || 0;
      const bar = '█'.repeat(completed);
      chart += `Sprint ${sprint.sprintNumber}: ${bar} ${completed}\n`;
    });

    return chart;
  }

  /**
   * Calculate burndown data
   * @param {array} sprints - Sprint data
   * @returns {object} Burndown data
   */
  calculateBurndownData(sprints) {
    let total = 0;
    let completed = 0;

    sprints.forEach(sprint => {
      const tasks = sprint.tasks || [];
      total += tasks.length;
      completed += tasks.filter(t => t.status === 'completed').length;
    });

    const remaining = total - completed;
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTrack = completion >= 50; // Simple heuristic

    return { total, completed, remaining, completion, onTrack };
  }

  /**
   * Create burndown chart (ASCII)
   * @param {object} data - Burndown data
   * @returns {string} ASCII chart
   */
  createBurndownChart(data) {
    let chart = 'Burndown Chart\n\n';
    chart += `Total:     ${'█'.repeat(data.total)} ${data.total}\n`;
    chart += `Completed: ${'█'.repeat(data.completed)} ${data.completed}\n`;
    chart += `Remaining: ${'░'.repeat(data.remaining)} ${data.remaining}\n`;
    return chart;
  }

  /**
   * Create distribution chart (ASCII)
   * @param {object} distribution - Distribution data
   * @returns {string} ASCII chart
   */
  createDistributionChart(distribution) {
    let chart = '';
    const maxValue = Math.max(...Object.values(distribution));

    Object.entries(distribution).forEach(([label, count]) => {
      const barLength = maxValue > 0 ? Math.round((count / maxValue) * 20) : 0;
      const bar = '█'.repeat(barLength);
      chart += `${label.padEnd(12)}: ${bar} ${count}\n`;
    });

    return chart;
  }

  /**
   * Generate insights from data
   * @param {object} data - Analytics data
   * @param {object} metrics - Calculated metrics
   * @returns {array} Array of insights
   */
  generateInsights(data, metrics) {
    const insights = [];

    if (metrics.avgSprintCompletion >= 80) {
      insights.push('🌟 Excellent sprint completion rate! Team is performing well.');
    } else if (metrics.avgSprintCompletion >= 50) {
      insights.push('✅ Good progress, but there\'s room for improvement in sprint completion.');
    } else if (metrics.avgSprintCompletion > 0) {
      insights.push('⚠️ Sprint completion rate is below target. Consider reducing sprint scope.');
    }

    if (metrics.completedSprints > 0) {
      insights.push(`✅ ${metrics.completedSprints} sprint(s) completed successfully.`);
    }

    if (metrics.overallCompletion >= 75) {
      insights.push('🎉 Project is nearing completion! Excellent progress.');
    }

    if (data.distribution?.byEffort) {
      const highEffortCount = data.distribution.byEffort.high || 0;
      const totalTasks = metrics.totalTasks;

      if (highEffortCount > totalTasks * 0.3) {
        insights.push('⚠️ High concentration of high-effort tasks. Consider breaking them down.');
      }
    }

    return insights;
  }

  /**
   * Validate analytics data
   * @param {object} data - Data to validate
   * @returns {boolean} Valid or not
   */
  validate(data) {
    return super.validate(data) && (data.sprints || data.distribution);
  }
}

module.exports = AnalyticsTemplate;
