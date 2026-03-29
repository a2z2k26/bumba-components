/**
 * Sprint Template
 * Generates individual sprint pages with goals, tasks, and progress
 */

const BaseNotionTemplate = require('./base-template');

class SprintTemplate extends BaseNotionTemplate {
  constructor(config = {}) {
    super({
      name: 'Sprint Template',
      description: 'Individual sprint page with goals, timeline, and task breakdown',
      ...config
    });
  }

  /**
   * Generate sprint page blocks
   * @param {object} data - Sprint data
   * @param {number} data.sprintNumber - Sprint number
   * @param {string} data.title - Sprint title
   * @param {string} data.goal - Sprint goal
   * @param {string} data.duration - Sprint duration
   * @param {string} data.status - Sprint status
   * @param {array} data.tasks - Sprint tasks
   * @returns {array} Array of Notion blocks
   */
  generate(data) {
    if (!this.validate(data)) {
      throw new Error('Invalid sprint data for template');
    }

    const blocks = [];

    // Sprint Header
    blocks.push(this.createHeading(`🏃 Sprint ${data.sprintNumber}: ${data.title}`, 1));
    blocks.push(this.createParagraph(`Status: ${data.status || 'Pending'}`));
    blocks.push(this.createDivider());

    // Sprint Goal
    blocks.push(this.createHeading('🎯 Sprint Goal', 2));
    blocks.push(this.createCallout(
      data.goal || 'Sprint goal not defined',
      '🎯',
      'blue_background'
    ));
    blocks.push(this.createParagraph(''));

    // Sprint Details
    blocks.push(this.createHeading('📅 Sprint Details', 2));
    blocks.push(this.createBulletPoint(`Duration: ${data.duration || 'Not specified'}`));
    blocks.push(this.createBulletPoint(`Sprint Number: ${data.sprintNumber}`));

    if (data.startDate) {
      blocks.push(this.createBulletPoint(`Start Date: ${data.startDate}`));
    }
    if (data.endDate) {
      blocks.push(this.createBulletPoint(`End Date: ${data.endDate}`));
    }

    blocks.push(this.createDivider());

    // Tasks Section
    blocks.push(this.createHeading('✅ Tasks', 2));

    if (data.tasks && data.tasks.length > 0) {
      const tasksByStatus = this.groupTasksByStatus(data.tasks);

      // Completed tasks
      if (tasksByStatus.completed.length > 0) {
        blocks.push(this.createHeading('Completed', 3));
        tasksByStatus.completed.forEach(task => {
          blocks.push(this.createToDo(
            `${task.title} (${task.taskId})`,
            true
          ));
        });
        blocks.push(this.createParagraph(''));
      }

      // In Progress tasks
      if (tasksByStatus.inProgress.length > 0) {
        blocks.push(this.createHeading('In Progress', 3));
        tasksByStatus.inProgress.forEach(task => {
          blocks.push(this.createCallout(
            `🔄 ${task.title}\n${task.description || 'No description'}`,
            '🔄',
            'yellow_background'
          ));
        });
        blocks.push(this.createParagraph(''));
      }

      // Pending tasks
      if (tasksByStatus.pending.length > 0) {
        blocks.push(this.createHeading('Pending', 3));
        tasksByStatus.pending.forEach(task => {
          blocks.push(this.createToDo(
            `${task.title} (${task.taskId})`,
            false
          ));
        });
      }

      // Task Summary
      blocks.push(this.createDivider());
      blocks.push(this.createHeading('📊 Task Summary', 2));
      blocks.push(this.createBulletPoint(`Total Tasks: ${data.tasks.length}`));
      blocks.push(this.createBulletPoint(`✅ Completed: ${tasksByStatus.completed.length}`));
      blocks.push(this.createBulletPoint(`🔄 In Progress: ${tasksByStatus.inProgress.length}`));
      blocks.push(this.createBulletPoint(`⏸️ Pending: ${tasksByStatus.pending.length}`));

      const completion = data.tasks.length > 0
        ? Math.round((tasksByStatus.completed.length / data.tasks.length) * 100)
        : 0;

      blocks.push(this.createParagraph(''));
      blocks.push(this.createCallout(
        `Sprint Completion: ${completion}%`,
        completion === 100 ? '✅' : '📊',
        completion === 100 ? 'green_background' : 'blue_background'
      ));
    } else {
      blocks.push(this.createParagraph('No tasks defined for this sprint yet.'));
    }

    blocks.push(this.createDivider());

    // Dependencies (if any)
    if (data.tasks) {
      const tasksWithDeps = data.tasks.filter(t => t.dependencies && t.dependencies.length > 0);
      if (tasksWithDeps.length > 0) {
        blocks.push(this.createHeading('🔗 Task Dependencies', 2));
        tasksWithDeps.forEach(task => {
          blocks.push(this.createBulletPoint(
            `${task.title} depends on: ${task.dependencies.join(', ')}`
          ));
        });
        blocks.push(this.createDivider());
      }
    }

    // Sprint Notes
    blocks.push(this.createHeading('📝 Sprint Notes', 2));
    if (data.notes) {
      blocks.push(this.createParagraph(data.notes));
    } else {
      blocks.push(this.createParagraph('Add notes, learnings, or retrospective items here.'));
    }

    return blocks;
  }

  /**
   * Group tasks by status
   * @param {array} tasks - Array of tasks
   * @returns {object} Tasks grouped by status
   */
  groupTasksByStatus(tasks) {
    return {
      completed: tasks.filter(t => t.status === 'completed'),
      inProgress: tasks.filter(t => t.status === 'in-progress'),
      pending: tasks.filter(t => t.status === 'pending' || !t.status)
    };
  }

  /**
   * Validate sprint data
   * @param {object} data - Data to validate
   * @returns {boolean} Valid or not
   */
  validate(data) {
    return super.validate(data) &&
           data.sprintNumber !== undefined &&
           data.title;
  }
}

module.exports = SprintTemplate;
