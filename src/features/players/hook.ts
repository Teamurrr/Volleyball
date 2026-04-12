import { useEffect, useState } from "react";
import { subscribePlayers } from "./api";
import type { Player } from "../../entities/player";

export const usePlayers = () => {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const unsubscribe = subscribePlayers(setPlayers);
    return () => unsubscribe();
  }, []);

  return { players };
};