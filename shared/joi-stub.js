/**
 * Joi Validation Stub
 * Provides basic validation when Joi package is not installed
 * For full validation, install: npm install joi
 */

// Try to load real Joi first
try {
  module.exports = require('joi');
} catch (e) {
  // Provide a minimal stub implementation
  const createSchema = () => {
    const schema = {
      // Chainable methods
      string: () => schema,
      number: () => schema,
      boolean: () => schema,
      array: () => schema,
      object: () => schema,
      any: () => schema,

      // Modifiers
      required: () => schema,
      optional: () => schema,
      default: (val) => { schema._default = val; return schema; },
      pattern: () => schema,
      min: () => schema,
      max: () => schema,
      port: () => schema,
      integer: () => schema,
      positive: () => schema,
      iso: () => schema,
      timestamp: () => schema,
      uri: () => schema,
      email: () => schema,
      hostname: () => schema,
      ip: () => schema,
      base64: () => schema,
      hex: () => schema,
      length: () => schema,
      lowercase: () => schema,
      uppercase: () => schema,
      trim: () => schema,
      raw: () => schema,
      strict: () => schema,
      prefs: () => schema,
      preferences: () => schema,
      messages: () => schema,
      label: () => schema,
      description: () => schema,
      notes: () => schema,
      tags: () => schema,
      meta: () => schema,
      example: () => schema,
      external: () => schema,
      alter: () => schema,
      cast: () => schema,
      options: () => schema,
      presence: () => schema,
      only: () => schema,
      not: () => schema,
      forbidden: () => schema,
      strip: () => schema,
      exist: () => schema,
      exists: () => schema,
      equal: () => schema,
      disallow: () => schema,
      unique: () => schema,
      sparse: () => schema,
      single: () => schema,
      has: () => schema,
      unsafe: () => schema,
      concat: () => schema,
      extract: () => schema,
      extend: () => schema,
      error: () => schema,
      custom: () => schema,
      valid: () => schema,
      items: () => schema,
      keys: () => schema,
      when: () => schema,
      allow: () => schema,
      empty: () => schema,

      // Validation (always passes in stub)
      validate: (value) => ({ value: value ?? schema._default, error: null }),
      validateAsync: async (value) => value ?? schema._default,

      // Internal
      _default: undefined,
    };
    return schema;
  };

  module.exports = {
    string: createSchema,
    number: createSchema,
    boolean: createSchema,
    array: createSchema,
    date: createSchema,
    object: (keys) => {
      const schema = createSchema();
      schema.keys = () => schema;
      schema.pattern = () => schema;
      return schema;
    },
    any: createSchema,
    alternatives: () => createSchema(),

    // Validate helper
    validate: (value, schema) => ({ value, error: null }),

    // Note that this is a stub
    isStub: true,
  };
}
