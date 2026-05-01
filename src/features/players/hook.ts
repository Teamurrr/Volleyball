import { useEffect, useState } from "react";
import { subscribePlayers } from "./api";
import type { Player } from "../../entities/player";

export const usePlayers = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersError, setPlayersError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePlayers(
      (nextPlayers) => {
        setPlayers(nextPlayers);
        setPlayersError(null);
      },
      () => {
        setPlayers([]);
        setPlayersError("Не удалось загрузить игроков.");
      }
    );

    return () => unsubscribe();
  }, []);

  return { players, playersError };
};
