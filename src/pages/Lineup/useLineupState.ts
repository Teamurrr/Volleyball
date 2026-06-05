import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../../app/firebase";
import { normalizeAttendanceStatus } from "../../entities/player";
import { usePlayers } from "../../features/players/hook";

export type ZoneId = "team1" | "team2" | "team3" | "pool";
export type SaveState = "idle" | "saving" | "saved";
export type FormationSlotId = "slot1" | "slot2" | "slot3" | "slot4";

export type StoredLineup = Partial<Record<ZoneId, string[]>>;
export type SavedFormations = Record<FormationSlotId, StoredLineup | null>;

export const ZONE_TITLES: Record<ZoneId, string> = {
  team1: "Команда 1",
  team2: "Команда 2",
  team3: "Команда 3",
  pool: "Игроки"
};

export const TEAM_ZONES: ZoneId[] = ["team1", "team2", "team3"];
export const ALL_ZONES: ZoneId[] = ["team1", "team2", "team3", "pool"];
export const FORMATION_SLOTS: FormationSlotId[] = ["slot1", "slot2", "slot3", "slot4"];

const LINEUP_DOC_ID = "current";

const createEmptyZones = (): Record<ZoneId, string[]> => ({
  team1: [],
  team2: [],
  team3: [],
  pool: []
});

const createEmptyFormations = (): SavedFormations => ({
  slot1: null,
  slot2: null,
  slot3: null,
  slot4: null
});

const syncZonesWithVisiblePlayers = (
  currentZones: StoredLineup,
  visiblePlayerIds: string[]
): Record<ZoneId, string[]> => {
  const usedIds = new Set<string>();
  const next = createEmptyZones();

  ALL_ZONES.forEach((zoneId) => {
    const sourceIds = currentZones[zoneId] ?? [];

    sourceIds.forEach((playerId) => {
      if (!visiblePlayerIds.includes(playerId) || usedIds.has(playerId)) {
        return;
      }

      next[zoneId].push(playerId);
      usedIds.add(playerId);
    });
  });

  visiblePlayerIds.forEach((playerId) => {
    if (!usedIds.has(playerId)) {
      next.pool.push(playerId);
    }
  });

  return next;
};

