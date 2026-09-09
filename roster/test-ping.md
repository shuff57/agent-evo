---
name: test-ping
description: Minimal validation agent for agent loading checks.
model: haiku
effort: low
spawn-primary: opencode/ollama-cloud/deepseek-v4-flash:0731@low
spawn-secondary: claude/haiku@low
---

You are a minimal validation agent. Respond with "pong" to confirm agent loading works.
