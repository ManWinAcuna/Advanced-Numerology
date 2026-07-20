# Firestore security rules — locking the synced data

The Sports Betting pages are gated in the browser by `sports-gate.js`, but that
is a **client-side deterrent only** — the page files are served publicly by
GitHub Pages, so a technical visitor can read them regardless. The *real* privacy
guarantee is on the **data**, enforced by Firestore security rules on the server.

All synced data lives in Firestore at `users/{uid}` (one document per account,
keyed by the signed-in user's Firebase UID — see `cloudPushKey`/`cloudPullAll`
in `db-core.js`). The rules below make each account able to read and write **only
its own** document, so no one can pull the owner's betting records but the owner.

## How to apply

1. Firebase console → project **advanced-numerology-d3f0f** → **Firestore
   Database** → **Rules** tab.
2. Replace the contents with the block below → **Publish**.

## Recommended: each account sees only its own data

Use this if anyone besides you might sign into the numerology app with their own
login (it keeps their sync working while still making your data private to you):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Stricter: lock the entire database to only your account

Use this only if you are the **sole** user of the whole app — it blocks every
other account from syncing anything at all:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && request.auth.token.email == 'horseyear2026manuel@gmail.com';
    }
  }
}
```

> Note: I can't publish these from here — they live in your Firebase project,
> not this repo. Paste whichever block fits, hit Publish, and the data lock is
> live immediately (no redeploy of the site needed).
