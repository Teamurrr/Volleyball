import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
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

const temperatureFirebaseConfig = {
  apiKey: "AIzaSyC929fAMDt9rPegQWLb_veehh67Bn5dZ0s",
  authDomain: "temperaturedata-68177.firebaseapp.com",
  databaseURL: "https://temperaturedata-68177-default-rtdb.firebaseio.com",
  projectId: "temperaturedata-68177",
  storageBucket: "temperaturedata-68177.firebasestorage.app",
  messagingSenderId: "819491718849",
  appId: "1:819491718849:web:3f5b0cb01a3d30947fb640",
  measurementId: "G-ZVT9WSNQV0"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const temperatureApp =
  getApps().find((currentApp) => currentApp.name === "temperature") ??
  initializeApp(temperatureFirebaseConfig, "temperature");
export const db = getFirestore(app);
export const database = getDatabase(temperatureApp);
