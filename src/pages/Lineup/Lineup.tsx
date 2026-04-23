import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "./Lineup.scss";

import { db } from "../../app/firebase";
import { normalizeAttendanceStatus, type Player } from "../../entities/player";
import { usePlayers } from "../../features/players/hook";

type ZoneId = "team1" | "team2" | "team3" | "pool";
type SaveState = "idle" | "saving" | "saved";

type StoredLineup = Partial<Record<ZoneId, string[]>>;

const ZONE_TITLES: Record<ZoneId, string> = {
  team1: "Команда 1",
  team2: "Команда 2",
  team3: "Команда 3",
  pool: "Игроки"
};

const TEAM_ZONES: ZoneId[] = ["team1", "team2", "team3"];
const ALL_ZONES: ZoneId[] = ["team1", "team2", "team3", "pool"];
const LINEUP_DOC_ID = "current";

const getAttendancePriority = (value: Player["willCome"]) => {
  if (value === "yes") return 0;
  if (value === "maybe") return 1;
  return 2;
};

const createEmptyZones = (): Record<ZoneId, string[]> => ({
  team1: [],
  team2: [],
  team3: [],
  pool: []
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

const getPlayerStatusClass = (player: Player) =>
  normalizeAttendanceStatus(player.willCome) === "yes"
    ? "lineup-card-yes"
    : "lineup-card-maybe";

const Lineup = () => {
  const { players } = usePlayers();
  const [zonePlayers, setZonePlayers] = useState<Record<ZoneId, string[]>>(createEmptyZones);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<ZoneId, boolean>>({
    team1: false,
    team2: false,
    team3: false,
    pool: false
  });
  const [layoutReady, setLayoutReady] = useState(false);
  const [savedZones, setSavedZones] = useState<StoredLineup | null>(null);
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
          const leftStatus = normalizeAttendanceStatus(left.willCome);
          const rightStatus = normalizeAttendanceStatus(right.willCome);
          return getAttendancePriority(leftStatus) - getAttendancePriority(rightStatus);
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
      const lineupRef = doc(db, "lineup", LINEUP_DOC_ID);
      const snapshot = await getDoc(lineupRef);

      if (cancelled) {
        return;
      }

      const savedZones = snapshot.exists()
        ? (snapshot.data().zones as StoredLineup | undefined) ?? createEmptyZones()
        : createEmptyZones();

      setSavedZones(savedZones);
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
      setSaveState("saving");

      await setDoc(doc(db, "lineup", LINEUP_DOC_ID), {
        zones: zonePlayers,
        updatedAt: Date.now()
      });

      setSaveState("saved");
    }, 450);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [hasHydratedSavedLayout, layoutReady, zonePlayers]);

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

  const resetTeams = () => {
    setZonePlayers({
      team1: [],
      team2: [],
      team3: [],
      pool: visiblePlayerIds
    });
  };

  const renderPlayerCard = (playerId: string) => {
    const player = playersMap.get(playerId);

    if (!player) {
      return null;
    }

    return (
      <article
        key={player.id}
        className={`lineup-card ${getPlayerStatusClass(player)} ${
          draggedId === player.id ? "is-dragging" : ""
        }`}
        draggable
        onDragStart={() => setDraggedId(player.id)}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => {
          if (!draggedId || draggedId === player.id) return;

          const targetZone = ALL_ZONES.find((zoneId) => zonePlayers[zoneId].includes(player.id));
          if (!targetZone) return;

          movePlayerToZone(draggedId, targetZone, player.id);
          setDraggedId(null);
        }}
      >
        <div className="lineup-card-main">
          <span className="lineup-status-dot" />
          <span className="lineup-player-name">{player.name}</span>
        </div>

        <div className="lineup-elo">
          <span className="lineup-elo-label">ELO</span>
          <strong>{player.elo ?? 0}</strong>
        </div>
      </article>
    );
  };

  return (
    <main className="lineup-page">
      <div className="lineup-shell">
        <header className="lineup-header">
          <div>
            <p className="lineup-kicker">Игровой состав</p>
            <h1>Команды</h1>
            <p className="lineup-subtitle">
              Нужно нажать и зажать имя игрока а потом перетащить его в команду. На телефоне можно одним пальцем 
              держать игрока а другим скролить страницу
            </p>
          </div>

          <div className="lineup-header-actions">
            <div className={`lineup-save-state lineup-save-state-${saveState}`}>
              {saveState === "saving" ? "Сохраняем..." : saveState === "saved" ? "Сохранено" : "Автосохранение"}
            </div>

            <div className="lineup-links">
              <button
                type="button"
                className="lineup-link lineup-link-reset"
                onClick={resetTeams}
              >
                Очистить команды
              </button>
              <Link className="lineup-link" to="/">
                Главная
              </Link>
              
            </div>
          </div>
        </header>

        <section className="lineup-teams-grid">
          {TEAM_ZONES.map((zoneId) => (
            <section
              key={zoneId}
              className={`team-dropzone ${
                collapsedTeams[zoneId] ? "team-dropzone-collapsed" : ""
              }`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggedId) return;
                movePlayerToZone(draggedId, zoneId);
                setDraggedId(null);
              }}
            >
              <div className="team-dropzone-header">
                <div>
                  <h2>{ZONE_TITLES[zoneId]}</h2>
                  <p>
                    {zonePlayers[zoneId].length} игроков
                    {" · "}
                    Overall ELO: {getZoneEloTotal(zoneId)}
                  </p>
                </div>

                <button
                  type="button"
                  className="team-collapse-button"
                  onClick={() => toggleTeamCollapse(zoneId)}
                >
                  {collapsedTeams[zoneId] ? "Развернуть" : "Свернуть"}
                </button>
              </div>

              {zonePlayers[zoneId].length > 0 ? (
                <div className="team-dropzone-list">
                  {(collapsedTeams[zoneId]
                    ? zonePlayers[zoneId].slice(0, 2)
                    : zonePlayers[zoneId]
                  ).map(renderPlayerCard)}
                </div>
              ) : (
                <div className="lineup-empty team-dropzone-empty">
                  Перетащи сюда игроков
                </div>
              )}

              {collapsedTeams[zoneId] && zonePlayers[zoneId].length > 2 && (
                <p className="team-collapsed-note">
                  Еще скрыто: {zonePlayers[zoneId].length - 2}
                </p>
              )}
            </section>
          ))}
        </section>

        <section
          className="lineup-board"
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (!draggedId) return;
            movePlayerToZone(draggedId, "pool");
            setDraggedId(null);
          }}
        >
          <div className="lineup-board-header">
            <h2>{ZONE_TITLES.pool}</h2>
            <p>{zonePlayers.pool.length} Доступно</p>
          </div>

          {zonePlayers.pool.length > 0 ? (
            <div className="lineup-list">
              {zonePlayers.pool.map(renderPlayerCard)}
            </div>
          ) : (
            <div className="lineup-empty">
              Все игроки уже распределены по командам.
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default Lineup;
