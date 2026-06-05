import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { HandLandmarker as HandLandmarkerInstance } from "@mediapipe/tasks-vision";
import "./Lineup.scss";

import { normalizeAttendanceStatus, type Player } from "../../entities/player";
import {
  ALL_ZONES,
  FORMATION_SLOTS,
  TEAM_ZONES,
  ZONE_TITLES,
  type ZoneId,
  useLineupState
} from "./useLineupState";

const getPlayerStatusClass = (player: Player) =>
  normalizeAttendanceStatus(player.willCome) === "yes"
    ? "lineup-card-yes"
    : "lineup-card-maybe";

type CameraState = "idle" | "loading" | "ready" | "error";
type HandTrackingState = "idle" | "loading" | "ready" | "error";

type HandCursor = {
  id: string;
  x: number;
  y: number;
  pinched: boolean;
};

type VirtualPointer = {
  pressed: boolean;
  handId: string | null;
  x: number;
  y: number;
};

const PINCH_PRESS_FRAMES = 3;
const PINCH_RELEASE_FRAMES = 3;
const PINCH_ON_DISTANCE = 0.052;
const PINCH_OFF_DISTANCE = 0.07;
const HAND_CURSOR_SMOOTHING = 0.45;
const HAND_DETECTION_INTERVAL_MS = 50;
const POINTER_UPDATE_EPSILON = 0.6;
const HAND_CURSOR_Y_OFFSET = 4;
const ACTIVE_HAND_MATCH_RADIUS = 18;
const MISSING_HAND_GRACE_FRAMES = 6;
const DUPLICATE_HAND_CURSOR_RADIUS = 7;
const HAND_CURSOR_RENDER_EPSILON = 0.35;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const isSameVirtualPointer = (left: VirtualPointer, right: VirtualPointer) =>
  left.pressed === right.pressed &&
  left.handId === right.handId &&
  Math.abs(left.x - right.x) < POINTER_UPDATE_EPSILON &&
  Math.abs(left.y - right.y) < POINTER_UPDATE_EPSILON;

const getCursorDistance = (left: Pick<HandCursor, "x" | "y">, right: Pick<HandCursor, "x" | "y">) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const findNearestCursor = (
  cursors: HandCursor[],
  target: Pick<HandCursor, "x" | "y">,
  maxDistance = Number.POSITIVE_INFINITY
): HandCursor | null => {
  let bestCursor: HandCursor | null = null;
  let bestDistance = maxDistance;

  cursors.forEach((cursor) => {
    const distance = getCursorDistance(cursor, target);

    if (distance <= bestDistance) {
      bestCursor = cursor;
      bestDistance = distance;
    }
  });

  return bestCursor;
};

const dedupeHandCursors = (cursors: HandCursor[]) =>
  cursors.reduce<HandCursor[]>((uniqueCursors, cursor) => {
    const duplicateCursor = findNearestCursor(uniqueCursors, cursor, DUPLICATE_HAND_CURSOR_RADIUS);

    if (!duplicateCursor) {
      uniqueCursors.push(cursor);
      return uniqueCursors;
    }

    if (cursor.pinched && !duplicateCursor.pinched) {
      const duplicateIndex = uniqueCursors.indexOf(duplicateCursor);
      uniqueCursors[duplicateIndex] = cursor;
    }

    return uniqueCursors;
  }, []);

const isSameHandCursors = (left: HandCursor[], right: HandCursor[]) =>
  left.length === right.length &&
  left.every((leftCursor, index) => {
    const rightCursor = right[index];

    return (
      rightCursor &&
      leftCursor.id === rightCursor.id &&
      leftCursor.pinched === rightCursor.pinched &&
      Math.abs(leftCursor.x - rightCursor.x) < HAND_CURSOR_RENDER_EPSILON &&
      Math.abs(leftCursor.y - rightCursor.y) < HAND_CURSOR_RENDER_EPSILON
    );
  });

