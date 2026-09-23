# Titanium Note

A concept "Thought-Support" note-taking application powered by **Gemini** (via Vertex AI in Firebase), with **Gemini 3.0** preferred and **Gemini 2.5 Flash** as fallback.

## Features

- **Clean Interface**: WYSIWYG-first editor with a Markdown toggle (raw + preview).
- **Stable Markdown Source**: Mode switching does not rewrite note text, and single newlines are treated as line breaks.
- **Mix**: Synthesize multiple notes into new insights using Gemini (3.0 preferred, 2.5 fallback).
- **Quick Word**: Register a term to auto-generate an explainer note for future suggestions and Mix.
- **Vector Search**: Semantic search across notes with top 5 results.
- **Security**: Strict whitelist-based access control.
- **Sync**: Real-time autosave to Firestore.

## Prerequisites

- Node.js (v20+)
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase Project

## 1. Firebase Console Setup (Required)

Before deploying, you must enable the following services in the [Firebase Console](https://console.firebase.google.com/):

1. **Authentication**:
   - Go to **Build** > **Authentication**.
   - Click **Get Started**.
   - Enable the **Google** sign-in provider.

2. **Firestore Database**:
   - Go to **Build** > **Firestore Database**.
   - Click **Create Database**.
   - Choose your location (e.g., `asia-northeast1`).
   - Start in **Production Mode** (Rules will be deployed later).

3. **Storage**:
   - Go to **Build** > **Storage**.
   - Click **Get Started**.
   - Start in **Production Mode**.
   - **Important**: Required for Markdown image uploads.

4. **Vertex AI (Gemini)**:
   - Go to **Build** > **Vertex AI in Firebase** (or search for Vertex AI).
   - Click **Get Started** or **Enable**.
   - **Blaze Plan (Pay as you go)** is required for Gemini APIs (including Gemini 3.0 and Gemini 2.5 Flash). Upgrade your project plan if needed.

## 2. Local Setup

1. **Install Dependencies**

   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Environment Configuration**
   Copy `.env.example` to `.env` and fill in your Firebase config keys (found in Project Settings > General > Your Apps).
   ```bash
   cp .env.example .env
   ```

## 3. Deployment

1. **Login to Firebase**

   ```bash
   firebase login
   ```

2. **Initialize Project**

   ```bash
   firebase use --add
   ```

   Select your project alias.

3. **Deploy Backend (Functions & Rules)**

   ```bash
   firebase deploy --only functions,firestore,storage
   ```

   _Note: Since we use Vertex AI with ADC (Application Default Credentials), you do NOT need to set a manual API Key secret._

4. **Deploy Frontend (Hosting)**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

## 4. First-Time Setup (User Approval)

This application uses a strict **Whitelist** system.

1. **Open the App**: Visit your deployed Hosting URL.
2. **Login**: Sign in with Google (or use the `/demo` route for read-only).
3. **Get UID**: Copy the **User ID (UID)** displayed on the "Access Denied" screen.
4. **Approve User**:
   - Go to Firebase Console > **Firestore Database**.
   - Create a collection: `allowedUsers`.
   - Add Document ID: `<YOUR_UID>`.
   - Field: `allowed` (boolean) = `true`.
5. **Refresh**: You now have access.

## Development

Run locally:

```bash
npm run dev
```

## Maintenance Scripts (Functions)

Run from `functions/`:

```bash
cd functions
```

- `npm run reindex`
  - Rebuilds legacy vector fields (`notes.embedding`, `sections.embedding`) when missing/invalid.
- `npm run reindex:force`
  - Forces regeneration of the same legacy vectors.

- `npm run backfill:salient`
  - Backfills salient extraction for related-note search:
    - `notes/{noteId}/salientItems/*`
    - `notes.salientKeywords`
    - `notes.salientClaims`
    - `notes.salientUpdatedAt`
- `npm run backfill:salient:force`
  - Forces regeneration of salient data even if already present.

Useful options:

```bash
# Dry run (no write)
npm run backfill:salient -- --dry-run

# Single user
npm run backfill:salient -- --uid=<USER_UID>
```
