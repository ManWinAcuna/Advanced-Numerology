# Firestore security rules — locking the synced data

The Sports Betting pages are gated in the browser by `sports-gate.js`, but that
is a **client-side deterrent only** — the page files are served publicly by
GitHub Pages, so a technical visitor can read them regardless. The *real* privacy
guarantee is on the **data**, enforced by Firestore security rules on the server.

Synced data lives in Firestore at `users/{uid}` (one document per account,
keyed by the signed-in user's Firebase UID — see `cloudPushKey`/`cloudPullAll`
in `db-core.js`) **plus a subcollection** `users/{uid}/emaxCats/{categoryId}`
(one small document per EMAX category — the whole collection outgrew the main
document's 1MiB cap, see `cloudPushEmax` in `db-core.js`). The rules below make
each account able to read and write **only its own** data, so no one can pull
the owner's records but the owner.

> **The `{document=**}` wildcard is required.** A plain `match /users/{userId}`
> covers only the document itself — Firestore rules do NOT cascade to
> subcollections, so without the wildcard every EMAX category sync is denied.

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
    match /users/{userId}/{document=**} {
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
    match /users/{userId}/{document=**} {
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


## Code13 settings sync (publicConfig) - added 2026-08-13

The Settings page now publishes every override save to a world-readable
`publicConfig/overrides` doc, which Code13 fetches read-only on load.
For that to work, add this block inside `match /databases/{database}/documents`
in the Firebase console rules (Firestore Database -> Rules):

```
    match /publicConfig/{docId} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email == 'horseyear2026manuel@gmail.com';
    }
```

Until this is applied, the publish write is denied and silently skipped,
and Code13 keeps using its baked default values.