const Lineup = () => {
  const {
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
  } = useLineupState();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isCameraModeOpen, setIsCameraModeOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState("");
  const [handTrackingState, setHandTrackingState] = useState<HandTrackingState>("idle");
  const [handTrackingError, setHandTrackingError] = useState("");
  const [handCursors, setHandCursors] = useState<HandCursor[]>([]);
  const [virtualHoverTarget, setVirtualHoverTarget] = useState<{
    playerId: string | null;
    zoneId: ZoneId | null;
  }>({ playerId: null, zoneId: null });
  const [virtualDragPlayerId, setVirtualDragPlayerId] = useState<string | null>(null);
  const [virtualPointer, setVirtualPointer] = useState<VirtualPointer>({
    pressed: false,
    handId: null,
    x: 0,
    y: 0
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraModalPanelRef = useRef<HTMLElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarkerInstance | null>(null);
  const handFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastHandDetectionAtRef = useRef(0);
  const stableHandCursorsRef = useRef<Map<string, HandCursor>>(new Map());
  const handCursorsRef = useRef<HandCursor[]>([]);
  const virtualPointerRef = useRef<VirtualPointer>({ pressed: false, handId: null, x: 0, y: 0 });
  const virtualHoverTargetRef = useRef<{ playerId: string | null; zoneId: ZoneId | null }>({
    playerId: null,
    zoneId: null
  });
  const virtualDragRef = useRef<{ playerId: string | null }>({ playerId: null });
  const previousVirtualPressedRef = useRef(false);
  const pinchInputRef = useRef({
    activeHandId: null as string | null,
    isPressed: false,
    pressFrames: 0,
    releaseFrames: 0,
    missingFrames: 0
  });

  const updateVirtualPointerState = (nextPointer: VirtualPointer) => {
    if (isSameVirtualPointer(virtualPointerRef.current, nextPointer)) {
      return;
    }

    virtualPointerRef.current = nextPointer;
    setVirtualPointer(nextPointer);
  };

  const updateHandCursorsState = (nextCursors: HandCursor[]) => {
    if (isSameHandCursors(handCursorsRef.current, nextCursors)) {
      return;
    }

    handCursorsRef.current = nextCursors;
    setHandCursors(nextCursors);
  };

  const updateVirtualHoverTarget = (nextTarget: {
    playerId: string | null;
    zoneId: ZoneId | null;
  }) => {
    const previousTarget = virtualHoverTargetRef.current;

    if (
      previousTarget.playerId === nextTarget.playerId &&
      previousTarget.zoneId === nextTarget.zoneId
    ) {
      return;
    }

    virtualHoverTargetRef.current = nextTarget;
    setVirtualHoverTarget(nextTarget);
  };

  const closeCameraMode = useCallback(() => {
    setIsCameraModeOpen(false);
    setCameraState("idle");
    setCameraError("");
    setHandTrackingState("idle");
    setHandTrackingError("");
    setHandCursors([]);
    handCursorsRef.current = [];
    updateVirtualHoverTarget({ playerId: null, zoneId: null });
    setVirtualDragPlayerId(null);
    stableHandCursorsRef.current.clear();
    updateVirtualPointerState({ pressed: false, handId: null, x: 0, y: 0 });
    virtualDragRef.current = { playerId: null };
    previousVirtualPressedRef.current = false;
    setDraggedId(null);
    pinchInputRef.current = {
      activeHandId: null,
      isPressed: false,
      pressFrames: 0,
      releaseFrames: 0,
      missingFrames: 0
    };
  }, []);

  useEffect(() => {
    if (!isCameraModeOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCameraMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeCameraMode, isCameraModeOpen]);

  useEffect(() => {
    if (!isCameraModeOpen || cameraState !== "ready") {
      updateVirtualHoverTarget({ playerId: null, zoneId: null });
      setVirtualDragPlayerId(null);
      previousVirtualPressedRef.current = virtualPointer.pressed;
      return;
    }

    const panel = cameraModalPanelRef.current;

    if (!panel) {
      updateVirtualHoverTarget({ playerId: null, zoneId: null });
      previousVirtualPressedRef.current = virtualPointer.pressed;
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const pointerX = panelRect.left + (virtualPointer.x / 100) * panelRect.width;
    const pointerY = panelRect.top + (virtualPointer.y / 100) * panelRect.height;
    const elementUnderPointer = document.elementFromPoint(pointerX, pointerY);
    const playerElement = elementUnderPointer?.closest<HTMLElement>("[data-lineup-player-id]");
    const zoneElement = elementUnderPointer?.closest<HTMLElement>("[data-lineup-zone]");
    const wasPressed = previousVirtualPressedRef.current;
    const hoveredPlayerId = playerElement?.dataset.lineupPlayerId ?? null;
    const hoveredZoneId = zoneElement?.dataset.lineupZone as ZoneId | undefined;
    const nextHoverZone =
      hoveredZoneId && ALL_ZONES.includes(hoveredZoneId) ? hoveredZoneId : null;

    updateVirtualHoverTarget({
      playerId: hoveredPlayerId,
      zoneId: nextHoverZone
    });

    if (virtualPointer.pressed && !wasPressed) {
      const playerId = hoveredPlayerId;

      virtualDragRef.current = { playerId };
      setVirtualDragPlayerId(playerId);
      setDraggedId(playerId);
    }

    if (!virtualPointer.pressed && wasPressed) {
      const playerId = virtualDragRef.current.playerId;

      if (playerId) {
        const beforePlayerId = hoveredPlayerId;
        const targetZone = nextHoverZone;

        if (targetZone && ALL_ZONES.includes(targetZone)) {
          movePlayerToZone(
            playerId,
            targetZone,
            beforePlayerId && beforePlayerId !== playerId ? beforePlayerId : undefined
          );
        }
      }

      virtualDragRef.current = { playerId: null };
      setVirtualDragPlayerId(null);
      setDraggedId(null);
    }

    previousVirtualPressedRef.current = virtualPointer.pressed;
  }, [cameraState, isCameraModeOpen, movePlayerToZone, virtualPointer]);

  useEffect(() => {
    if (!isCameraModeOpen || cameraState !== "ready") {
      return;
    }

    let cancelled = false;
    const videoElement = videoRef.current;

    const startHandTracking = async () => {
      if (!videoElement) {
        setHandTrackingState("error");
        setHandTrackingError("Видео недоступно для распознавания руки.");
        return;
      }

      try {
        setHandTrackingState("loading");
        setHandTrackingError("");
        setHandCursors([]);
        handCursorsRef.current = [];
        stableHandCursorsRef.current.clear();
        updateVirtualPointerState({ pressed: false, handId: null, x: 0, y: 0 });
        pinchInputRef.current = {
          activeHandId: null,
          isPressed: false,
          pressFrames: 0,
          releaseFrames: 0,
          missingFrames: 0
        };
        lastVideoTimeRef.current = -1;
        lastHandDetectionAtRef.current = 0;

        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "GPU"
          },
          numHands: 2,
          runningMode: "VIDEO",
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        });

        if (cancelled) {
          handLandmarker.close();
          return;
        }

        handLandmarkerRef.current = handLandmarker;
        setHandTrackingState("ready");

        const updateVirtualPointer = (nextCursors: HandCursor[]) => {
          const pinchInput = pinchInputRef.current;
          const lastPointer = virtualPointerRef.current;
          const exactActiveCursor = pinchInput.activeHandId
            ? nextCursors.find((cursor) => cursor.id === pinchInput.activeHandId)
            : null;
          const nearbyActiveCursor = pinchInput.activeHandId
            ? findNearestCursor(nextCursors, lastPointer, ACTIVE_HAND_MATCH_RADIUS)
            : null;
          const trackedActiveCursor: HandCursor | null = exactActiveCursor ?? nearbyActiveCursor;
          const pinchedNearPointer: HandCursor | null = findNearestCursor(
            nextCursors.filter((cursor) => cursor.pinched),
            lastPointer,
            ACTIVE_HAND_MATCH_RADIUS
          );
          const hoveredCursor: HandCursor | null =
            trackedActiveCursor ??
            findNearestCursor(nextCursors, lastPointer) ??
            nextCursors[0] ??
            null;

          if (pinchInput.isPressed) {
            if (pinchedNearPointer !== null) {
              pinchInput.activeHandId = pinchedNearPointer.id;
              pinchInput.pressFrames = PINCH_PRESS_FRAMES;
              pinchInput.releaseFrames = 0;
              pinchInput.missingFrames = 0;

              updateVirtualPointerState({
                pressed: true,
                handId: pinchedNearPointer.id,
                x: pinchedNearPointer.x,
                y: pinchedNearPointer.y
              });
              return;
            }

            if (trackedActiveCursor) {
              pinchInput.activeHandId = trackedActiveCursor.id;
              pinchInput.missingFrames = 0;
              pinchInput.releaseFrames += 1;

              if (pinchInput.releaseFrames >= PINCH_RELEASE_FRAMES) {
                pinchInput.isPressed = false;
                pinchInput.activeHandId = null;
                pinchInput.releaseFrames = 0;
                pinchInput.missingFrames = 0;
              } else {
                updateVirtualPointerState({
                  pressed: true,
                  handId: trackedActiveCursor.id,
                  x: trackedActiveCursor.x,
                  y: trackedActiveCursor.y
                });
                return;
              }
            } else if (pinchInput.missingFrames < MISSING_HAND_GRACE_FRAMES) {
              pinchInput.missingFrames += 1;

              updateVirtualPointerState({
                pressed: true,
                handId: pinchInput.activeHandId,
                x: lastPointer.x,
                y: lastPointer.y
              });
              return;
            } else {
              pinchInput.isPressed = false;
              pinchInput.activeHandId = null;
              pinchInput.releaseFrames = 0;
              pinchInput.missingFrames = 0;
            }
          }

          const pinchedCursor = nextCursors.find((cursor) => cursor.pinched) ?? null;

          if (pinchedCursor) {
            pinchInput.activeHandId = pinchedCursor.id;
            pinchInput.pressFrames += 1;
            pinchInput.releaseFrames = 0;
            pinchInput.missingFrames = 0;

            if (pinchInput.pressFrames >= PINCH_PRESS_FRAMES) {
              pinchInput.isPressed = true;
            }

            updateVirtualPointerState({
              pressed: pinchInput.isPressed,
              handId: pinchedCursor.id,
              x: pinchedCursor.x,
              y: pinchedCursor.y
            });
            return;
          }

          pinchInput.pressFrames = 0;
          pinchInput.releaseFrames = 0;
          pinchInput.missingFrames = 0;

          updateVirtualPointerState({
            pressed: false,
            handId: hoveredCursor?.id ?? null,
            x: hoveredCursor?.x ?? 0,
            y: hoveredCursor?.y ?? 0
          });
        };

        const detectHand = () => {
          if (cancelled || !handLandmarkerRef.current) {
            return;
          }

          if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const videoTime = videoElement.currentTime;
            const now = performance.now();

            if (
              videoTime !== lastVideoTimeRef.current &&
              now - lastHandDetectionAtRef.current >= HAND_DETECTION_INTERVAL_MS
            ) {
              lastVideoTimeRef.current = videoTime;
              lastHandDetectionAtRef.current = now;
              const result = handLandmarkerRef.current.detectForVideo(
                videoElement,
                now
              );
              const rawCursors = result.landmarks.flatMap((landmarks, index) => {
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];

                if (!indexTip || !thumbTip) {
                  return [];
                }

                const handednessLabel =
                  result.handedness[index]?.[0]?.displayName ??
                  result.handedness[index]?.[0]?.categoryName ??
                  `hand-${index}`;
                const pinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                const id = `${handednessLabel}-${index}`;
                const x = clampPercent((1 - indexTip.x) * 100);
                const y = clampPercent(indexTip.y * 100 + HAND_CURSOR_Y_OFFSET);
                const previousCursor =
                  stableHandCursorsRef.current.get(id) ??
                  findNearestCursor([...stableHandCursorsRef.current.values()], { x, y }, ACTIVE_HAND_MATCH_RADIUS);
                const pinched = previousCursor?.pinched
                  ? pinchDistance < PINCH_OFF_DISTANCE
                  : pinchDistance < PINCH_ON_DISTANCE;

                return {
                  id,
                  x: previousCursor
                    ? previousCursor.x + (x - previousCursor.x) * HAND_CURSOR_SMOOTHING
                    : x,
                  y: previousCursor
                    ? previousCursor.y + (y - previousCursor.y) * HAND_CURSOR_SMOOTHING
                    : y,
                  pinched
                };
              });
              const nextCursors = dedupeHandCursors(rawCursors);
              const stableCursorEntries = new Map(
                nextCursors.map((cursor) => [cursor.id, cursor])
              );

              stableHandCursorsRef.current = stableCursorEntries;
              updateHandCursorsState(nextCursors);
              updateVirtualPointer(nextCursors);
            }
          }

          handFrameRef.current = window.requestAnimationFrame(detectHand);
        };

        detectHand();
      } catch {
        if (cancelled) {
          return;
        }

        setHandTrackingState("error");
        setHandTrackingError("Не удалось загрузить распознавание руки.");
      }
    };

    void startHandTracking();

    return () => {
      cancelled = true;

      if (handFrameRef.current != null) {
        window.cancelAnimationFrame(handFrameRef.current);
        handFrameRef.current = null;
      }

      handLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
    };
  }, [cameraState, isCameraModeOpen]);

  useEffect(() => {
    if (!isCameraModeOpen) {
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;
    const videoElement = videoRef.current;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("error");
        setCameraError("Браузер не поддерживает доступ к камере.");
        return;
      }

      try {
        setCameraState("loading");
        setCameraError("");

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 30, max: 30 }
          }
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoElement) {
          videoElement.srcObject = stream;
          await videoElement.play();
        }

        setCameraState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Нет разрешения на камеру."
            : "Не удалось запустить камеру.";

        setCameraState("error");
        setCameraError(message);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [isCameraModeOpen]);

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
        } ${
          virtualHoverTarget.playerId === player.id ? "lineup-card-virtual-hover" : ""
        } ${
          virtualDragPlayerId === player.id ? "lineup-card-virtual-selected" : ""
        }`}
        draggable
        data-lineup-player-id={player.id}
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
          <div className="lineup-player-meta">
            <span className="lineup-player-name">{player.name}</span>
            {/* {player.position && <span className="lineup-player-position">{player.position}</span>} */}
          </div>
        </div>

        <div className="lineup-elo">
          {/* <span className="lineup-elo-label">
            ELO
          </span> */}

          {player.position ? (
            <span className="lineup-player-position">
              {player.position}
            </span>
          ) : (
            <span className="lineup-elo-label">
              ELO
            </span>
          )}

          <strong>{player.elo ?? 0}</strong>
        </div>
      </article>
    );
  };

  const renderLineupWorkspace = () => (
    <>
      <section className="lineup-formations">
        <div className="lineup-formations-header">
          <h2>Расстановки</h2>
        </div>

        <div className="lineup-formations-grid">
          {FORMATION_SLOTS.map((slotId, index) => (
            <article key={slotId} className="formation-card">
              <div className="formation-card-top">
                <h3>Расстановка {index + 1}</h3>
                <p>{getFormationSummary(slotId)}</p>
              </div>

              <div className="formation-card-actions">
                <button
                  type="button"
                  className="formation-button"
                  onClick={() => saveFormation(slotId)}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="formation-button formation-button-secondary"
                  onClick={() => applyFormation(slotId)}
                  disabled={!savedFormations[slotId]}
                >
                  Применить
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lineup-teams-grid">
        {TEAM_ZONES.map((zoneId) => (
          <section
            key={zoneId}
            className={`team-dropzone ${
              collapsedTeams[zoneId] ? "team-dropzone-collapsed" : ""
            } ${
              virtualHoverTarget.zoneId === zoneId ? "team-dropzone-virtual-hover" : ""
            }`}
            data-lineup-zone={zoneId}
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
                  ? getSortedZonePlayerIds(zoneId).slice(0, 2)
                  : getSortedZonePlayerIds(zoneId)
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
        className={`lineup-board ${
          virtualHoverTarget.zoneId === "pool" ? "lineup-board-virtual-hover" : ""
        }`}
        data-lineup-zone="pool"
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
            {getSortedZonePlayerIds("pool").map(renderPlayerCard)}
          </div>
        ) : (
          <div className="lineup-empty">
            Все игроки уже распределены по командам.
          </div>
        )}
      </section>
    </>
  );

  const getHandCursorStyle = (handCursor: HandCursor) => {
    return {
      left: `${handCursor.x}%`,
      top: `${handCursor.y}%`
    };
  };

  const getVirtualDragStatus = () => {
    if (virtualDragPlayerId) {
      const playerName = playersMap.get(virtualDragPlayerId)?.name ?? "Игрок";
      const zoneName = virtualHoverTarget.zoneId
        ? ZONE_TITLES[virtualHoverTarget.zoneId]
        : "выбери зону";

      return `${playerName} → ${zoneName}`;
    }

    return virtualPointer.pressed ? "ЛКМ зажата" : "Сожми пальцы для ЛКМ";
  };

  return (
    <main className="lineup-page">
      <div className="lineup-shell">
        <header className="lineup-header">
          <div>
            <p className="lineup-kicker">Игровой состав</p>
            <h1>Команды</h1>
            <p className="lineup-subtitle">
              name - girl <br /> dobro - middle quality player <br />anykey - almost good at everything <br /> all-round - good at everything <br />X - mbappe mentality
            </p>
          </div>

          <div className="lineup-header-actions">
            <div className={`lineup-save-state lineup-save-state-${saveState}`}>
              {saveState === "saving" ? "Сохраняем..." : saveState === "saved" ? "Сохранено" : "Автосохранение"}
            </div>

            <div className="lineup-links">
              <button
                type="button"
                className="lineup-link lineup-link-secondary"
                onClick={() => setIsCameraModeOpen(true)}
              >
                Camera mode
              </button>
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

        {renderLineupWorkspace()}
      </div>

      {isCameraModeOpen && (
        <div
          className="lineup-camera-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCameraMode();
            }
          }}
        >
          <section
            ref={cameraModalPanelRef}
            className="lineup-camera-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lineup-camera-title"
          >
            <header className="lineup-camera-modal-header">
              <div>
                <p className="lineup-kicker">Camera mode</p>
                <h2 id="lineup-camera-title">Команды</h2>
              </div>

              <button
                type="button"
                className="lineup-link lineup-link-secondary"
                onClick={closeCameraMode}
              >
                Закрыть
              </button>
            </header>

            <div className="lineup-camera-modal-content">
              <div className="lineup-camera-preview" aria-label="Camera preview">
                <video
                  ref={videoRef}
                  className="lineup-camera-video"
                  autoPlay
                  muted
                  playsInline
                />

                {cameraState !== "ready" && (
                  <div className="lineup-camera-overlay">
                    <span className={`lineup-camera-status lineup-camera-status-${cameraState}`}>
                      {cameraState === "loading"
                        ? "Запускаем камеру..."
                        : cameraState === "error"
                          ? cameraError
                          : "Камера включится после разрешения доступа"}
                    </span>
                  </div>
                )}

                {cameraState === "ready" && (
                  <div
                    className={`lineup-hand-tracking-status lineup-hand-tracking-status-${handTrackingState}`}
                  >
                    {handTrackingState === "loading"
                      ? "Загружаем распознавание рук..."
                      : handTrackingState === "error"
                        ? handTrackingError
                        : virtualPointer.pressed
                          ? "ЛКМ зажата"
                          : handCursors.length > 0
                            ? handCursors.some((cursor) => cursor.pinched)
                              ? "Pinch..."
                              : `Рук найдено: ${handCursors.length}`
                            : "Покажи руки камере"}
                  </div>
                )}

                {cameraState === "ready" && handTrackingState === "ready" && (
                  <div
                    className={`lineup-virtual-click-status ${
                      virtualPointer.pressed ? "lineup-virtual-click-status-pressed" : ""
                    }`}
                  >
                    {getVirtualDragStatus()}
                  </div>
                )}

              </div>
              <div className="lineup-camera-workspace">
                {renderLineupWorkspace()}
              </div>
            </div>

            {cameraState === "ready" &&
              handCursors.map((handCursor, index) => (
                <div
                  key={handCursor.id}
                  className={`lineup-hand-cursor ${
                    handCursor.pinched ? "lineup-hand-cursor-pinched" : ""
                  } ${
                    virtualPointer.pressed && virtualPointer.handId === handCursor.id
                      ? "lineup-hand-cursor-pressed"
                      : ""
                  } ${
                    draggedId && virtualPointer.handId === handCursor.id
                      ? "lineup-hand-cursor-dragging"
                      : ""
                  } ${index === 0 ? "lineup-hand-cursor-primary" : "lineup-hand-cursor-secondary"}`}
                  style={getHandCursorStyle(handCursor)}
                />
              ))}
          </section>
        </div>
      )}
    </main>
  );
};

export default Lineup;
