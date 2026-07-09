---
description: Generate a Conventional Commit message for the current Git changes
allowed-tools:
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git log:*)
---

Generate a professional Git commit message following the Conventional Commits v1.0.0 specification.

## Workflow

1. Run `git status --short`.
2. If staged changes exist, analyze `git diff --staged`.
3. Otherwise, analyze `git diff`.
4. Run `git log -10 --oneline` to learn the repository's existing style.
5. Determine whether the changes represent a single logical commit.
   - If not, do NOT generate a commit message.
   - Instead, explain why the changes should be split and suggest the separate commits.

## Commit Rules

Use the format:

<type>(<scope>): <subject>

<body>

<footer>

### Types

Choose exactly one:

- feat → New feature
- fix → Bug fix
- refactor → Internal code improvement without behavior change
- perf → Performance improvement
- docs → Documentation only
- test → Add or update tests
- build → Build system or dependencies
- ci → CI/CD changes
- chore → Maintenance or tooling
- revert → Revert a previous commit

### Scope

- Infer the scope from the affected module when appropriate.
- Examples:
  - auth
  - api
  - ui
  - survey
  - booking
  - database
  - docker
- Omit the scope if none is meaningful.

### Subject

- Imperative mood.
- Present tense.
- No trailing period.
- Maximum 72 characters.
- Describe the primary intent.
- Never use vague subjects such as:
  - Update
  - Changes
  - Misc
  - WIP
  - Fix stuff

### Body

Include only when useful.

Explain:

- Why the change was made.
- What problem it solves.

Do NOT repeat the diff.

Wrap lines at approximately 72 characters.

### Footer

Include only when applicable, for example:

BREAKING CHANGE: ...
Closes #123
Refs #456

## Output

Output ONLY the commit message inside a fenced code block.

Do NOT:

- run `git add`
- run `git commit`
- modify any files
- add explanations before or after the code block

If there are no staged or unstaged changes, state that there are no changes to commit.
