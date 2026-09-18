# Domain documentation

Bookhand is a single-context repository.

## Before exploring

- Read root `CONTEXT.md` when it exists.
- Read applicable decisions under `docs/decisions/`.
- Follow the product and architecture authorities identified by `AGENTS.md`.

If `CONTEXT.md` does not exist, proceed silently. Create it lazily through
domain-modeling only when project terminology actually needs to be resolved.

## Vocabulary

Use terms as defined by `CONTEXT.md`. Avoid introducing synonyms for established
concepts.

When a required concept is absent, determine whether the proposed term is
unnecessary or whether the domain model has a genuine gap. Record genuine gaps
through domain-modeling.

## Decisions

Surface conflicts with existing decision records explicitly. Do not silently
override an accepted decision.

Example:

> Contradicts ADR 0005, but may warrant reconsideration because…
