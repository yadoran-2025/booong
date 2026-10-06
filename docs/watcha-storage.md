# watcha shared Firebase catalogue

## Scope

- Firebase project: `yadoran-2025` (266288546185).
- Web app: `watcha`, app ID `1:266288546185:web:676beec13e5a4ac40c2158`.
- Dedicated Realtime Database: `yadoran-2025-watcha`, Singapore (`asia-southeast1`).
- URL: `https://yadoran-2025-watcha.asia-southeast1.firebasedatabase.app`.
- All application data stays below `/watcha`. Hosting, Functions, Firestore and existing app configurations are not deployment targets for this feature.

The web app registration does not isolate a project's data on its own. A dedicated database and dedicated rules keep watcha separate from existing applications. Do not reuse the default database for this feature.

## Records

- `books/{watchaId}/listing`: title, year, cover URL and Watcha URL, shared across profiles.
- `books/{watchaId}/detail`: ISBN, book information (including Watcha `info.genres` classifications), and optional manual ISBN correction. Preserve empty genre arrays when Watcha supplies no classification.
- `profiles/{profileId}`: complete ordered list of book IDs, total and collection time.
- `sync/lastFullSync`: last confirmed full-sync start (`lastFullSyncAt`, server-generated ISO timestamp), shared by every viewer through the authenticated API. This is an execution attempt, not a completion time. No user identity is stored.
- Loan/holding status, copies, locations and check times: fetched live from the provider, held only in the current page, never persisted. Legacy `/availability` records are ignored; no new code reads or writes them.

Structured records are JSON strings so RTDB preserves empty arrays and null values. Covers remain external URLs. Removed wishlist entries leave that profile's membership; shared book information remains available to other profiles. Membership commits only after all upstream pages pass total/duplicate/completeness checks. Unchanged listing records are not rewritten. Failed loan lookups display an error and do not restore an earlier successful status.

Suwon and Yongin each return their city's branches together. Selecting a branch queries only its city provider; the page filters copies by branch code. Switching branches within the currently selected city reuses that view's results and keeps any in-flight city queue running, with original lookup timestamps preserved. Opening loan details queries all automatic providers again, even if the details were just opened. Simultaneous ISBN/provider requests are coalesced within one server instance; completed results are not reused.

## Browser behavior

Firebase is authoritative for wishlist membership and book metadata. IndexedDB stores only those catalogue fields; a 15-minute browser snapshot avoids repeat catalogue downloads and serves an explicitly labelled offline book-list fallback. Loan arrays, timestamps, loading flags and errors are stripped on every browser-cache read/write, including legacy snapshots. Selections and favorites remain in localStorage.

On the first connection, up to 25 legacy book metadata/ISBN rows per authenticated POST are validated and imported. Conditional `if-match: null_etag` writes fill only absent book records. Loan fields are ignored by the server, including imports from older clients. Only books already in the registered profile's complete server snapshot can be imported.

Each new page/account view and change to a different provider checks the selected provider live with four simultaneous book lookups. Completed results remain in memory for that view so the available-only filter can update as responses arrive. Switching branches within the same provider reuses those results; changing to another provider clears its former in-memory results. Opening book loan details also queries again. Access denials and rate limits stop dequeuing additional books after the in-flight requests, and branch changes within the same city do not restart the blocked queue. A failed lookup does not display the former status. `대출 상태 새로 확인` restarts live checks. `왓챠 목록 전체 동기화` syncs all registered wishlists, then fills missing book metadata (classification, authors, description and ISBN) for all successfully loaded profiles, including unselected ones, without starting loan checks. Shared book IDs are fetched once; existing metadata is reused. Paced metadata requests pause on rate limits and retry the same profile scope while the page remains open. Full sync first shows a server-cost confirmation. Cancellation sends no record or sync request. An accepted run records its start in the dedicated database before refreshing profiles; if recording fails, sync does not start. The page reads this shared history without browser-cache reuse on entry, account changes and window focus, and displays elapsed Korean calendar days. Legacy browser-only button history is not imported. Every displayed provider result retains its actual lookup timestamp; "live" means checked at request time, not a continuous subscription.

## Authentication and configuration

