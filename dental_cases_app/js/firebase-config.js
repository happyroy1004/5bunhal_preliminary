import { initializeApp } from "[gstatic.com](https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js)";
import { getAuth } from "[gstatic.com](https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js)";
import { getFirestore } from "[gstatic.com](https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js)";
import { getStorage } from "[gstatic.com](https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js)";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
