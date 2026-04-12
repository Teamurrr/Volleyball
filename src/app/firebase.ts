import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCwtjj3eIS-rFVfzZhF4QmWEHImwDpkDvA",
  authDomain: "volleyball-c0949.firebaseapp.com",
  projectId: "volleyball-c0949",
  storageBucket: "volleyball-c0949.firebasestorage.app",
  messagingSenderId: "162106430759",
  appId: "1:162106430759:web:ae4185248cdedec2b34502",
  measurementId: "G-WVG8SBY4GD"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);