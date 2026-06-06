```
███████╗██╗███╗   ███╗██╗██╗   ██╗ █████╗ ██╗  ██╗
██╔════╝██║████╗ ████║██║╚██╗ ██╔╝██╔══██╗██║  ██║
███████╗██║██╔████╔██║██║ ╚████╔╝ ███████║███████║
╚════██║██║██║╚██╔╝██║██║  ╚██╔╝  ██╔══██║██╔══██║
███████║██║██║ ╚═╝ ██║██║   ██║   ██║  ██║██║  ██║
╚══════╝╚═╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
```

# CONTRIBUTING TO Command Routing

╔══════════════════════════════════════════════════════════════════╗
║  **Community Guidelines** • Part of the Agent Primitives         ║
║ Building Unified Multi-agent Business Applications               ║
╚══════════════════════════════════════════════════════════════════╝

First off, thank you for considering contributing to Command Routing! It's people like you that make Command Routing such a great tool for the BUMBA platform.

##  Code of Conduct

By participating in this project, you are expected to uphold our principles of respectful and constructive collaboration.

---

##  How Can I Contribute?

###  Reporting Bugs
**Backend Engineering Support**

Before creating bug reports, please check existing issues as you might find that you don't need to create one. When you are creating a bug report, please include as many details as possible:

╔══════════════════════════════════════════════════════════════════╗
║                    **Bug Report Template**                       ║
╠══════════════════════════════════════════════════════════════════╣
║ • Use a clear and descriptive title                             ║
║ • Describe the exact steps which reproduce the problem          ║
║ • Provide specific examples to demonstrate the steps            ║
║ • Describe the behavior you observed after following the steps  ║
║ • Explain which behavior you expected to see instead and why    ║
║ • Include code samples and error messages if applicable         ║
╚══════════════════════════════════════════════════════════════════╝

###  Suggesting Enhancements
**Strategic Product Development**

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

╔══════════════════════════════════════════════════════════════════╗
║                 **Enhancement Request Template**                 ║
╠══════════════════════════════════════════════════════════════════╣
║ • Use a clear and descriptive title                             ║
║ • Provide a step-by-step description of the enhancement         ║
║ • Provide specific examples to demonstrate the steps            ║
║ • Describe the current behavior vs expected behavior            ║
║ • Explain why this enhancement would be useful                  ║
╚══════════════════════════════════════════════════════════════════╝

---

##  Development Process

###  Local Development Setup

```bash
# Clone the repository
git clone https://github.com/a2z2k26/agent-primitives.git
cd command-routing

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

###  Pull Request Process

1. **Fork & Branch** - Create your feature branch (`git checkout -b feature/amazing-feature`)
2. **Code** - Make your changes following our style guidelines
3. **Test** - Ensure all tests pass (`npm test`)
4. **Commit** - Commit with a descriptive message
5. **Push** - Push to your branch (`git push origin feature/amazing-feature`)
6. **PR** - Open a Pull Request with comprehensive description

###  Testing Requirements

All contributions must include:
- Unit tests for new functionality
- Integration tests for system changes
- Documentation updates as needed
- Passing CI/CD checks

---

##  Style Guidelines

### JavaScript/Node.js Conventions

```javascript
//  Good - Clear intent, proper async handling
router.registerHandler('build', async (analysis, context) => {
  // Implementation
  return { status: 'success' };
});

//  Bad - No error handling, unclear naming
router.registerHandler('b', (a) => {
  // Implementation
});
```

### Commit Messages

Follow the conventional commits specification:

```
feat: add new middleware support
fix: resolve memory leak in stats collection
docs: update API documentation
test: add integration tests for router
```

---

##  Recognition

Contributors will be recognized in our:
- README contributors section
- Release notes
- Annual BUMBA platform report

---

<div align="center">

**Building Unified Multi-agent Business Applications**

*Professional • Intelligent • Secure*

Thank you for contributing to Command Routing!

</div>