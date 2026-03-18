---
name: git-workflow
display_name: Git Workflow
description: Git branching, conventional commits, PR best practices, merge strategies, hooks, and conflict resolution for team development
category: workflow
version: 1.0.0
author: inbharatai
tags:
  - git
  - workflow
  - commits
  - pull-requests
  - branching
---

# Git Workflow

Standardized Git practices for clean history, reviewable PRs, and predictable releases.

## When to Use

- Creating branches for new work
- Writing commit messages
- Preparing a PR for review
- Resolving merge conflicts
- Setting up Git hooks
- Cleaning up messy commit history before merge

## When NOT to Use

- The repository uses a different documented workflow (follow theirs)
- Trivial single-file fixes where the overhead of branching is unnecessary

## Branch Naming

```
feature/MAS-42-add-circuit-breaker-dashboard
bugfix/MAS-108-fix-stale-closure-in-chat
hotfix/MAS-201-patch-jwt-expiry-check
release/v0.2.0
chore/update-dependencies-march-2026
```

Format: `<type>/<ticket-id>-<short-kebab-description>`

| Prefix      | Use Case                                   |
| ----------- | ------------------------------------------ |
| `feature/`  | New functionality                          |
| `bugfix/`   | Bug fix (goes through normal review)       |
| `hotfix/`   | Critical production fix (expedited review) |
| `release/`  | Release preparation branch                 |
| `chore/`    | Maintenance, deps, CI changes              |
| `refactor/` | Code restructuring without behavior change |

Branch from `main` for features/bugfixes. Branch from the release tag for hotfixes.

## Conventional Commits

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type       | When to Use                                          |
| ---------- | ---------------------------------------------------- |
| `feat`     | New feature visible to users                         |
| `fix`      | Bug fix                                              |
| `refactor` | Code change that neither fixes nor adds features     |
| `perf`     | Performance improvement                              |
| `test`     | Adding or updating tests                             |
| `docs`     | Documentation only                                   |
| `chore`    | Build process, deps, CI, tooling                     |
| `style`    | Formatting, whitespace, semicolons (no logic change) |
| `ci`       | CI/CD configuration changes                          |

### Scope

Use the module or component name: `feat(agent)`, `fix(gui/chat)`, `chore(deps)`, `refactor(swarm/executor)`.

### Subject Rules

- Imperative mood: "add feature" not "added feature" or "adds feature"
- No period at the end
- Max 72 characters
- Lowercase first letter

### Breaking Changes

```
feat(api)!: remove v1 agent endpoints

BREAKING CHANGE: The /api/v1/agents/* endpoints have been removed.
Migrate to /api/v2/agents/* which uses cursor-based pagination.
```

The `!` after scope signals a breaking change. The `BREAKING CHANGE:` footer provides migration details.

### Examples

```
feat(swarm): add task dependency graph visualization

fix(agent): prevent approve_always from leaking across swarm lifecycle

perf(gui): virtualize file tree for repos with 10k+ files

refactor(agent/src/index): extract tool executor into separate module

Splits the 1136-line index.js into focused modules:
- toolExecutor.js (tool selection and execution)
- permissionGate.js (permission checking)
- sessionManager.js (session lifecycle)

chore(deps): upgrade vite to 6.x and vitest to 3.x
```

## Pull Request Best Practices

### Size

- Target **under 400 lines changed** (excluding tests and generated files)
- If larger, split into stacked PRs or sequential PRs with clear dependencies
- Single-concern PRs: one feature, one bug fix, or one refactoring — not mixed

### PR Title

Follow conventional commit format: `feat(scope): short description`

### PR Description Template

```markdown
## Summary

- What changed and why (1-3 bullets)

## Changes

- Specific technical changes made

## Testing

- How it was tested (unit tests, manual steps, screenshots)

## Screenshots

(for UI changes — before/after comparison)

## Checklist

- [ ] Tests added/updated
- [ ] No new lint warnings
- [ ] Conventional commit messages
- [ ] Documentation updated (if applicable)
```

### Review Etiquette

- Respond to all comments before requesting re-review
- Use "Resolve conversation" only after the reviewer confirms
- If you disagree with feedback, explain your reasoning — do not just dismiss

## Merge Strategies

| Strategy                  | When to Use                                         |
| ------------------------- | --------------------------------------------------- |
| **Squash merge**          | Feature branches — creates one clean commit on main |
| **Merge commit**          | Release branches — preserves full history           |
| **Rebase + fast-forward** | Small changes where linear history matters          |

**Default: squash merge for feature/bugfix branches.**

The squash commit message should be the PR title (conventional commit format).

## Git Hooks

### pre-commit

```bash
#!/bin/sh
# Lint staged files only (fast)
npx lint-staged

# Type check
npx tsc --noEmit --pretty
```

### commit-msg

```bash
#!/bin/sh
# Validate conventional commit format
npx --no -- commitlint --edit "$1"
```

### pre-push

```bash
#!/bin/sh
# Run tests before pushing
npm test
```

Use `husky` to manage hooks. Configure `lint-staged` to only lint changed files for speed.

## Interactive Rebase (Cleaning History)

Before merging a long-lived branch, clean up the commits:

```bash
# Rebase last 5 commits interactively
git rebase -i HEAD~5
```

Common operations:

- **squash (s)**: Combine with previous commit
- **fixup (f)**: Combine with previous, discard this commit's message
- **reword (r)**: Change commit message
- **drop (d)**: Remove commit entirely

**Golden rule:** Never rebase commits that have been pushed to a shared branch.

## Handling Merge Conflicts

Systematic approach:

1. **Understand both sides**: Read the incoming change and the current change. Why do they conflict?
2. **Check intent**: Look at the PR description and commit messages for both sides.
3. **Choose strategy**:
   - If both changes are additive (e.g., both added imports), keep both.
   - If one change supersedes the other, keep the newer one.
   - If they modify the same logic differently, understand the business requirement and write the correct merged version.
4. **Test after resolving**: Run the test suite. Conflicts in logic often introduce subtle bugs.
5. **Mark as resolved**: `git add <file>` then `git rebase --continue` or `git merge --continue`.

## Cherry-Pick Workflow

For applying a specific fix to a release branch:

```bash
# Find the commit hash on main
git log --oneline main | grep "fix(auth)"

# Apply to release branch
git checkout release/v0.1.x
git cherry-pick <commit-hash>

# If there are conflicts, resolve them, then:
git cherry-pick --continue
```

Always cherry-pick from main to release branches, never the reverse.
