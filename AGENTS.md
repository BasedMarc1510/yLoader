# AGENTS.md

## Project Scope

yLoader is a local-first yt-dlp frontend wrapper that runs in three modes:
- Web app (Vite frontend + Node/Express backend)
- Docker deployment (frontend + backend containers)
- Electron desktop wrapper (same frontend/backend behavior, desktop shell)

All code changes must preserve feature parity across these runtime modes unless a change is explicitly mode-specific and documented.

## Core Engineering Principles

- Prefer simple, maintainable solutions over clever shortcuts.
- Follow DRY: remove repeated logic when repetition is meaningful and stable.
- Avoid premature abstractions: only extract shared utilities when at least two real call sites benefit.
- Keep functions focused and side effects explicit.
- Preserve existing public behavior unless the change request explicitly requires a behavior change.

## File Size and Structure

- Do not let files grow indefinitely.
- Recommended limits:
  - UI components/pages: target <= 350 lines
  - Complex containers/services: target <= 450 lines
- If a file exceeds limits, split by responsibility (view, state, helpers, API, constants).
- Prefer colocated helper modules over giant multi-purpose files.

## Frontend Standards (React + MUI)

- Keep components composable and single-responsibility.
- Reuse shared UI patterns and avoid duplicating styling logic.
- Ensure responsive behavior for desktop and mobile.
- Preserve accessibility:
  - Keyboard-usable interactions
  - Proper aria labels for icon-only controls
  - Adequate contrast in light and dark mode
- Avoid hardcoded user-facing strings in JSX.

## Internationalization Rules (Mandatory)

- Never ship new user-facing text as hardcoded strings in source code.
- Every new translation key must be added immediately to both locale files:
  - frontend/src/i18n/locales/en.js
  - frontend/src/i18n/locales/de.js
- Keep semantic parity between English and German texts.
- Do not introduce a key in one locale without the other.

## Backend Standards (Node/Express)

- Validate and sanitize all incoming request inputs.
- Keep route handlers thin; move reusable logic into helper/service functions.
- Return clear, actionable error messages (without leaking sensitive internals).
- Handle subprocess/tool failures defensively (yt-dlp, ffmpeg).
- Avoid shell-command construction patterns that could introduce injection risk.

## Runtime and Packaging Constraints

- Assume local-first behavior by default.
- Do not introduce changes that only work in browser mode while breaking Docker/Electron.
- When changing environment variables, runtime paths, or startup behavior, update README and related scripts/docs in the same change.

## Dependency Policy

- Prefer existing dependencies and internal utilities.
- Add new dependencies only when there is clear long-term value.
- Keep dependency footprint small; avoid overlapping libraries for the same purpose.

## Performance and Reliability

- Minimize unnecessary renders and repeated network calls.
- Use memoization only when it improves measured or obvious hot paths.
- Keep async flows cancellable or guard against stale updates where needed.
- Ensure UI remains usable during loading/error states.


## Agent Behavior for This Repository

- Prefer safe, incremental edits over large risky rewrites.
- Do not silently change API contracts.
- Preserve existing coding style and conventions in touched files.
- When introducing new UI behavior, also account for dark mode and i18n.
- If a requested change conflicts with these rules, explicitly call out the tradeoff in the final summary.
