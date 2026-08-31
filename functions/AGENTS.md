# Firebase Functions instructions

`functions/` contains the trusted backend for Firebase. It builds with
TypeScript to `lib/`; edit `src/` only.

## Security and data rules

- Callable functions must verify `request.auth` and enforce the existing
  whitelist policy before reading user data or invoking AI.
- Scope every Firestore query and returned document to the authenticated user.
  Never trust a client-supplied `uid` for authorization.
- `notes.markdown` is primary data. `sections`, embeddings, `salientItems`, and
  note-level salient fields are rebuildable derived data.
- Keep embeddings at `VECTOR_DIMENSION` from `src/vectorConfig.ts` and use the
  existing projection/validation helpers rather than storing provider-native
  vectors directly.

## Operational behavior

- Functions run in `asia-northeast1` unless a justified exception is agreed.
- Trigger handlers must be idempotent and avoid self-triggering loops when
  writing derived fields.
- Design cleanup and backfill work to be bounded, restartable, and observable;
  do not run it against a Firebase project without explicit approval.
- Preserve fallback behavior for unavailable or stale AI-derived data so note
  editing and viewing continue to work.

## Verification

Run `npm --prefix functions run build` after changing this directory. Add
behavioral tests when a test harness exists for the changed behavior.
