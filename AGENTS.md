# Repository Guidelines

## Project Scope

Build a Chrome extension that captures terms of service, privacy policies, and subscription terms and produces a structured risk report. Reports must include a risk score, risky clauses, original-text quotations, and plain Turkish explanations. Clearly display that the application does not provide legal advice.

## Project Structure & Module Organization

The repository currently contains no application scaffold. Use these proposed directories when implementation begins:

- `src/extension/`: manifest, content scripts, background logic, and report UI.
- `src/analysis/`: LLM integration, JSON schema, evidence validation, and scoring.
- `tests/`: unit tests and security fixtures.
- `cypress/`: end-to-end tests and demo recording scenarios.
- `eval/`: annotations, source references, and results for at least five real policy texts.
- `assets/`: extension icons and static resources.

Document the implemented architecture and data flow in `README.md`.

## Build, Test, and Development Commands

No package manifest, build scripts, or test runner currently exists. Do not assume that `npm test` or `npm run build` works. Once tooling is selected, define and document commands for local development, production builds, unit tests, Cypress runs, and evaluation. Include instructions for loading the unpacked extension in Chrome.

## Coding Style & Naming Conventions

Use two-space indentation for JavaScript, TypeScript, and JSON. Prefer `camelCase` for functions and variables and `PascalCase` for types and components. Keep capture, analysis, validation, and rendering separate. Configure formatting and linting when scaffolding; no such tools are currently installed.

## Testing Guidelines

Use Cypress for end-to-end tests and a demo video of at most 90 seconds. Show both successful analysis and honest uncertainty. Cover malformed JSON, unsupported claims, quotation mismatches, and hidden prompt-injection instructions. Evaluation must report detected clauses, missed clauses, and false alarms. Select a unit-test framework during implementation.

## Commit & Pull Request Guidelines

No Git history exists. Use concise, imperative commit subjects, such as `Add quotation validation`. Pull requests should explain changes, provide verification results, link relevant issues, and include screenshots for UI changes.

## Security & Configuration

Treat page content as untrusted data. Validate LLM output deterministically against a JSON schema and reject claims without matching source quotations. Use your own LLM key; never commit credentials. Document Alibaba page-agent integration and its permissions; its demo LLM is only for experimentation.
