# Contributing to Atlas One

Thanks for helping make N-ATLaS easy to build with.

## Ground rules

- **Never fake model output.** Nothing may substitute or simulate N-ATLaS; failures return a clear error.
- **Standards only.** MCP and OAuth by the specification, OpenAI-compatible API, no client-specific code.
- **Keep it small.** Every file and feature must earn its place; open an issue before large changes.
- **No secrets** in code, logs, tool output or tests.

## Develop

```bash
npm install && npm install --prefix web
npm test           # Worker tests inside workerd, then web tests
npm run dev        # local Worker (put local secrets in .dev.vars)
```

Architecture and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Pull requests

1. Branch from `main`; one change per pull request.
2. Add or update tests; `npm test` must pass.
3. Explain the why in the description, and link the issue.
4. Update the docs (README, docs/, the website's docs page) when behaviour changes.

## Reporting issues

Open a GitHub issue with steps to reproduce and, if relevant, the `x-atlas-request-id` of the failing request.
Report security problems privately to the maintainer rather than in a public issue.

By contributing, you agree your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
