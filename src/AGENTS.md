# Frontend instructions

`src/` is a React 19 + TypeScript + Vite client. Preserve the existing
component boundaries: pages compose features, `components/editor/` owns editor
behavior, `components/suggestions/` owns related-note presentation, and
`lib/firebase/` owns Firebase client access.

## Editor invariants

- `notes.markdown` is the only editable source of truth. The single Tiptap
  editor must preserve existing note structure and cursor intent during edits.
- A single newline is a visible line break in Titanium. Do not change this to
  CommonMark's default paragraph behavior without an explicit product decision.
- The active suggestion context comes from the cursor's current h1 section.
  Keep this interaction lightweight and resilient to temporarily stale derived
  data.
- Editing must remain the primary task. Related notes and Mix are optional,
  non-blocking suggestions.
- Selection-based AI markers and results are session-only editor state; never
  serialize them into `notes.markdown`. Replace selected text only after review,
  and reject replacement if the original selection changed.

## UX and implementation

- Design mobile first. On mobile, related notes use a full-screen drawer rather
  than competing with the editor in a narrow column; controls must remain
  reachable with the keyboard open and safe-area insets.
- Mobile related-note hints are small, background-free text and stay hidden
  during input, keyboard display, or selection.
- Keep user-visible Japanese and English copy consistent with nearby UI.
- Prefer local component state and the existing `EditorContext` over a new
  state-management library.
- Validate frontend changes with `npm run lint` and `npm run build`.
