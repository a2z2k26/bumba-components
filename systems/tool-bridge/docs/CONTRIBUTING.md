#  Contributing to Tool Bridge

**Building Unified Multi-agent Business Applications**

First off, thank you for considering contributing to Tool Bridge! It's people like you that make Tool Bridge such a great tool.

##  Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

##  How Can I Contribute?

###  Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible using our issue template.

###  Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Create an issue and provide the following information:

- Use a clear and descriptive title
- Provide a step-by-step description of the suggested enhancement
- Provide specific examples to demonstrate the steps
- Describe the current behavior and explain which behavior you expected to see instead

###  Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code follows the existing style
6. Issue that pull request!

##  Development Setup

1. Fork and clone the repository
```bash
git clone https://github.com/a2z2k26/agent-primitives.git
cd tool-bridge
```

2. Install dependencies
```bash
npm install
```

3. Create a branch
```bash
git checkout -b feature/your-feature-name
```

4. Make your changes and test
```bash
npm test
npm run lint
```

5. Commit your changes
```bash
git add .
git commit -m "feat: add new feature"
```

###  Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only changes
- `style:` Code style changes (formatting, etc)
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding missing tests
- `chore:` Changes to the build process or auxiliary tools

##  Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Run security audit
npm audit
```

##  Documentation

- Update README.md with details of changes to the interface
- Update the docs/ folder with any new guides or API documentation
- Comment your code where necessary
- Update the CHANGELOG.md with your changes

##  Questions?

Feel free to open an issue with your question or reach out to the maintainers.

Thank you for contributing!
