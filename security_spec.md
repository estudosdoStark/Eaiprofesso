# Security Specification — AulaViva Firestore Rules

## 1. Data Invariants
1. **PII Isolation**: User emails and private settings live exclusively in `/users/{userId}` and are readable/writable only by `request.auth.uid == userId`. Leaderboard entries in `/public_profiles/{userId}` contain zero PII (no email, phone, or address) and require `isPublic == true` on list queries.
2. **Ownership Integrity**: Every `/users/{userId}/grades/{gradeId}` and `/users/{userId}/deadlines/{deadlineId}` document enforces `userId == request.auth.uid` on both path and payload (`incoming().userId == userId`), immutable `createdAt`, and strict `request.time` server timestamp alignment.
3. **Room Membership Master Gate**: Chat messages under `/rooms/{roomId}/messages/{messageId}` require the caller to be a verified member in `/rooms/{roomId}/members/{request.auth.uid}` (or the room owner) via `exists()` / `get()` on the parent room/membership, and `incoming().senderUid == request.auth.uid` on creation.
4. **Payload Size & Denial-of-Wallet Guards**: All document IDs match `^[a-zA-Z0-9_\-]+$` and are `<= 128` chars. Strings have strict `.size()` upper bounds, and inline media attachments (`attachmentData`) are capped at `450000` characters.
5. **Action-Based Updates & Anti-Update-Gap**: Updates are partitioned into explicit actions with `affectedKeys().hasOnly(...)` and always pass `isValid[Entity](incoming())`.

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated read on private profile**: `GET /users/uid_a` without auth -> `PERMISSION_DENIED`.
2. **Cross-user grade injection**: Signed in as `uid_b`, `CREATE /users/uid_a/grades/g1` -> `PERMISSION_DENIED`.
3. **Ghost field shadow update**: Signed in as `uid_a`, `UPDATE /users/uid_a` adding `{ isAdmin: true }` -> `PERMISSION_DENIED`.
4. **UID spoofing in message**: Signed in as `uid_b`, `CREATE /rooms/r1/messages/m1` with `senderUid: "uid_a"` -> `PERMISSION_DENIED`.
5. **Non-member message read/write**: Signed in as `uid_outsider` not in `/rooms/r1/members/uid_outsider` -> `PERMISSION_DENIED`.
6. **Oversized attachment DoW**: `CREATE /rooms/r1/messages/m2` with 600KB `attachmentData` -> `PERMISSION_DENIED`.
7. **ID poisoning**: `CREATE /users/uid_a/deadlines/invalid$id` -> `PERMISSION_DENIED`.
8. **Immutable field tampering**: `UPDATE /users/uid_a/grades/g1` changing `userId` or `createdAt` -> `PERMISSION_DENIED`.
9. **Blanket leaderboard scraping without public flag**: `LIST /public_profiles` without `where("isPublic", "==", true)` -> `PERMISSION_DENIED`.
10. **PII leak into public_profiles**: `CREATE /public_profiles/uid_a` with `{ email: "a@b.com" }` -> `PERMISSION_DENIED`.
11. **Timestamp spoofing**: `CREATE /users/uid_a/deadlines/d1` with client-forged `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
12. **Unverified email write**: Token with `email_verified: false` attempting write -> `PERMISSION_DENIED`.
