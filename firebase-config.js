// ============================================================
//  🔥 Firebase Configuration — KenGSL Portfolio
// ============================================================
//
//  HOW TO SET UP YOUR FIREBASE PROJECT:
//
//  1. Go to https://console.firebase.google.com/
//  2. Click "Create a project" → name it (e.g. "kengsl-portfolio")
//  3. Disable Google Analytics (optional) → Create project
//  4. In the project dashboard, click the Web icon (</>) to add a web app
//  5. Register app name (e.g. "kengsl-web") → Register app
//  6. Copy the firebaseConfig object below and replace the placeholders
//
//  ENABLE AUTHENTICATION:
//  7. Go to Build → Authentication → Get started
//  8. Click "Google" provider → Enable it → Set project support email → Save
//
//  ENABLE FIRESTORE:
//  9. Go to Build → Firestore Database → Create database
//  10. Start in "production mode" → Choose a region (e.g. asia-south1) → Create
//  11. Go to Rules tab and paste the security rules from below
//
// ============================================================


const firebaseConfig = {
  apiKey: "AIzaSyCdAfNlcYNTIw3QGE-XqkPviTkgd7OQpzg",
  authDomain: "kengsl-d7d2e.firebaseapp.com",
  projectId: "kengsl-d7d2e",
  storageBucket: "kengsl-d7d2e.firebasestorage.app",
  messagingSenderId: "805938998989",
  appId: "1:805938998989:web:e35db96bb27ef642730384",
  measurementId: "G-JT4467YDPS"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============================================================
//  FIRESTORE SECURITY RULES — Paste in Firebase Console → Firestore → Rules
// ============================================================
//
//  rules_version = '2';
//  service cloud.firestore {
//    match /databases/{database}/documents {
//
//      // Portfolio: public read, admin-only write
//      match /portfolio/{itemId} {
//        allow read: if true;
//        allow write: if request.auth != null
//          && get(/databases/$(database)/documents/settings/admin).data.uid == request.auth.uid;
//      }
//
//      // Testimonials: public read, admin-only write
//      match /testimonials/{itemId} {
//        allow read: if true;
//        allow write: if request.auth != null
//          && get(/databases/$(database)/documents/settings/admin).data.uid == request.auth.uid;
//      }
//
//      // Settings: admin can read/write, first user can create
//      match /settings/admin {
//        allow read: if request.auth != null;
//        allow create: if request.auth != null
//          && !exists(/databases/$(database)/documents/settings/admin);
//        allow update, delete: if request.auth != null
//          && resource.data.uid == request.auth.uid;
//      }
//    }
//  }
//
// ============================================================
