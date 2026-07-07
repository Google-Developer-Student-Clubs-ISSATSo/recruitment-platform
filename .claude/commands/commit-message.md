---
description: Generate a professional commit message for the current changes
---

Analyze the current git changes and produce a professional commit message.

Steps:

1. Run `git status` to see untracked/modified files.
2. Run `git diff` (and `git diff --staged` if anything is staged) to see the actual changes.
3. Run `git log -10 --oneline` to match this repo's existing commit message style/tone.
4. Write a commit message that:
   - Uses the imperative mood (e.g. "Add", "Fix", "Refactor", not "Added"/"Adds").
   - Has a concise subject line (ideally under 70 characters, no trailing period).
   - Explains _why_ the change was made, not just what changed, in the body when the change isn't self-evident from the subject alone.
   - Omits filler like "This commit...".
5. Output only the drafted commit message in a fenced code block — do not run `git commit` or stage/modify anything unless the user explicitly asks you to.

If there are no staged or unstaged changes, say so instead of inventing a message.
