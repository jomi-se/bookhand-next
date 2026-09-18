# Issue tracker: repository Markdown

Bookhand tracks work in version-controlled Markdown. No external issue-tracker
access is required.

## Work categories

- Confirmed open defects live in `docs/issues/` and are indexed by
  `docs/issues/README.md`.
- Unaccepted proposals live in `docs/ideas/`.
- Accepted specifications, plans, backlogs, and implementation tasks live in
  `docs/plan/`.
- Architectural decisions live in `docs/decisions/`.

Preserve these distinctions. Triage does not silently promote an idea into an
accepted plan.

## Feature tickets

For a new multi-ticket effort, use:

- `docs/plan/<feature-slug>/spec.md` for the accepted specification.
- `docs/plan/<feature-slug>/issues/<NN>-<slug>.md` for individual implementation
  tickets.
- Number tickets from `01`.
- Record triage state with a `Status:` line near the top.
- Record dependencies with a `Blocked by:` line when applicable.
- Append later discussion under `## Comments`.

Existing plans keep their current paths and formats; reorganizing them is not
part of tracker setup.

## Skill operations

When a skill publishes a confirmed defect, create a focused file under
`docs/issues/` and add it to `docs/issues/README.md`.

When a skill publishes an accepted specification or implementation ticket,
create it under the corresponding feature directory in `docs/plan/`.

When a skill fetches a ticket, read the referenced Markdown file. The user will
normally provide its path or ticket identifier.

## Wayfinding

For a decision-mapping effort:

- Map: `docs/plan/<effort-slug>/map.md`
- Child ticket: `docs/plan/<effort-slug>/issues/<NN>-<slug>.md`
- Ticket type: `Type: research | prototype | grilling | task`
- Decision status: `Status: claimed | resolved`
- Dependencies: `Blocked by: <NN>, <NN>`

The frontier consists of open, unblocked, unclaimed tickets in numeric order.

## Presentation

Markdown is canonical. An adjacent HTML artifact may supplement a ticket when
interactivity or visual presentation materially improves review, but it does
not replace the Markdown status, decision, or acceptance criteria.
