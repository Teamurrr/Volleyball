import { useEffect, useMemo, useState } from "react";
import "./Admin.scss";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { db } from "../../app/firebase";
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  doc
} from "firebase/firestore";
import {
  normalizeAttendanceStatus,
  type AttendanceStatus,
  type Player
} from "../../entities/player";
import type { AttendanceReportPlayer } from "../../entities/attendanceReport";
import { addPlayer, deletePlayer, updatePlayer } from "../../features/players/api";
import { usePlayers } from "../../features/players/hook";
import { createAttendanceReport } from "../../features/reports/api";

type Place = {
  id: string;
  name: string;
  address: string;
  addressLink?: string;
  image: string;
  weekday?: string;
  time?: string;
  isMain?: boolean;
};

type PlayerDraft = Omit<Player, "id" | "elo"> & {
  elo: number | "";
};

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "22:00";
const DEFAULT_PLAYER_elo = 0;
const INFO_DOC_ID = "info";
const WEEKDAY_OPTIONS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье"
] as const;
type Weekday = (typeof WEEKDAY_OPTIONS)[number];
const isWeekday = (value?: string): value is Weekday =>
  value != null && WEEKDAY_OPTIONS.includes(value as Weekday);

const parseTimeRange = (value?: string) => {
  if (!value) {
    return {
      start: DEFAULT_START_TIME,
      end: DEFAULT_END_TIME
    };
  }

  const normalized = value.replace("—", "-");
  const [start, end] = normalized.split("-").map((item) => item.trim());

  return {
    start: start || DEFAULT_START_TIME,
    end: end || DEFAULT_END_TIME
  };
};

const buildTimeRange = (start: string, end: string) => `${start} - ${end}`;

const getAttendancePriority = (value: AttendanceStatus) => {
  if (value === "yes") return 0;
  if (value === "maybe") return 1;
  return 2;
};

