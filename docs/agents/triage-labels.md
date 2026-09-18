# Triage labels

The engineering skills use five canonical triage roles. In Bookhand's
file-backed tracker, record the corresponding value in the issue's `Status:`
line.

| Canonical role    | Bookhand status   | Meaning                                              |
| ----------------- | ----------------- | ---------------------------------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer evaluation is required                    |
| `needs-info`      | `needs-info`      | More information is required from the reporter       |
| `ready-for-agent` | `ready-for-agent` | Fully specified and suitable for an autonomous agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation or intervention        |
| `wontfix`         | `wontfix`         | Will not be actioned                                  |

When a skill names a triage role, use the matching status from this table. Edit
the mapping directly if Bookhand's vocabulary changes.
