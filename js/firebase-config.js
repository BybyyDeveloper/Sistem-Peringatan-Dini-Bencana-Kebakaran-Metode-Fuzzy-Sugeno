// Firebase Realtime Database + Auth (compat SDK v10)
// Sumber config dari artifacts/fire-detection/src/lib/firebase.ts

const firebaseConfig = {
  apiKey: "AIzaSyCENAooLDpKoTLjQaeuS-6JonVM0yyn-PM",
  authDomain: "antar-e665e.firebaseapp.com",
  databaseURL: "https://antar-e665e-default-rtdb.firebaseio.com",
  projectId: "antar-e665e",
  storageBucket: "antar-e665e.firebasestorage.app",
  messagingSenderId: "627733459783",
  appId: "1:627733459783:web:6ffc693f37d5e85e42d262",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.database();
