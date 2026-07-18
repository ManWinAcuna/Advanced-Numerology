// Firebase project for Advanced Numerology - Auth (email/password) +
// Firestore (cloud copy of the localStorage data), so a signed-in user's
// Database/Profile/etc. survive reinstalling the home-screen shortcut or
// switching devices, instead of living only in one browser's storage.
const firebaseConfig = {
  apiKey: "AIzaSyCv3i-Eetjr0zZ3ZNd-hPRRH_bTrjbs-yE",
  authDomain: "advanced-numerology-d3f0f.firebaseapp.com",
  projectId: "advanced-numerology-d3f0f",
  storageBucket: "advanced-numerology-d3f0f.firebasestorage.app",
  messagingSenderId: "521136780282",
  appId: "1:521136780282:web:121419fb086a7da70cea43",
};

firebase.initializeApp(firebaseConfig);
