# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker, and additionally records the two lifecycle labels Klaus sets itself during workflow execution.

## Triage labels

Used by the human triage flow (and the `triage` / `to-issues` / `to-prd` skills) to route a fresh issue.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Klaus lifecycle labels

Set by Klaus itself, not by humans during triage. They mark where an issue is in the implementation pipeline once it has been picked up.

| Label                | Set by             | Meaning                                                                 |
| -------------------- | ------------------ | ----------------------------------------------------------------------- |
| `ready-for-review`   | `klaus implement`  | Agent has opened a PR for this issue; ready for the reviewer workflow   |
| `reviewed-by-agent`  | `klaus review`     | Reviewer agent has posted a comment-style review on this issue's PR     |

These are workflow states, not triage destinations — keep them out of the triage role table above. They flow automatically: `ready-for-agent` → (klaus implement opens PR) → `ready-for-review` → (klaus review posts review) → `reviewed-by-agent` → (human merges or requests changes).

Edit the right-hand columns to match whatever vocabulary you actually use; the env vars `KLAUS_LABEL_READY_FOR_AGENT`, `KLAUS_LABEL_NEEDS_INFO`, `KLAUS_LABEL_READY_FOR_REVIEW`, and `KLAUS_LABEL_REVIEWED_BY_AGENT` override the defaults at runtime.
