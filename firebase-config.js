// ==========================================================================
// Firebase initialization
// ==========================================================================
// This is the ONE file you touch to point Hearth at your own Firebase
// project. The values below are safe to publish in a public GitHub repo —
// Firebase web config identifies your project, it does not authorize
// access. Access is controlled by firestore.rules and by which
// Authentication providers you enable in the console. See README.md.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHY2gKCteLl-FnVWdWAbZZKX5DXsaNZ38",
  authDomain: "name1-5ba90.firebaseapp.com",
  databaseURL: "https://name1-5ba90-default-rtdb.firebaseio.com",
  projectId: "name1-5ba90",
  storageBucket: "name1-5ba90.firebasestorage.app",
  messagingSenderId: "52431415255",
  appId: "1:52431415255:web:b14287e0f2be12465a0d92",
};

export const app = initializeApp(firebaseConfig);

// Firestore with offline persistence turned on, so the app keeps working
// (reading + queueing writes) when a family member loses signal, and
// syncs the moment they're back online.
export let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  // Falls back to a plain client if persistence can't start (private
  // browsing, unsupported browser, or a second call after hot-reload).
  console.warn("Falling back to non-persistent Firestore cache:", err.message);
  db = getFirestore(app);
}

export const auth = getAuth(app);

/**
 * Resolves once we have a signed-in user, signing in anonymously if
 * nobody is signed in yet. Every device that opens Hearth gets its own
 * anonymous identity — that identity is what Firestore security rules
 * check before allowing reads/writes.
 */
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
        } else {
          signInAnonymously(auth).catch((err) => {
            unsubscribe();
            reject(err);
          });
        }
      },
      reject
    );
  });
}
