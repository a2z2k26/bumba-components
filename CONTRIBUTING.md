# Contributing to the BUMBA Ecosystem

Thanks for your interest in contributing. This repo houses a workspace of independent primitives and systems — most contributions are scoped to a single package.

## Getting started

```bash
git clone https://github.com/a2z2k26/agent-primitives.git
cd agent-primitives
npm install
```

Each package under `primitives/*` and `systems/*` is its own npm workspace. You can run scripts inside an individual package the usual way:

```bash
cd primitives/rate-limiter
npm test
```

Or across the entire workspace from the root:

```bash
npm test --workspaces --if-present
```

## How to contribute

### Reporting issues

- Search existing issues before opening a new one.
- Include the package affected, your Node version, and a minimal reproduction.
- For feature requests, describe the use case before proposing an API.

### Pull requests

1. Fork and create a branch from `main`.
2. Keep the change scoped — one package and one concern per PR is ideal.
3. Add or update tests where applicable.
4. Update the package's README if the public API changes.
5. Run `npm test --workspaces --if-present` and `npm run lint` before opening the PR.
6. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

### Code style

- Match the surrounding code. We use ESLint at the workspace root.
- Prefer immutability — return new objects rather than mutating inputs.
- Keep modules focused. If a primitive is doing more than one thing, it probably needs to be split.
- All modules should extend `EventEmitter` where lifecycle events are useful.

### Adding a new primitive or system

- Primitives live in `primitives/*` and should have minimal external dependencies.
- Systems live in `systems/*` and may compose primitives plus `@bumba/shared`.
- Each package needs:
  - `package.json` with a unique name under the `@bumba/` scope (or a flat name)
  - `README.md` with install, usage, and API sections
  - At least one happy-path test in `test/` or `tests/`
  - A clear single responsibility

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