The server's ignored environment variable `FIREBASE_WATCHA_SERVER` contains base64 service-account JSON for `watcha-cache@yadoran-2025.iam.gserviceaccount.com`. It is configured in `.env.local` and the existing BOOONG Vercel project's sensitive production/preview environment. Do not print it, commit it or send it to a browser.

The account has no added project-wide admin role. Its locally signed custom token is exchanged for a Firebase ID token with UID `watcha-cache-server` and claim `watchaCache: true`. Dedicated database rules allow only that identity below `/watcha`; public and ordinary user reads/writes are denied. The API still applies the existing BOOONG Google-admin gate. The explicitly enabled loopback development preview can access only this public catalogue feature. Import POSTs reject foreign origins in preview mode.

Run the local preview with:

```sh
node --env-file=.env.local scripts/serve.mjs
```

Deploy only the dedicated database rules:

```sh
firebase deploy --project yadoran-2025 --config firebase.watcha.json --only database --non-interactive
```

Keep `database` as an **array** containing the explicit instance in `firebase.watcha.json`. Firebase CLI 15 ignores an `instance` property in a single-object database config and instead selects the default DB. Check output for `yadoran-2025-watcha` before accepting deployment.

## Validation and deployment record (2026-10-03)

Created the web app, dedicated DB and server service account. Saved complete upstream snapshots: Yadoran 1,099 and Do 904 books, with 1,789 unique book IDs. Verified the local API reads Firebase and a repeated book/detail and loan lookup uses stored data. Verified unauthenticated dedicated DB access and remote preview requests are denied. The regression suite covers scoped credentials/paths, shared keys, source-only refresh, failed pagination and refresh protection, manual corrections, empty-array preservation, validated migration and conditional writes.

Deployment incident: the initial single-object CLI config selected the default DB despite its `instance` field. Its rules were immediately restored using the repository's existing `database.rules.json` and the remote rules were verified to match that file. The config was changed to an array and the subsequent release output explicitly identified only `yadoran-2025-watcha`. The exact pre-deployment remote rules were not captured, so equality with that earlier remote version cannot be independently confirmed. No application data was deleted.

Firebase resources and the local preview are connected. The unrelated working-tree changes were not bundled into a BOOONG production website deployment by this task; deploying the new API/client code is a separate website release.


## Website release (2026-10-03)

Deployed and promoted to `https://booong.vercel.app/watcha-library.html` through the existing BOOONG Vercel project `prj_P9RTgl9Az53r5VZ8i0diwW7YcJCH`. Deployment: `dpl_6G74VkgfchCRABW2BfiKFNwGCEtG` (`https://booong-a7qtuaucw-yadorans-projects.vercel.app`).

The release was reconstructed from the previous production deployment `dpl_VMHz1CGcJsgkuoCTNLMn3kDeEuF7`, with only 12 Watcha client/API/dependency and admin-navigation files overlaid. All 155 unrelated production source files were verified unchanged. Firebase project `yadoran-2025`, web app `1:266288546185:web:676beec13e5a4ac40c2158`, and dedicated database `yadoran-2025-watcha` remain the existing backing resources; this website release deployed no Firebase rules, Functions, Hosting, or other resources. The existing production `FIREBASE_WATCHA_SERVER` setting was present; no environment secrets were bundled.

Validation: full repository tests passed, and the isolated release passed JavaScript/import checks and page smoke checks. The production URL returned matching HTML, client scripts and CSS; the home page and textbook page matched the previous production sources. Anonymous Watcha requests, including `preview=1`, returned HTTP 401. The deployed page displayed the Google admin login gate. Authenticated production catalogue browsing was not completed: Edge automation was blocked by an open extension UI, and the in-app browser did not expose the Google popup.


## Additional profile release (2026-10-04)

Added `현석 김` (`36lvX8ERWLvXd`) to the shared profile registry. Verified the upstream wishlist contains 91 books and cached its complete membership at `/watcha/profiles/36lvX8ERWLvXd` in the existing dedicated `yadoran-2025-watcha` database (Firebase project `yadoran-2025`, Watcha web app `1:266288546185:web:676beec13e5a4ac40c2158`). Existing shared book details and ISBN/provider results remain reusable. No Firebase rules, Hosting, Functions or access configuration were changed.

