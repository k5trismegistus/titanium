import * as admin from 'firebase-admin';

admin.initializeApp();

export * from './mix';
export * from './triggers';
export * from './search';
export * from './quickWord';
export * from './editorAssist';
export * from './articleAssist';
export * from './allowedUsers';
// export * from "./embedding"; // Deprecated/stub
