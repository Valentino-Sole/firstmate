# Fremdquellen-Quellenrisiko: collectosk.com and tcdb.com

This document is the authoritative record of the captain's 2026-09-03 decision
on securing foreign Card-Arena data sources at risk of disappearing.

## Captain decision

Decision date: **2026-09-03**.
Origin: `fremdquellen-inventur` (source-risk inventory scout, migration
secondmate home). Full framing: `data/fremdquellen-inventur/report.md` in the
migration secondmate home.
Resolution: released via captain-hold, decision digest
`f41dedb2199f234193b038b777ae0201b1e1e9963f9b52e60599c0057a252521`.

The captain's own words:

> Kapitaen 03.09.2026: JA - collectosk.com wegen Frist 06.09. SOFORT sichern.
> Nur Referenz- und Sicherungskopie, keine automatische Uebernahme als
> Wahrheit, keine Versiegelung daraus. Danach tcdb.com nach Prioritaet.

## What this means

- **collectosk.com** is secured immediately: the site carries a hard deadline
  of **2026-09-06** (domain/content at risk of disappearing) and is the top
  priority.
- **tcdb.com** follows afterward, by priority, once collectosk.com is
  secured; it carries no comparable stated deadline.
- Both captures are a **reference and backup copy only**:
  - **No automatic adoption as truth.** A captured page is not merged into
    the Card-Arena checklist corpus or treated as a verified data source
    without a separate human or checklist-logic review.
  - **No sealing.** Capturing the copy does not close, finalize, or "seal"
    any decision, checklist entry, or discovery-pipeline state derived from
    it. It is a fallback reference, not a completed migration step.

## Scope and open follow-up

This document anchors the decision and its constraints; it does not itself
perform the capture.
The scraping and storage work belongs to the migration secondmate's
captain-private state and to the versioned `card-arena-quellenwerkzeuge`
project (`docs/card-arena-quellenwerkzeuge-projekt.md`), not to this repo's
tracked worktree, mirroring that document's own scope boundary.
Track execution status (capture started, capture complete, review pending)
as a task under the `fremdquellen-inventur` origin in the migration
secondmate's backlog, not in this file.

## Validation

There is no PreToolUse guard for this decision: like
`docs/card-arena-quellenwerkzeuge-projekt.md`, nothing here needs to block a
destructive command, so no seatbelt script accompanies this contract.