Production deployment `dpl_HZ2n8L2xVXzKCJaXmTGdjH9fR6nm` (`https://booong-jeu4r5ehb-yadorans-projects.vercel.app`) was aliased to `booong.vercel.app`. The isolated release changed only `js/watcha-library-data.js`; all 166 other production source files were verified unchanged. Source/API/UI regression tests cover the third profile and deduplication across three selected profiles. JavaScript/import checks passed. Verified the production registry matches the updated file, the live local API returns all 91 books, and the local page displays the new account and actual filtered loan results.

## Live loan lookup change (2026-10-04)

Changed only the Watcha client/API/storage code in the local preview. Resource identity remains project `yadoran-2025`, web app `watcha` (`1:266288546185:web:676beec13e5a4ac40c2158`), dedicated RTDB `yadoran-2025-watcha`. No Firebase rules, Hosting, Functions or database records were changed by this update. Existing loan-cache records remain unused; the code no longer downloads, updates or imports them. Production website deployment of this change is separate. Regression checks verify live re-querying, no Firebase loan reads/writes, ignored legacy results, metadata-only browser snapshots, detail reopening and per-provider requests.

## Fourth profile (2026-10-04)

Registered `김민석` (`djaxbZM08xLw8`) and stored the complete 536-book public wishlist at `/watcha/profiles/djaxbZM08xLw8`, with listings under `/watcha/books`, in the same dedicated database and web app identified above. Reused existing shared book details; fetched no loan results. Verified registered-profile API access, four-account deduplication, full-sync inclusion and the stored total. No Firebase rules, Hosting, Functions or production website deployment was changed.

## Compact interface release (2026-10-04)

Promoted `dpl_2Efn8fWSg66kB7o6At7u3Zq4QEmb` to `https://booong.vercel.app/watcha-library.html`. Genre choices start collapsed and summarize selected genres; `조회하기` sits beside the available-book count. Removed the repeated library/account summary and put the ISBN explanation behind `조회 기준`. The release also includes the Watcha preview's live-loan API, metadata-only browser cache, sync history and fourth profile so the deployed interface has matching dependencies. The existing one-hour server book-catalogue cache remains enabled; loan results are not persisted.

Reconstructed the release from production `dpl_GgTdzhwjiqxeMrTdEocgAvd18qTf`: eight Watcha client/API files changed and all 159 other source files matched production. No secrets were bundled. Firebase project `yadoran-2025`, web app `watcha` (`1:266288546185:web:676beec13e5a4ac40c2158`) and dedicated database `yadoran-2025-watcha` are the existing resources; no Firebase rules, Functions, Hosting or configuration were deployed.

The isolated release passed Watcha API/UI/storage regression tests and JavaScript/import checks. Verified deployed source hashes, the production alias and public assets; anonymous collection/history and remote-preview requests returned HTTP 401. The authenticated production page displayed the compact controls, read sync history successfully and returned live library results.

## Library shelf release (2026-10-06)

Promoted `dpl_93pTJAtMvXFR8WerduD8Z9chrTVn` (`https://booong-5svzh1osr-yadorans-projects.vercel.app`) to `https://booong.vercel.app/watcha-library.html` in the existing BOOONG Vercel project `prj_P9RTgl9Az53r5VZ8i0diwW7YcJCH`. Reconstructed production `dpl_326m8MnFToRewaPRatYuKfCa1Q1Z` and changed only `css/watcha-library.css`, `js/watcha-library.js`, and `js/watcha-library-data.js`; all 155 other source files remained identical. The release adds browser-local shelves scoped to individual libraries, shared book cards and counts in shelves, compact shelf icons and inline locations/call numbers, visible sort choices, stable library ordering, and removes the redundant source helper line. Yongin call numbers are extracted from the existing response.

Firebase remains project `yadoran-2025`, web app `watcha` (`1:266288546185:web:676beec13e5a4ac40c2158`), dedicated database `yadoran-2025-watcha`; no Firebase resources, rules, credentials, or configuration were deployed. Repository tests/checks/smoke passed; isolated-release syntax/import checks and all 13 page smoke checks passed. Verified all 158 deployed source hashes, public Watcha assets, unchanged home/textbook pages, and HTTP 401 for anonymous collection/history/remote-preview requests. The production browser displayed the Google login gate; authenticated UI verification was limited by the in-app browser not exposing the Google sign-in popup. Local UI and shelf behavior were verified before release. Shelf storage is origin-specific, so local-preview shelves do not appear automatically on the production origin.
