# Deterministic blocked-by planning

Klaus parses each issue body's `## Blocked by` section in code rather than asking an LLM to plan issue order. The parser is cheaper, deterministic, and easier to test; if the convention drifts, Klaus should fail loudly rather than silently dispatch work in the wrong order.
