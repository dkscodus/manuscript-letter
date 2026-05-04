// =============================================================
// config.example.js  →  copy to config.js and fill in.
// Firebase web config values are safe to ship (security comes
// from Firestore Rules), but keep this file out of public forks
// if you prefer. .gitignore already excludes config.js.
// =============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDYaUCOvUaugmXAKJZJFMRF6o4RkNmCUp8",
  authDomain: "manuscript-letter.firebaseapp.com",
  projectId: "manuscript-letter",
  storageBucket: "manuscript-letter.firebasestorage.app",
  messagingSenderId: "733024382844",
  appId: "1:733024382844:web:84f8cd34d6f4abe930fef9",
  measurementId: "G-34B0LLMNHF"
};
// Firestore collection that stores fan messages
export const COLLECTION_NAME = "messages";