export const useLineupState = () => {
  const { players } = usePlayers();
  const [zonePlayers, setZonePlayers] = useState<Record<ZoneId, string[]>>(createEmptyZones);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<ZoneId, boolean>>({
    team1: false,
    team2: false,
    team3: false,
    pool: false
  });
  const [layoutReady, setLayoutReady] = useState(false);
  const [savedZones, setSavedZones] = useState<StoredLineup | null>(null);
  const [savedFormations, setSavedFormations] = useState<SavedFormations>(
    createEmptyFormations
  );
  const [hasHydratedSavedLayout, setHasHydratedSavedLayout] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const visiblePlayers = useMemo(
    () =>
      [...players]
        .filter((player) => {
          const status = normalizeAttendanceStatus(player.willCome);
          return status === "yes" || status === "maybe";
        })
        .sort((left, right) => {
          const eloDiff = (right.elo ?? 0) - (left.elo ?? 0);
          if (eloDiff !== 0) {
            return eloDiff;
          }

          return left.name.localeCompare(right.name);
        }),
    [players]
  );

  const visiblePlayerIds = useMemo(
    () => visiblePlayers.map((player) => player.id),
    [visiblePlayers]
  );

  const playersMap = useMemo(
    () => new Map(visiblePlayers.map((player) => [player.id, player])),
    [visiblePlayers]
  );

  useEffect(() => {
    let cancelled = false;

    const loadLayout = async () => {
      try {
        const lineupRef = doc(db, "lineup", LINEUP_DOC_ID);
        const snapshot = await getDoc(lineupRef);

        if (cancelled) {
          return;
        }

        const savedZones = snapshot.exists()
          ? (snapshot.data().zones as StoredLineup | undefined) ?? createEmptyZones()
          : createEmptyZones();
        const formations = snapshot.exists()
          ? {
              ...createEmptyFormations(),
              ...((snapshot.data().formations as Partial<SavedFormations> | undefined) ?? {})
            }
          : createEmptyFormations();

        setSavedZones(savedZones);
        setSavedFormations(formations);
      } catch {
        setSavedZones(createEmptyZones());
        setSavedFormations(createEmptyFormations());
      }

      setLayoutReady(true);
      setSaveState("idle");
    };

    void loadLayout();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!layoutReady) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZonePlayers((current) =>
      syncZonesWithVisiblePlayers(
        hasHydratedSavedLayout ? current : savedZones ?? current,
        visiblePlayerIds
      )
    );

    if (!hasHydratedSavedLayout) {
      setHasHydratedSavedLayout(true);
    }
  }, [hasHydratedSavedLayout, layoutReady, savedZones, visiblePlayerIds]);

  useEffect(() => {
    if (!layoutReady || !hasHydratedSavedLayout) {
      return;
    }

    const saveTimer = window.setTimeout(async () => {
      try {
        setSaveState("saving");

        await setDoc(doc(db, "lineup", LINEUP_DOC_ID), {
          zones: zonePlayers,
          formations: savedFormations,
          updatedAt: Date.now()
        });

        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 450);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [hasHydratedSavedLayout, layoutReady, savedFormations, zonePlayers]);

  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }

    const resetTimer = window.setTimeout(() => {
      setSaveState("idle");
    }, 1800);

    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [saveState]);

  const movePlayerToZone = (playerId: string, targetZone: ZoneId, beforePlayerId?: string) => {
    setZonePlayers((current) => {
      const next = ALL_ZONES.reduce(
        (acc, zoneId) => {
          acc[zoneId] = current[zoneId].filter((id) => id !== playerId);
          return acc;
        },
        createEmptyZones()
      );

      const targetList = [...next[targetZone]];
      const targetIndex =
        beforePlayerId != null ? targetList.indexOf(beforePlayerId) : -1;

      if (targetIndex >= 0) {
        targetList.splice(targetIndex, 0, playerId);
      } else {
        targetList.push(playerId);
      }

      next[targetZone] = targetList;
      return next;
    });
  };

  const toggleTeamCollapse = (zoneId: ZoneId) => {
    setCollapsedTeams((current) => ({
      ...current,
      [zoneId]: !current[zoneId]
    }));
  };

  const getZoneEloTotal = (zoneId: ZoneId) =>
    zonePlayers[zoneId].reduce((total, playerId) => {
      const player = playersMap.get(playerId);
      return total + (player?.elo ?? 0);
    }, 0);

  const getSortedZonePlayerIds = (zoneId: ZoneId) =>
    [...zonePlayers[zoneId]].sort((leftId, rightId) => {
      const leftPlayer = playersMap.get(leftId);
      const rightPlayer = playersMap.get(rightId);
      const eloDiff = (rightPlayer?.elo ?? 0) - (leftPlayer?.elo ?? 0);

      if (eloDiff !== 0) {
        return eloDiff;
      }

      return (leftPlayer?.name ?? "").localeCompare(rightPlayer?.name ?? "");
    });

  const resetTeams = () => {
    setZonePlayers({
      team1: [],
      team2: [],
      team3: [],
      pool: visiblePlayerIds
    });
  };

  const saveFormation = (slotId: FormationSlotId) => {
    setSavedFormations((current) => ({
      ...current,
      [slotId]: {
        team1: [...zonePlayers.team1],
        team2: [...zonePlayers.team2],
        team3: [...zonePlayers.team3],
        pool: [...zonePlayers.pool]
      }
    }));
  };

  const applyFormation = (slotId: FormationSlotId) => {
    const formation = savedFormations[slotId];
    if (!formation) return;

    setZonePlayers(syncZonesWithVisiblePlayers(formation, visiblePlayerIds));
  };

  const getFormationSummary = (slotId: FormationSlotId) => {
    const formation = savedFormations[slotId];
    if (!formation) return "Пусто";

    return `${TEAM_ZONES.reduce(
      (count, zoneId) => count + (formation[zoneId]?.length ?? 0),
      0
    )} игроков сохранено`;
  };

  return {
    playersMap,
    zonePlayers,
    collapsedTeams,
    savedFormations,
    saveState,
    movePlayerToZone,
    toggleTeamCollapse,
    getZoneEloTotal,
    getSortedZonePlayerIds,
    resetTeams,
    saveFormation,
    applyFormation,
    getFormationSummary
  };
};