const Admin = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const { players } = usePlayers();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [addressLink, setAddressLink] = useState("");
  const [image, setImage] = useState("");
  const [weekday, setWeekday] = useState<Weekday>(WEEKDAY_OPTIONS[0]);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [isMain, setIsMain] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [newPlaceAddressLink, setNewPlaceAddressLink] = useState("");
  const [newPlaceImage, setNewPlaceImage] = useState("");
  const [newPlaceWeekday, setNewPlaceWeekday] = useState<Weekday>(WEEKDAY_OPTIONS[0]);
  const [newPlaceStartTime, setNewPlaceStartTime] = useState(DEFAULT_START_TIME);
  const [newPlaceEndTime, setNewPlaceEndTime] = useState(DEFAULT_END_TIME);
  const [newPlaceIsMain, setNewPlaceIsMain] = useState(false);
  const [isSavingPlace, setIsSavingPlace] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [infoId, setInfoId] = useState("");
  const [passLink, setPassLink] = useState("");
  const [qrCodeLink, setQrCodeLink] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerPosition, setPlayerPosition] = useState("");
  const [playerPhoto, setPlayerPhoto] = useState("");
  const [playerelo, setPlayerelo] = useState(String(DEFAULT_PLAYER_elo));
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [isSavingAllPlayers, setIsSavingAllPlayers] = useState(false);
  const [isResettingAllPlayers, setIsResettingAllPlayers] = useState(false);
  const [isSavingAttendanceReport, setIsSavingAttendanceReport] = useState(false);
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, PlayerDraft>>({});
  const pendingScrollRestoreRef = useRef<number | null>(null);

  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) => {
        const left = normalizeAttendanceStatus(playerDrafts[a.id]?.willCome ?? a.willCome);
        const right = normalizeAttendanceStatus(playerDrafts[b.id]?.willCome ?? b.willCome);

        return getAttendancePriority(left) - getAttendancePriority(right);
      }),
    [playerDrafts, players]
  );

  const fetchPlaces = async () => {
    try {
      const snap = await getDocs(collection(db, "places"));

      const data: Place[] = snap.docs.map((d) => {
        const dd = d.data();
        return {
          id: d.id,
          name: dd.name,
          address: dd.address,
          addressLink: dd.addressLink,
          image: dd.image,
          weekday: dd.weekday,
          time: dd.time,
          isMain: dd.isMain
        };
      });

      setPlaces(data);
    } catch {
      setPlaces([]);
    }
  };

  const fetchInfo = async () => {
    try {
      const infoRef = doc(db, "info", INFO_DOC_ID);
      const infoDoc = await getDoc(infoRef);

      if (!infoDoc.exists()) {
        setInfoId("");
        setPassLink("");
        setQrCodeLink("");
        setTotalPaid("");
        return;
      }

      const value = infoDoc.data();

      setInfoId(infoDoc.id);
      setPassLink(value.pass || "");
      setQrCodeLink(value.qrcode || "");
      setTotalPaid(value.totalPaid != null ? String(value.totalPaid) : "");
    } catch {
      setInfoId("");
      setPassLink("");
      setQrCodeLink("");
      setTotalPaid("");
    }
  };

  useEffect(() => {
    void fetchPlaces();
    void fetchInfo();
  }, []);

  useEffect(() => {
    setPlayerDrafts((current) => {
      const next: Record<string, PlayerDraft> = {};

      players.forEach((player) => {
        next[player.id] = current[player.id] ?? {
          name: player.name,
          position: player.position ?? "",
          willCome: normalizeAttendanceStatus(player.willCome),
          paid: player.paid,
          photo: player.photo,
          elo: player.elo ?? DEFAULT_PLAYER_elo
        };
      });

      return next;
    });
  }, [players]);

  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current == null) return;

    window.scrollTo({ top: pendingScrollRestoreRef.current });
    pendingScrollRestoreRef.current = null;
  }, [sortedPlayers]);

  const handleSelect = (id: string) => {
    setSelectedId(id);

    const place = places.find((item) => item.id === id);
    if (!place) return;

    setName(place.name);
    setAddress(place.address);
    setAddressLink(place.addressLink || "");
    setImage(place.image);
    setWeekday(isWeekday(place.weekday) ? place.weekday : WEEKDAY_OPTIONS[0]);
    const parsedTime = parseTimeRange(place.time);
    setStartTime(parsedTime.start);
    setEndTime(parsedTime.end);
    setIsMain(!!place.isMain);
  };

  const updatePlace = async () => {
    if (!selectedId) return;

    if (isMain) {
      for (const place of places) {
        await updateDoc(doc(db, "places", place.id), {
          isMain: false
        });
      }
    }

    await updateDoc(doc(db, "places", selectedId), {
      name,
      address,
      addressLink,
      image,
      weekday,
      time: buildTimeRange(startTime, endTime),
      isMain
    });

    void fetchPlaces();
  };

  const createPlace = async () => {
    if (!newPlaceName.trim() || !newPlaceAddress.trim()) {
      setPlaceError("Заполни название и адрес.");
      return;
    }

    setIsSavingPlace(true);
    setPlaceError("");

    try {
      if (newPlaceIsMain) {
        for (const place of places) {
          await updateDoc(doc(db, "places", place.id), {
            isMain: false
          });
        }
      }

      await addDoc(collection(db, "places"), {
        name: newPlaceName.trim(),
        address: newPlaceAddress.trim(),
        addressLink: newPlaceAddressLink.trim(),
        image: newPlaceImage.trim(),
        weekday: newPlaceWeekday,
        time: buildTimeRange(newPlaceStartTime, newPlaceEndTime),
        isMain: newPlaceIsMain
      });

      setNewPlaceName("");
      setNewPlaceAddress("");
      setNewPlaceAddressLink("");
      setNewPlaceImage("");
      setNewPlaceWeekday(WEEKDAY_OPTIONS[0]);
      setNewPlaceStartTime(DEFAULT_START_TIME);
      setNewPlaceEndTime(DEFAULT_END_TIME);
      setNewPlaceIsMain(false);

      await fetchPlaces();
    } catch {
      setPlaceError("Не удалось сохранить зал. Проверь подключение к Firebase и права записи.");
    } finally {
      setIsSavingPlace(false);
    }
  };

  const createPlayer = async () => {
    if (!playerName.trim()) return;

    setIsSavingPlayer(true);

    try {
      await addPlayer({
        name: playerName.trim(),
        position: playerPosition.trim(),
        willCome: "no",
        paid: false,
        photo: playerPhoto.trim() || "https://via.placeholder.com/80?text=Player",
        elo: Number(playerelo) || DEFAULT_PLAYER_elo
      });

      setPlayerName("");
      setPlayerPosition("");
      setPlayerPhoto("");
      setPlayerelo(String(DEFAULT_PLAYER_elo));
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const setPlayerAttendance = async (
    player: Player,
    willCome: AttendanceStatus
  ) => {
    await updatePlayer(player.id, { willCome });
  };

  const preserveScrollPosition = () => {
    pendingScrollRestoreRef.current = window.scrollY;
  };

  const saveInfo = async () => {
    const payload = {
      pass: passLink.trim(),
      qrcode: qrCodeLink.trim(),
      totalPaid: totalPaid.trim() ? Number(totalPaid) : 0
    };

    if (infoId) {
      await updateDoc(doc(db, "info", infoId), payload);
    } else {
      await setDoc(doc(db, "info", INFO_DOC_ID), payload, { merge: true });
      setInfoId(INFO_DOC_ID);
    }
  };

  const updatePlayerDraft = <K extends keyof PlayerDraft>(
    playerId: string,
    field: K,
    value: PlayerDraft[K]
  ) => {
    setPlayerDrafts((current) => ({
      ...current,
      [playerId]: {
        ...current[playerId],
        [field]: value
      }
    }));
  };

  const savePlayer = async (playerId: string) => {
    const draft = playerDrafts[playerId];
    if (!draft) return;

    await updatePlayer(playerId, {
      name: draft.name.trim(),
      position: draft.position.trim(),
      willCome: draft.willCome,
      paid: draft.paid,
      photo: draft.photo.trim() || "https://via.placeholder.com/80?text=Player",
      elo: draft.elo === "" ? DEFAULT_PLAYER_elo : Number(draft.elo)
    });
  };

  const saveAllPlayers = async () => {
    setIsSavingAllPlayers(true);

    try {
      await Promise.all(
        players.map((player) => {
          const draft = playerDrafts[player.id];
          if (!draft) return Promise.resolve();

          return updatePlayer(player.id, {
            name: draft.name.trim(),
            position: draft.position.trim(),
            willCome: draft.willCome,
            paid: draft.paid,
            photo: draft.photo.trim() || "https://via.placeholder.com/80?text=Player",
            elo: draft.elo === "" ? DEFAULT_PLAYER_elo : Number(draft.elo)
          });
        })
      );
    } finally {
      setIsSavingAllPlayers(false);
    }
  };

  const resetAllPlayerStatuses = async () => {
    setIsResettingAllPlayers(true);

    try {
      await Promise.all(
        players.map((player) =>
          updatePlayer(player.id, {
            willCome: "no",
            paid: false
          })
        )
      );

      setPlayerDrafts((current) => {
        const next = { ...current };

        players.forEach((player) => {
          const draft = next[player.id];
          if (!draft) return;

          next[player.id] = {
            ...draft,
            willCome: "no",
            paid: false
          };
        });

        return next;
      });
    } finally {
      setIsResettingAllPlayers(false);
    }
  };

  const removePlayer = async (playerId: string) => {
    await deletePlayer(playerId);

    setPlayerDrafts((current) => {
      const next = { ...current };
      delete next[playerId];
      return next;
    });
  };

  const saveAttendanceReport = async () => {
    if (players.length === 0) return;

    setIsSavingAttendanceReport(true);

    try {
      const reportPlayers: AttendanceReportPlayer[] = players.map((player) => {
        const draft = playerDrafts[player.id];

        return {
          playerId: player.id,
          name: draft?.name.trim() || player.name,
          position: draft?.position.trim() || player.position || "",
          elo:
            draft?.elo === "" || draft?.elo == null
              ? player.elo ?? DEFAULT_PLAYER_elo
              : Number(draft.elo),
          willCome: normalizeAttendanceStatus(draft?.willCome ?? player.willCome),
          paid: draft?.paid ?? player.paid
        };
      });

      await createAttendanceReport(reportPlayers);
    } finally {
      setIsSavingAttendanceReport(false);
    }
  };

  return (
    <div className="admin">
      <div className="admin-topbar">
        <div>
          <h1>Admin Panel</h1>
          <p className="admin-topbar-note">
            Здесь можно фиксировать текущий срез посещаемости и сразу смотреть отчеты.
          </p>
        </div>

        <div className="admin-topbar-actions">
          <button
            type="button"
            className="attendance-report-button"
            onClick={() => void saveAttendanceReport()}
            disabled={isSavingAttendanceReport || players.length === 0}
          >
            {isSavingAttendanceReport ? "Сохраняем отчет..." : "Зафиксировать посещаемость"}
          </button>
          <Link className="admin-link-button" to="/reports">
            Открыть отчеты
          </Link>
        </div>
      </div>

      <div className="admin-grid">
        <section className="admin-card">
          <h2>Новый зал</h2>

          <input
            placeholder="Название"
            value={newPlaceName}
            onChange={(e) => setNewPlaceName(e.target.value)}
          />

          <input
            placeholder="Адрес"
            value={newPlaceAddress}
            onChange={(e) => setNewPlaceAddress(e.target.value)}
          />

          <input
            placeholder="Ссылка на карту"
            value={newPlaceAddressLink}
            onChange={(e) => setNewPlaceAddressLink(e.target.value)}
          />

          <input
            placeholder="Ссылка на фото"
            value={newPlaceImage}
            onChange={(e) => setNewPlaceImage(e.target.value)}
          />

          <select
            value={newPlaceWeekday}
            onChange={(e) => setNewPlaceWeekday(e.target.value as Weekday)}
          >
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          <div className="time-fields">
            <label className="time-field">
              <span>С</span>
              <input
                type="time"
                value={newPlaceStartTime}
                onChange={(e) => setNewPlaceStartTime(e.target.value)}
              />
            </label>

            <label className="time-field">
              <span>До</span>
              <input
                type="time"
                value={newPlaceEndTime}
                onChange={(e) => setNewPlaceEndTime(e.target.value)}
              />
            </label>
          </div>

          <label className="admin-check">
            <input
              type="checkbox"
              checked={newPlaceIsMain}
              onChange={(e) => setNewPlaceIsMain(e.target.checked)}
            />
            <span>Сделать главным сразу</span>
          </label>

          <button onClick={() => void createPlace()} disabled={isSavingPlace}>
            {isSavingPlace ? "Сохранение..." : "Добавить зал"}
          </button>

          {placeError && <p className="admin-note">{placeError}</p>}

          {newPlaceImage && (
            <img src={newPlaceImage} alt="preview new place" className="preview" />
          )}
        </section>

        <section className="admin-card">
          <h2>Место проведения</h2>

          <select value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
            <option value="">Выбери зал</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            placeholder="Адрес"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <input
            placeholder="Ссылка на карту"
            value={addressLink}
            onChange={(e) => setAddressLink(e.target.value)}
          />

          <input
            placeholder="Ссылка на фото"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />

          <select value={weekday} onChange={(e) => setWeekday(e.target.value as Weekday)}>
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          <div className="time-fields">
            <label className="time-field">
              <span>С</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>

            <label className="time-field">
              <span>До</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <label className="admin-check">
            <input
              type="checkbox"
              checked={isMain}
              onChange={(e) => setIsMain(e.target.checked)}
            />
            <span>Сделать главным</span>
          </label>

          <button className="save-action-button" onClick={updatePlace}>
            Сохранить место
          </button>

          {image && <img src={image} alt="preview" className="preview" />}
        </section>

        <section className="admin-card">
          <h2>Добавить игрока</h2>

          <input
            placeholder="Имя игрока"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />

          <input
            placeholder="Амплуа"
            value={playerPosition}
            onChange={(e) => setPlayerPosition(e.target.value)}
          />

          <input
            placeholder="Ссылка на фото"
            value={playerPhoto}
            onChange={(e) => setPlayerPhoto(e.target.value)}
          />

          <input
            type="number"
            min="0"
            step="1"
            placeholder="Рейтинг"
            value={playerelo}
            onChange={(e) => setPlayerelo(e.target.value)}
          />

          <button onClick={createPlayer} disabled={isSavingPlayer}>
            {isSavingPlayer ? "Сохранение..." : "Добавить игрока"}
          </button>

          <p className="admin-note">
            Новый игрок добавляется в базу и по умолчанию не показывается на
            главной, пока для него не выбран статус "Да" или "Возможно".
          </p>
        </section>

        <section className="admin-card">
          <h2>Пропуск и QR</h2>

          <input
            placeholder="Ссылка на пропуск"
            value={passLink}
            onChange={(e) => setPassLink(e.target.value)}
          />

          <input
            placeholder="Ссылка на QR-код оплаты"
            value={qrCodeLink}
            onChange={(e) => setQrCodeLink(e.target.value)}
          />

          <input
            type="number"
            min="0"
            step="1"
            placeholder="Общая сумма оплаты"
            value={totalPaid}
            onChange={(e) => setTotalPaid(e.target.value)}
          />

          <button className="save-action-button" onClick={() => void saveInfo()}>
            Сохранить ссылки
          </button>

          <p className="admin-note">
            Данные сохраняются в коллекции "info" в поля "pass", "qrcode" и
            "totalPaid".
          </p>

          <div className="info-preview-grid">
            {passLink && (
              <img
                className="preview"
                src={passLink}
                alt="Предпросмотр пропуска"
              />
            )}

            {qrCodeLink && (
              <img
                className="preview"
                src={qrCodeLink}
                alt="Предпросмотр QR-кода"
              />
            )}
          </div>
        </section>
      </div>

      <section className="admin-card admin-card-table">
        <div className="admin-table-header">
          <div>
            <h2>Все игроки</h2>
            <p>На главной показываются только игроки со статусом "Да" и "Возможно"</p>
          </div>

          <div className="admin-table-actions">
            <button
              className="reset-all-button"
              onClick={() => void resetAllPlayerStatuses()}
              disabled={isResettingAllPlayers || isSavingAllPlayers || players.length === 0}
            >
              {isResettingAllPlayers ? "Сбрасываем..." : "Всем: не оплачено и не придет"}
            </button>

            <button
              className="save-all-button save-action-button"
              onClick={() => void saveAllPlayers()}
              disabled={isSavingAllPlayers || isResettingAllPlayers || players.length === 0}
            >
              {isSavingAllPlayers ? "Сохраняем..." : "Сохранить всех"}
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Амплуа</th>
                <th>Придет</th>
                <th>Оплатил</th>
                <th>Рейтинг</th>
                <th>Фото</th>
                <th>Действие</th>
              </tr>
            </thead>

            <tbody>
              {sortedPlayers.length > 0 ? (
                sortedPlayers.map((player) => (
                  <tr key={player.id}>
                    <td>
                      <input
                        className="table-input"
                        value={playerDrafts[player.id]?.name ?? player.name}
                        onChange={(e) =>
                          updatePlayerDraft(player.id, "name", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="table-input"
                        placeholder="Амплуа"
                        value={playerDrafts[player.id]?.position ?? player.position}
                        onChange={(e) =>
                          updatePlayerDraft(player.id, "position", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <div className="attendance-actions">
                        <button
                          className={
                            (playerDrafts[player.id]?.willCome ?? player.willCome) === "yes"
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            preserveScrollPosition();
                            void setPlayerAttendance(player, "yes");
                            updatePlayerDraft(player.id, "willCome", "yes");
                          }}
                        >
                          Да
                        </button>
                        <button
                          className={
                            (playerDrafts[player.id]?.willCome ?? player.willCome) === "maybe"
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            preserveScrollPosition();
                            void setPlayerAttendance(player, "maybe");
                            updatePlayerDraft(player.id, "willCome", "maybe");
                          }}
                        >
                          Возможно
                        </button>
                        <button
                          className={
                            (playerDrafts[player.id]?.willCome ?? player.willCome) === "no"
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            preserveScrollPosition();
                            void setPlayerAttendance(player, "no");
                            updatePlayerDraft(player.id, "willCome", "no");
                          }}
                        >
                          Нет
                        </button>
                      </div>
                    </td>
                    <td>
                      <label className="table-check">
                        <input
                          type="checkbox"
                          checked={playerDrafts[player.id]?.paid ?? player.paid}
                          onChange={(e) =>
                            updatePlayerDraft(player.id, "paid", e.target.checked)
                          }
                        />
                        <span>
                          {(playerDrafts[player.id]?.paid ?? player.paid) ? "Да" : "Нет"}
                        </span>
                      </label>
                    </td>
                    <td>
                      <input
                        className="table-input elo-input"
                        type="number"
                        min="0"
                        step="1"
                        value={
                          playerDrafts[player.id]?.elo ??
                          player.elo ??
                          DEFAULT_PLAYER_elo
                        }
                        onChange={(e) =>
                          updatePlayerDraft(
                            player.id,
                            "elo",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="photo-editor">
                        <input
                          className="table-input"
                          value={playerDrafts[player.id]?.photo ?? player.photo}
                          onChange={(e) =>
                            updatePlayerDraft(player.id, "photo", e.target.value)
                          }
                        />
                        <img
                          className="table-photo"
                          src={playerDrafts[player.id]?.photo ?? player.photo}
                          alt={playerDrafts[player.id]?.name ?? player.name}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="player-actions">
                        <button
                          className="save-player-button save-action-button"
                          onClick={() => void savePlayer(player.id)}
                        >
                          Сохранить
                        </button>
                        <button
                          className="delete-player-button"
                          onClick={() => void removePlayer(player.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    Игроков пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Admin;
