# Hearth — a family hub

Hearth is a shared calendar, budget, meal planner, shopping list, and chore
chart for a household — all synced live across everyone's phone. It's a
static site (no build step, no framework) backed by **Firebase Firestore**,
built to be forked, deployed to **GitHub Pages** in a few minutes, and made
your own.

## What's inside

- **Home** — today's agenda, meals, task progress and budget snapshot at a glance
- **Calendar** — a shared month calendar, color-coded per family member
- **Budget** — income & expenses, a spending-by-category chart, and a bill tracker
- **Kitchen** — a weekly meal plan and a categorized, real-time shopping list
- **Tasks** — chores & routines with a points system, plus a redeemable reward catalog
- **Family & settings** — manage members, profiles, invite code, and categories

Everyone in the family opens the same URL, joins the household with a short
invite code, and picks (or adds) their own profile — no accounts, no
passwords, works great on a shared kitchen tablet or on everyone's own phone.

## Tech

Plain HTML/CSS/JavaScript (ES modules), loaded directly by the browser —
there is nothing to compile or bundle. Firebase's SDK is loaded from
Google's CDN. The only backend is **Firestore** (data) and **Firebase
Authentication** (anonymous sign-in, just enough to scope Firestore access
to people who know your household's invite code).

```
hearth/
├── index.html
├── manifest.json
├── css/styles.css
├── js/
│   ├── app.js            entry point: boot, routing, the app shell
│   ├── chrome.js         profile switcher, share sheet, leave-household
│   ├── firebase-config.js  your Firebase project config lives here
│   ├── icons.js          small hand-built icon set
│   ├── state.js          tiny shared state store
│   ├── store.js          all Firestore reads/writes live here
│   ├── utils.js          dates, formatting, toasts, sheets/modals
│   └── views/            one file per screen (dashboard, calendar, budget, kitchen, tasks, family)
├── assets/icons/         favicon + home-screen icons
├── scripts/make-icons.js re-generate the PNG icons if you re-brand
├── firestore.rules
├── firestore.indexes.json
└── firebase.json         optional, only needed for Firebase Hosting
```

## 1. Set up Firebase

`js/firebase-config.js` is already pointed at a Firebase project. To use
**your own** project instead (recommended before you invite your family):

1. Go to the [Firebase console](https://console.firebase.google.com), create
   a project, then add a **Web app** to it (`</>` icon on the project
   overview page).
2. Copy the `firebaseConfig` object it gives you into
   `js/firebase-config.js`, replacing the existing values. These values are
   safe to commit to a public repo — they identify your project, they don't
   grant access on their own.
3. In the console, open **Build → Firestore Database → Create database**.
   Any region is fine; start in production mode (our rules file replaces
   the default anyway).
4. Open **Build → Authentication → Sign-in method**, and enable
   **Anonymous**. This is the only sign-in method Hearth uses — every
   device gets its own anonymous identity, and picks a household profile
   after signing in.
5. Publish the security rules in `firestore.rules`. Easiest way: open
   **Firestore Database → Rules** in the console, paste the contents of
   `firestore.rules`, and click **Publish**. (Or use the Firebase CLI — see
   below.)

### Using the Firebase CLI instead of the console

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy --only firestore:rules,firestore:indexes
```

## 2. Run it locally

Because the app uses ES modules, it needs to be served over HTTP (opening
`index.html` directly with `file://` won't work). Any static server does:

```bash
# pick one
npx serve .
python3 -m http.server 8080
php -S localhost:8080
```

Then open the printed local URL. The first screen lets you create a new
household or join one with a code.

## 3. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick
   your default branch and the `/ (root)` folder, then **Save**.
4. GitHub gives you a URL like `https://yourname.github.io/hearth/` a
   minute or two later — that's the app. Share it (and your household's
   invite code) with your family.

Everything in this repo uses relative paths, so it works fine served from a
project subpath like `/hearth/`.

### Alternative: Firebase Hosting

If you'd rather host on Firebase instead of GitHub Pages:

```bash
firebase init hosting   # point it at this folder, it'll detect firebase.json
firebase deploy
```

## How the data is organized

Everything lives under a single Firestore document per household, keyed by
its invite code (e.g. `households/BLUE42`):

```
households/{code}
  members/{memberId}         name, color, role, points
  events/{eventId}           calendar events
  categories/{categoryId}    budget categories (income & expense)
  transactions/{txId}        budget entries
  bills/{billId}             recurring bills, paid/unpaid per month
  mealPlan/{YYYY-MM-DD}      breakfast / lunch / dinner text per day
  shoppingItems/{itemId}     shared shopping list
  tasks/{taskId}             chores/routines, with a completions map keyed by date
  rewards/{rewardId}         the redeemable catalog
  redemptions/{id}           a log of what's been redeemed
```

Every screen subscribes to its collections in real time (`onSnapshot`), so
a change on one phone shows up on everyone else's within a second or two.
Firestore's offline cache is enabled, so the app keeps working — reading
cached data and queuing writes — when someone loses signal.

## Security notes

Firestore rules require a signed-in user (anonymous sign-in counts) *and*
knowledge of the household's code — codes are 6 random characters from a
32-symbol alphabet, never listed publicly, and not sequential. That's an
appropriate level of protection for a personal family tool, but it isn't
bank-grade: anyone who has the code (or brute-forces it, however
impractical) can read and write that household's data.

If you want stronger guarantees, a natural next step is switching from
anonymous auth to email/password or Google sign-in, and changing
`firestore.rules` to check each member document against `request.auth.uid`
instead of just "signed in." That's more setup (each family member needs a
real account) in exchange for real per-person access control.

## Customizing

- **Colors, type, spacing** — everything is a CSS custom property at the
  top of `css/styles.css`. Change the palette there and it updates
  everywhere.
- **Shopping categories** — edit the `SHOPPING_CATEGORIES` array in
  `js/store.js`.
- **Default budget categories / starter rewards** — edit
  `DEFAULT_CATEGORIES` and `DEFAULT_REWARDS` in `js/store.js` (only affects
  newly created households).
- **App icon** — tweak the colors/shape in `scripts/make-icons.js` and
  re-run `node scripts/make-icons.js`.

## License

MIT — see [LICENSE](LICENSE). Make it yours.
