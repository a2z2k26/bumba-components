/**
 * Task Template
 * Generates detailed task pages with description, acceptance criteria, and status
 */

const BaseNotionTemplate = require('./base-template');

class TaskTemplate extends BaseNotionTemplate {
  constructor(config = {}) {
    super({
      name: 'Task Template',
      description: 'Detailed task page with description, acceptance criteria, and checklists',
      ...config
    });
  }

  /**
   * Generate task page blocks
   * @param {object} data - Task data
   * @param {string} data.taskId - Task ID
   * @param {string} data.title - Task title
   * @param {string} data.description - Task description
   * @param {string} data.status - Task status
   * @param {string} data.effort - Effort level
   * @param {array} data.tags - Task tags
   * @param {string} data.assignee - Task assignee
   * @param {array} data.dependencies - Task dependencies
   * @param {array} data.acceptanceCriteria - Acceptance criteria
   * @returns {array} Array of Notion blocks
   */
  generate(data) {
    if (!this.validate(data)) {
      throw new Error('Invalid task data for template');
    }

    const blocks = [];

    // Task Header
    const statusIcon = this.getStatusIcon(data.status);
    blocks.push(this.createHeading(`${statusIcon} ${data.title}`, 1));
    blocks.push(this.createParagraph(`Task ID: ${data.taskId || 'Not assigned'}`));
    blocks.push(this.createDivider());

    // Task Metadata
    blocks.push(this.createHeading(' Task Information', 2));

    const metadataItems = [];
    metadataItems.push(`**Status:** ${data.status || 'pending'}`);
    metadataItems.push(`**Effort:** ${data.effort || 'Not specified'}`);

    if (data.assignee) {
      metadataItems.push(`**Assignee:** ${data.assignee}`);
    }

    if (data.tags && data.tags.length > 0) {
      metadataItems.push(`**Tags:** ${data.tags.join(', ')}`);
    }

    metadataItems.forEach(item => {
      blocks.push(this.createParagraph(item));
    });

    blocks.push(this.createDivider());

    // Task Description
    blocks.push(this.createHeading(' Description', 2));
    if (data.description) {
      blocks.push(this.createParagraph(data.description));
    } else {
      blocks.push(this.createParagraph('Add a detailed description of what needs to be done.'));
    }

    blocks.push(this.createDivider());

    // Acceptance Criteria
    blocks.push(this.createHeading(' Acceptance Criteria', 2));

    if (data.acceptanceCriteria && data.acceptanceCriteria.length > 0) {
      data.acceptanceCriteria.forEach(criterion => {
        blocks.push(this.createToDo(criterion, false));
      });
    } else {
      blocks.push(this.createParagraph('Define clear acceptance criteria for this task.'));
      blocks.push(this.createParagraph(''));
      blocks.push(this.createParagraph('Example criteria:'));
      blocks.push(this.createToDo('Unit tests passing', false));
      blocks.push(this.createToDo('Code reviewed and approved', false));
      blocks.push(this.createToDo('Documentation updated', false));
    }

    blocks.push(this.createDivider());

    // Implementation Steps
    blocks.push(this.createHeading(' Implementation Steps', 2));

    if (data.steps && data.steps.length > 0) {
      data.steps.forEach((step, index) => {
        blocks.push(this.createNumberedListItem(step));
      });
    } else {
      blocks.push(this.createParagraph('Break down the task into specific steps:'));
      blocks.push(this.createParagraph(''));
      blocks.push(this.createNumberedListItem('Step 1: ...'));
      blocks.push(this.createNumberedListItem('Step 2: ...'));
      blocks.push(this.createNumberedListItem('Step 3: ...'));
    }

    blocks.push(this.createDivider());

    // Dependencies
    if (data.dependencies && data.dependencies.length > 0) {
      blocks.push(this.createHeading(' Dependencies', 2));
      blocks.push(this.createCallout(
        `This task depends on: ${data.dependencies.join(', ')}`,
        '',
        'yellow_background'
      ));
      blocks.push(this.createParagraph(''));
      blocks.push(this.createParagraph('Complete these tasks first:'));

      data.dependencies.forEach(dep => {
        blocks.push(this.createBulletPoint(dep));
      });

      blocks.push(this.createDivider());
    }

    // Technical Notes
    blocks.push(this.createHeading(' Technical Notes', 2));

    if (data.technicalNotes) {
      blocks.push(this.createParagraph(data.technicalNotes));
    } else {
      blocks.push(this.createParagraph('Add technical considerations, API references, or implementation notes here.'));
    }

    if (data.codeSnippet) {
      blocks.push(this.createParagraph(''));
      blocks.push(this.createCodeBlock(data.codeSnippet, data.language || 'javascript'));
    }

    blocks.push(this.createDivider());

    // Testing Notes
    blocks.push(this.createHeading(' Testing', 2));

    if (data.testingNotes) {
      blocks.push(this.createParagraph(data.testingNotes));
    } else {
      blocks.push(this.createParagraph('Testing approach and scenarios:'));
      blocks.push(this.createParagraph(''));
      blocks.push(this.createBulletPoint('Unit tests: ...'));
      blocks.push(this.createBulletPoint('Integration tests: ...'));
      blocks.push(this.createBulletPoint('Manual testing: ...'));
    }

    blocks.push(this.createDivider());

    // Comments/Discussion
    blocks.push(this.createHeading(' Discussion', 2));
    blocks.push(this.createParagraph('Add comments, questions, or discussion points here.'));

    // Effort Estimate Callout
    if (data.effort) {
      blocks.push(this.createDivider());
      blocks.push(this.createCallout(
        `Estimated Effort: ${data.effort.toUpperCase()}`,
        this.getEffortIcon(data.effort),
        this.getEffortColor(data.effort)
      ));
    }

    return blocks;
  }

  /**
   * Get icon for status
   * @param {string} status - Task status
   * @returns {string} Emoji icon
   */
  getStatusIcon(status) {
    const icons = {
      'completed': '',
      'in-progress': '',
      'pending': '⏸',
      'blocked': ''
    };
    return icons[status] || '';
  }

  /**
   * Get icon for effort
   * @param {string} effort - Effort level
   * @returns {string} Emoji icon
   */
  getEffortIcon(effort) {
    const icons = {
      'low': '',
      'medium': '',
      'high': ''
    };
    return icons[effort] || '';
  }

  /**
   * Get color for effort
   * @param {string} effort - Effort level
   * @returns {string} Notion color
   */
  getEffortColor(effort) {
    const colors = {
      'low': 'green_background',
      'medium': 'yellow_background',
      'high': 'red_background'
    };
    return colors[effort] || 'gray_background';
  }

  /**
   * Validate task data
   * @param {object} data - Data to validate
   * @returns {boolean} Valid or not
   */
  validate(data) {
    return super.validate(data) && data.title;
  }
}

module.exports = TaskTemplate;
