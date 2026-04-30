import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDDgxGwU52bmXXTC5NTk0zzbc4XTxNBRYU",
  authDomain: "dentalcaseapp.firebaseapp.com",
  projectId: "dentalcaseapp",
  storageBucket: "dentalcaseapp.firebasestorage.app",
  messagingSenderId: "775723476525",
  appId: "1:775723476525:web:513765e9a5b3494af6faa4",
  measurementId: "G-Q3X8LVB7W5"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);


