# Titanium Note

A concept "Thought-Support" note-taking application powered by **Gemini 2.0 Pro** (via Vertex AI for Firebase).

## Features
- **Clean Interface**: Distraction-free Markdown editor.
- **Mix**: Synthesize multiple notes into new insights using Gemini 2.0 Pro.
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
   - Enable **Anonymous** sign-in provider (and Google if desired).
   
2. **Firestore Database**:
   - Go to **Build** > **Firestore Database**.
   - Click **Create Database**.
   - Choose your location (e.g., `asia-northeast1`).
   - Start in **Production Mode** (Rules will be deployed later).

3. **Storage**:
   - Go to **Build** > **Storage**.
   - Click **Get Started**.
   - Start in **Production Mode**.
   - **Important**: This step fixes the "Firebase Storage has not been set up" error.

4. **Vertex AI (Gemini)**:
   - Go to **Build** > **Vertex AI in Firebase** (or search for Vertex AI).
   - Click **Get Started** or **Enable**.
   - **Blaze Plan (Pay as you go)** is required. Upgrade your project plan if needed.

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
   *Note: Since we use Vertex AI with ADC (Application Default Credentials), you do NOT need to set a manual API Key secret.*

4. **Deploy Frontend (Hosting)**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

## 4. First-Time Setup (User Approval)

This application uses a strict **Whitelist** system.

1. **Open the App**: Visit your deployed Hosting URL.
2. **Login**: The app will automatically sign you in.
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
