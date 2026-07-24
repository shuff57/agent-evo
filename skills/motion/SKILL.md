---
name: motion
description: Web animation and motion — building it, naming it, or reviewing it. Use when building or reviewing gesture-driven UI, spring animations, drag/swipe/sheet interactions, momentum and interruptible transitions, easing curves, translucent materials, motion typography, or reduced-motion; when you need the precise term for a motion effect ("what's it called when…"); or when reviewing animation/motion code against a craft bar. Apple-style fluid-interface principles, an effect glossary, and an animation-review standard, consolidated.
---

# Motion

Consolidated motion skill. Restraint first — **the best animation is often no animation**; every motion must earn its place (feedback, spatial consistency, state, preventing a jarring change), and high-frequency / keyboard-triggered actions get none.

Three modes. Load the reference for the one you're in — don't load all three:

| You are… | Load |
|---|---|
| **Building / designing** motion — springs, gestures, drag/sheet, interruptible transitions, materials/depth, motion typography, reduced-motion | `references/apple-design.md` |
| **Naming** an effect from a loose description ("the bouncy thing when a popover opens") | `references/vocabulary.md` |
| **Reviewing** animation/motion code against the craft bar | `references/review.md` (pull exact curves/durations/spring configs from `references/STANDARDS.md`) |

Shared craft rules across all three: sub-300ms UI, `ease-out` on ent/exit (`ease-in` on UI is a block), `transform`/`opacity` only, origin-aware popovers, interruptible over keyframes for anything gesture-driven, honor `prefers-reduced-motion`.

> Consolidated 2026-07-24 from three vendored emilkowalski/skills (`apple-design`, `animation-vocabulary`, `review-animations` + its STANDARDS). Single-author taste (Emil Kowalski / animations.dev) — treat numeric values as strong defaults, not gospel. The review reference is manual-grade: use it when asked to review motion, not as an auto-audit of unrelated work.
