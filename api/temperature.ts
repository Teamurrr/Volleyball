import type { VercelRequest, VercelResponse } from "@vercel/node";

import { initializeApp } from "firebase/app";

import {
  getFirestore,
  doc,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCwtjj3eIS-rFVfzZhF4QmWEHImwDpkDvA",
  authDomain: "volleyball-c0949.firebaseapp.com",
  projectId: "volleyball-c0949",
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { temperature } = req.body;

  await setDoc(doc(db, "sensors", "room1"), {
    temperature,
    updatedAt: Date.now(),
  });

  return res.status(200).json({
    success: true,
  });
}