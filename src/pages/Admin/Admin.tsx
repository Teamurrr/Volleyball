import { useEffect, useMemo, useState } from "react";
import "./Admin.scss";

import { db } from "../../app/firebase";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";
import {
  normalizeAttendanceStatus,
  type AttendanceStatus,
  type Player
} from "../../entities/player";
import { addPlayer, deletePlayer, updatePlayer } from "../../features/players/api";
import { usePlayers } from "../../features/players/hook";

type Place = {
  id: string;
  name: string;
  address: string;
  addressLink?: string;
  image: string;
  time?: string;
  isMain?: boolean;
};

type Info = {
  id: string;
  pass: string;
  qrcode: string;
  totalPaid?: number;
};

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "22:00";

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
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [isMain, setIsMain] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [newPlaceAddressLink, setNewPlaceAddressLink] = useState("");
  const [newPlaceImage, setNewPlaceImage] = useState("");
  const [newPlaceStartTime, setNewPlaceStartTime] = useState(DEFAULT_START_TIME);
  const [newPlaceEndTime, setNewPlaceEndTime] = useState(DEFAULT_END_TIME);
  const [newPlaceIsMain, setNewPlaceIsMain] = useState(false);
  const [infoId, setInfoId] = useState("");
  const [passLink, setPassLink] = useState("");
  const [qrCodeLink, setQrCodeLink] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerPhoto, setPlayerPhoto] = useState("");
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [isSavingAllPlayers, setIsSavingAllPlayers] = useState(false);
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, Omit<Player, "id">>>({});

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
    const snap = await getDocs(collection(db, "places"));

    const data: Place[] = snap.docs.map((d) => {
      const dd = d.data();
      return {
        id: d.id,
        name: dd.name,
        address: dd.address,
        addressLink: dd.addressLink,
        image: dd.image,
        time: dd.time,
        isMain: dd.isMain
      };
    });

    setPlaces(data);
  };

  const fetchInfo = async () => {
    const snap = await getDocs(collection(db, "info"));

    const data: Info[] = snap.docs.map((item) => {
      const value = item.data();

      return {
        id: item.id,
        pass: value.pass || "",
        qrcode: value.qrcode || "",
        totalPaid: value.totalPaid
      };
    });

    const info = data[0];

    setInfoId(info?.id || "");
    setPassLink(info?.pass || "");
    setQrCodeLink(info?.qrcode || "");
    setTotalPaid(info?.totalPaid != null ? String(info.totalPaid) : "");
  };

  useEffect(() => {
    void fetchPlaces();
    void fetchInfo();
  }, []);

  useEffect(() => {
    setPlayerDrafts((current) => {
      const next: Record<string, Omit<Player, "id">> = {};

      players.forEach((player) => {
        next[player.id] = current[player.id] ?? {
          name: player.name,
          willCome: normalizeAttendanceStatus(player.willCome),
          paid: player.paid,
          photo: player.photo
        };
      });

      return next;
    });
  }, [players]);

  const handleSelect = (id: string) => {
    setSelectedId(id);

    const place = places.find((item) => item.id === id);
    if (!place) return;

    setName(place.name);
    setAddress(place.address);
    setAddressLink(place.addressLink || "");
    setImage(place.image);
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
      time: buildTimeRange(startTime, endTime),
      isMain
    });

    void fetchPlaces();
  };

  const createPlace = async () => {
    if (!newPlaceName.trim() || !newPlaceAddress.trim() || !newPlaceImage.trim()) {
      return;
    }

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
      time: buildTimeRange(newPlaceStartTime, newPlaceEndTime),
      isMain: newPlaceIsMain
    });

    setNewPlaceName("");
    setNewPlaceAddress("");
    setNewPlaceAddressLink("");
    setNewPlaceImage("");
    setNewPlaceStartTime(DEFAULT_START_TIME);
    setNewPlaceEndTime(DEFAULT_END_TIME);
    setNewPlaceIsMain(false);

    void fetchPlaces();
  };

  const createPlayer = async () => {
    if (!playerName.trim()) return;

    setIsSavingPlayer(true);

    try {
      await addPlayer({
        name: playerName.trim(),
        willCome: "no",
        paid: false,
        photo: playerPhoto.trim() || "https://via.placeholder.com/80?text=Player"
      });

      setPlayerName("");
      setPlayerPhoto("");
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

  const saveInfo = async () => {
    const payload = {
      pass: passLink.trim(),
      qrcode: qrCodeLink.trim(),
      totalPaid: totalPaid.trim() ? Number(totalPaid) : 0
    };

    if (infoId) {
      await updateDoc(doc(db, "info", infoId), payload);
    } else {
      const created = await addDoc(collection(db, "info"), payload);
      setInfoId(created.id);
    }
  };

  const updatePlayerDraft = (
    playerId: string,
    field: keyof Omit<Player, "id">,
    value: string | boolean
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
      willCome: draft.willCome,
      paid: draft.paid,
      photo: draft.photo.trim() || "https://via.placeholder.com/80?text=Player"
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
            willCome: draft.willCome,
            paid: draft.paid,
            photo: draft.photo.trim() || "https://via.placeholder.com/80?text=Player"
          });
        })
      );
    } finally {
      setIsSavingAllPlayers(false);
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

  return (
    <div className="admin">
      <h1>Admin Panel</h1>

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

          <button onClick={() => void createPlace()}>Добавить зал</button>

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

          <button onClick={updatePlace}>Сохранить место</button>

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
            placeholder="Ссылка на фото"
            value={playerPhoto}
            onChange={(e) => setPlayerPhoto(e.target.value)}
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

          <button onClick={() => void saveInfo()}>Сохранить ссылки</button>

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

          <button
            className="save-all-button"
            onClick={() => void saveAllPlayers()}
            disabled={isSavingAllPlayers || players.length === 0}
          >
            {isSavingAllPlayers ? "Сохраняем..." : "Сохранить всех"}
          </button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Придет</th>
                <th>Оплатил</th>
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
                      <div className="attendance-actions">
                        <button
                          className={
                            (playerDrafts[player.id]?.willCome ?? player.willCome) === "yes"
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
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
                          className="save-player-button"
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
                  <td colSpan={5} className="admin-empty">
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
