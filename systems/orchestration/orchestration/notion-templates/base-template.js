/**
 * Base Notion Template
 * Abstract base class for all Notion templates
 */

class BaseNotionTemplate {
  /**
   * Create base template
   * @param {object} config - Template configuration
   */
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'Untitled Template';
    this.description = config.description || '';
  }

  /**
   * Generate template blocks
   * Must be implemented by subclasses
   * @param {object} data - Data to render
   * @returns {array} Array of Notion blocks
   */
  generate(data) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * Validate template data
   * @param {object} data - Data to validate
   * @returns {boolean} Valid or not
   */
  validate(data) {
    return data !== null && typeof data === 'object';
  }

  /**
   * Create heading block
   * @param {string} text - Heading text
   * @param {number} level - Heading level (1, 2, or 3)
   * @returns {object} Notion heading block
   */
  createHeading(text, level = 1) {
    const headingType = `heading_${level}`;
    return {
      object: 'block',
      type: headingType,
      [headingType]: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ]
      }
    };
  }

  /**
   * Create paragraph block
   * @param {string} text - Paragraph text
   * @param {boolean} bold - Bold text
   * @param {boolean} italic - Italic text
   * @returns {object} Notion paragraph block
   */
  createParagraph(text, bold = false, italic = false) {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: text },
            annotations: {
              bold: bold,
              italic: italic
            }
          }
        ]
      }
    };
  }

  /**
   * Create callout block
   * @param {string} text - Callout text
   * @param {string} icon - Icon emoji
   * @param {string} color - Background color
   * @returns {object} Notion callout block
   */
  createCallout(text, icon = '', color = 'gray_background') {
    return {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ],
        icon: {
          type: 'emoji',
          emoji: icon
        },
        color: color
      }
    };
  }

  /**
   * Create bulleted list item
   * @param {string} text - List item text
   * @returns {object} Notion bulleted list block
   */
  createBulletPoint(text) {
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ]
      }
    };
  }

  /**
   * Create divider block
   * @returns {object} Notion divider block
   */
  createDivider() {
    return {
      object: 'block',
      type: 'divider',
      divider: {}
    };
  }

  /**
   * Create code block
   * @param {string} code - Code content
   * @param {string} language - Programming language
   * @returns {object} Notion code block
   */
  createCodeBlock(code, language = 'javascript') {
    return {
      object: 'block',
      type: 'code',
      code: {
        rich_text: [
          {
            type: 'text',
            text: { content: code }
          }
        ],
        language: language
      }
    };
  }

  /**
   * Create quote block
   * @param {string} text - Quote text
   * @returns {object} Notion quote block
   */
  createQuote(text) {
    return {
      object: 'block',
      type: 'quote',
      quote: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ]
      }
    };
  }

  /**
   * Create toggle block with children
   * @param {string} text - Toggle header text
   * @param {array} children - Child blocks
   * @returns {object} Notion toggle block
   */
  createToggle(text, children = []) {
    return {
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ],
        children: children
      }
    };
  }

  /**
   * Create numbered list item
   * @param {string} text - List item text
   * @returns {object} Notion numbered list block
   */
  createNumberedListItem(text) {
    return {
      object: 'block',
      type: 'numbered_list_item',
      numbered_list_item: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ]
      }
    };
  }

  /**
   * Create to-do block
   * @param {string} text - To-do text
   * @param {boolean} checked - Checked state
   * @returns {object} Notion to-do block
   */
  createToDo(text, checked = false) {
    return {
      object: 'block',
      type: 'to_do',
      to_do: {
        rich_text: [
          {
            type: 'text',
            text: { content: text }
          }
        ],
        checked: checked
      }
    };
  }
}

module.exports = BaseNotionTemplate;
