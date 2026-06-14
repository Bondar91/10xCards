---
project: "10xCards"
context_type: greenfield
created: 2026-06-07
updated: 2026-06-07
checkpoint:
  current_phase: 7
  phases_completed: [1, 2, 3, 4, 5, 6]
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield — no project markers found in cwd"
    - topic: "auth strategy"
      decision: "email + password account, flat role model, flashcards private per-user"
    - topic: "MVP scope"
      decision: "registration → paste text → AI generation → review → save → SRS session"
    - topic: "timeline"
      decision: "3 weeks after-hours, no hard deadline"
    - topic: "domain rule"
      decision: "two rules: AI extracts knowledge from text; SRS schedules repetitions"
    - topic: "non-goals"
      decision: "no custom SRS algorithm, no file import, no sharing, no mobile"
  frs_drafted: 7
  quality_check_status: accepted
---

## Vision & Problem Statement

Manually creating high-quality flashcards is time-consuming and mechanically tedious — the entry barrier for tools like Anki is too high, and creating flashcards takes as long as studying itself. This discourages consistent use of spaced repetition, one of the most effective memorization techniques available.

Insight: the bottleneck is not the repetition algorithm — SM-2 and its variants are a solved problem available as ready-made libraries. The bottleneck comes earlier: creating the flashcards themselves. AI eliminates this bottleneck, changing the equation from "I need to spend an hour creating flashcards" to "I paste text and start learning."

## User & Persona

**Primary persona:** A student or person learning a new language or exam material. They have a text to study (notes, a textbook excerpt, an article) and want to start spaced repetition — but hit a wall: creating flashcards manually is so tedious it discourages them before they even begin. They currently use Anki or Quizlet, or give up on SRS entirely.

## Access Control

User accounts with email + password login. Flat role model — each authenticated user sees only their own flashcards; no admin/moderator roles in MVP. Unauthenticated users have no access to any flashcards.

## Success Criteria

### Primary
- 75% of AI-generated flashcards are accepted by the user (measured as the ratio of accepted to generated during the review step).
- Users create 75% of their flashcards using AI (not manually).

### Secondary
- Users return for a repetition session the day after their first AI generation.

### Guardrails
- Privacy: user A's flashcards are never visible to user B.
- Data is not lost on page refresh — flashcards are durably persisted server-side.
- AI generation shows visible progress feedback; the user does not wait in the dark.
- A failure of the external AI API does not block the entire app — the user can still create flashcards manually.
- The app works on the latest 2 major versions of Chrome, Firefox, and Safari (desktop).

## User Stories

### US-01: Generate flashcards from text using AI

- **Given** a logged-in user with a text they want to study
- **When** they paste the text and request AI generation
- **Then** they see a list of flashcards (front/back) for review; they can accept, edit, or reject each one; accepted flashcards are saved to their deck

#### Acceptance Criteria
- The user sees progress feedback during generation (not a blank screen)
- Each flashcard clearly shows front and back
- An "accept all" option shortens review when the AI result is good
- Rejected flashcards are not added to the deck

### US-02: Spaced repetition session

- **Given** a logged-in user with saved flashcards
- **When** they start a repetition session
- **Then** they see flashcards in the order determined by the SRS algorithm; after each answer they can rate how well they knew it; the algorithm updates the next repetition schedule accordingly

## Functional Requirements

### Authentication
- FR-001: User can create an account (email + password). Priority: must-have
  > Socrates: Counter-argument considered: "registration is an entry barrier." Resolution: accounts are required for flashcard persistence; the registration barrier is acceptable for the target persona (motivated students).

- FR-002: User can log in to their account. Priority: must-have
  > Socrates: No counter-argument — accounts are essential for storing flashcards.

### AI Generation
- FR-003: User can paste text and request AI flashcard generation. Priority: must-have
  > Socrates: No counter-argument — this is the core value proposition.

- FR-004: User can review AI-generated flashcards and accept, edit, or reject each one before saving. Priority: must-have
  > Socrates: No counter-argument — the review step is the prerequisite for measuring the 75% acceptance success criterion.

### Flashcard Management
- FR-005: User can manually create a flashcard (front + back) without AI. Priority: must-have
  > Socrates: No counter-argument — users need flashcards AI won't generate perfectly (custom definitions, niche material).

- FR-006: User can view, edit, and delete their saved flashcards. Priority: must-have
  > Socrates: No counter-argument — without editing, AI errors are permanent and degrade deck quality.

### Repetitions
- FR-007: User can start a repetition session powered by an SRS algorithm (third-party library). Priority: must-have
  > Socrates: No counter-argument — spaced repetition is the foundation of the product's value; without SRS the app is just another flashcard creation tool.

## Business Logic

The application applies two domain rules in sequence: (1) AI extracts knowledge worth memorizing from raw text and formulates it as question/answer pairs (flashcards), choosing granularity so that each card tests a single fact; (2) the SRS algorithm computes the optimal next review date for each flashcard based on the user's answer history, prioritizing cards the user knows less well.

AI rule inputs: raw text pasted by the user. Output: a list of proposed flashcards (front/back) for user acceptance.

SRS rule inputs: the user's rating history for each flashcard (difficulty score after each answer). Output: the next review date and card ordering within a session.

## Non-Functional Requirements

- The user sees acknowledgement of any action within 200 ms; during operations longer than 2 seconds (AI generation), continuous visible progress feedback is shown.
- Text submitted to AI for flashcard generation leaves no trace in operator-accessible storage after the request that consumed it completes.
- The app works on the latest two major versions of mainstream desktop browsers: Chrome, Firefox, Safari.
- Unavailability of the external AI API does not block user access to saved flashcards or manual flashcard creation.

## Non-Goals

- **Custom repetition algorithm** — we are not building SuperMemo/Anki from scratch; we integrate a ready-made SRS library. Rationale: the SRS algorithm is a solved problem; building a custom one adds scope with no MVP value.
- **File import (PDF, DOCX, etc.)** — MVP accepts pasted text only. Rationale: file parsers add technical complexity without affecting the core value proposition in v1.
- **Sharing decks between users** — flashcards are private; no public decks, export, or social features. Rationale: social features complicate the data model and moderation; MVP is focused on single-user value.
- **Mobile apps** — MVP is web only (desktop browser). Rationale: native mobile is a separate project; a web MVP is sufficient to validate the idea.

## Open Questions

*(no open questions after completing the shaping session)*
