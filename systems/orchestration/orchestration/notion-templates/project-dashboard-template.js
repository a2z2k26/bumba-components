/**
 * Project Dashboard Template
 * Generates comprehensive project overview dashboard in Notion
 */

const BaseNotionTemplate = require('./base-template');

class ProjectDashboardTemplate extends BaseNotionTemplate {
  constructor(config = {}) {
    super({
      name: 'Project Dashboard',
      description: 'Comprehensive project overview with metrics, sprints, and team info',
      ...config
    });
  }

  /**
   * Generate project dashboard blocks
   * @param {object} data - Project data
   * @param {object} data.project - Project info
   * @param {array} data.sprints - Sprint array
   * @param {object} data.progress - Progress metrics
   * @param {array} data.team - Team members
   * @returns {array} Array of Notion blocks
   */
  generate(data) {
    if (!this.validate(data)) {
      throw new Error('Invalid project data for dashboard template');
    }

    const blocks = [];
    const project = data.project || {};
    const sprints = data.sprints || [];
    const progress = data.progress || {};
    const team = data.team || [];

    // Header
    blocks.push(this.createHeading('📊 Project Dashboard', 1));
    blocks.push(this.createParagraph(project.description || 'Project overview dashboard'));
    blocks.push(this.createDivider());

    // Project Overview Section
    blocks.push(this.createHeading('Project Overview', 2));

    const overviewItems = [
      `**Title:** ${project.title || 'Untitled Project'}`,
      `**Status:** ${project.status || 'Not Started'}`,
      `**Duration:** ${project.estimatedDuration || 'Not specified'}`,
      `**Start Date:** ${project.startDate || 'TBD'}`,
      `**End Date:** ${project.endDate || 'TBD'}`
    ];

    overviewItems.forEach(item => {
      blocks.push(this.createParagraph(item));
    });

    blocks.push(this.createDivider());

    // Progress Metrics Section
    blocks.push(this.createHeading('📈 Progress Metrics', 2));

    if (progress.totalTasks) {
      const completionRate = progress.completionPercentage || 0;
      const progressBar = this.createProgressBar(completionRate);

      blocks.push(this.createCallout(
        `Overall Progress: ${completionRate}% Complete\n${progressBar}`,
        '📊',
        'blue_background'
      ));

      blocks.push(this.createParagraph(''));
      blocks.push(this.createBulletPoint(`Total Tasks: ${progress.totalTasks}`));
      blocks.push(this.createBulletPoint(`✅ Completed: ${progress.completedTasks || 0}`));
      blocks.push(this.createBulletPoint(`🔄 In Progress: ${progress.inProgressTasks || 0}`));
      blocks.push(this.createBulletPoint(`⏸️ Pending: ${progress.pendingTasks || 0}`));
    } else {
      blocks.push(this.createCallout(
        'No progress data available. Start adding tasks to see metrics!',
        '💡',
        'gray_background'
      ));
    }

    blocks.push(this.createDivider());

    // Sprint Summary Section
    blocks.push(this.createHeading('🏃 Sprint Summary', 2));

    if (sprints && sprints.length > 0) {
      blocks.push(this.createParagraph(`Total Sprints: ${sprints.length}`));
      blocks.push(this.createParagraph(''));

      sprints.forEach((sprint, index) => {
        const sprintProgress = progress.sprintProgress?.find(s => s.sprintNumber === sprint.sprintNumber);
        const completion = sprintProgress?.completionPercentage || 0;

        const sprintSummary = [
          `**Sprint ${sprint.sprintNumber}:** ${sprint.title}`,
          `Goal: ${sprint.goal || 'Not specified'}`,
          `Progress: ${completion}% (${sprintProgress?.completed || 0}/${sprintProgress?.totalTasks || 0} tasks)`
        ].join('\n');

        blocks.push(this.createCallout(
          sprintSummary,
          this.getSprintIcon(completion),
          this.getSprintColor(completion)
        ));
      });
    } else {
      blocks.push(this.createParagraph('No sprints defined yet.'));
    }

    blocks.push(this.createDivider());

    // Team Section
    blocks.push(this.createHeading('👥 Team', 2));

    if (team && team.length > 0) {
      team.forEach(member => {
        blocks.push(this.createBulletPoint(`${member.name} - ${member.role || 'Team Member'}`));
      });
    } else {
      blocks.push(this.createParagraph('Team members will be listed here.'));
    }

    blocks.push(this.createDivider());

    // Recent Activity Section
    blocks.push(this.createHeading('📝 Recent Activity', 2));
    blocks.push(this.createParagraph('Latest updates and changes will appear here.'));

    if (data.recentActivity && data.recentActivity.length > 0) {
      data.recentActivity.slice(0, 5).forEach(activity => {
        blocks.push(this.createBulletPoint(`${activity.timestamp}: ${activity.description}`));
      });
    }

    blocks.push(this.createDivider());

    // Quick Links Section
    blocks.push(this.createHeading('🔗 Quick Links', 2));
    blocks.push(this.createBulletPoint('View All Sprints'));
    blocks.push(this.createBulletPoint('View All Tasks'));
    blocks.push(this.createBulletPoint('View Analytics Dashboard'));
    blocks.push(this.createBulletPoint('View Team Assignments'));

    return blocks;
  }

  /**
   * Create progress bar visualization
   * @param {number} percentage - Completion percentage (0-100)
   * @returns {string} Progress bar string
   */
  createProgressBar(percentage) {
    const filled = Math.round(percentage / 5); // 20 blocks total
    const empty = 20 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${percentage}%`;
  }

  /**
   * Get icon for sprint based on completion
   * @param {number} completion - Completion percentage
   * @returns {string} Emoji icon
   */
  getSprintIcon(completion) {
    if (completion === 100) return '✅';
    if (completion > 0) return '🔄';
    return '⏸️';
  }

  /**
   * Get color for sprint based on completion
   * @param {number} completion - Completion percentage
   * @returns {string} Notion color
   */
  getSprintColor(completion) {
    if (completion === 100) return 'green_background';
    if (completion > 50) return 'blue_background';
    if (completion > 0) return 'yellow_background';
    return 'gray_background';
  }

  /**
   * Validate project dashboard data
   * @param {object} data - Data to validate
   * @returns {boolean} Valid or not
   */
  validate(data) {
    return super.validate(data) && (data.project || data.sprints);
  }
}

module.exports = ProjectDashboardTemplate;
