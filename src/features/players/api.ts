import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../app/firebase";
import { normalizeAttendanceStatus, type Player } from "../../entities/player";

export const subscribePlayers = (callback: (players: Player[]) => void) => {
  return onSnapshot(collection(db, "players"), snapshot => {
    const data = snapshot.docs.map((doc) => {
      const value = doc.data();

      return {
        id: doc.id,
        ...value,
        willCome: normalizeAttendanceStatus(value.willCome as Player["willCome"] | boolean | undefined)
      };
    }) as Player[];

    callback(data);
  });
};

export const addPlayer = async (player: Omit<Player, "id">) => {
  await addDoc(collection(db, "players"), player);
};

export const updatePlayer = async (id: string, data: Partial<Player>) => {
  await updateDoc(doc(db, "players", id), data);
};

export const deletePlayer = async (id: string) => {
  await deleteDoc(doc(db, "players", id));
};
