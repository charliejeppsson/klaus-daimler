# Deterministic blocked-by scheduling

Controller Klaus parses each issue body's `## Blocked by` section in code rather than asking an LLM to order dispatch. The scheduler is cheaper, deterministic, and easier to test; if the convention drifts, Klaus should fail loudly rather than silently dispatch work in the wrong order.
