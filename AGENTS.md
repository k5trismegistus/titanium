Infrastructure preference
- Use Firebase-only services (Auth/Firestore/Storage/Functions/Hosting/Extensions) as the default.
- Avoid non-Firebase APIs unless the requirement is impossible to satisfy with Firebase alone.
- If a non-Firebase API is truly required, document why Firebase cannot meet the requirement and get explicit approval before integrating it.

Vector search policy
- Firestore vector search supports <= 2048 dimensions, so embeddings larger than that must be reduced before storage/search.
