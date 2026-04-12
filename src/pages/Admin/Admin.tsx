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
import type { Player } from "../../entities/player";
import { addPlayer, deletePlayer, updatePlayer } from "../../features/players/api";
import { usePlayers } from "../../features/players/hook";

type Place = {
  id: string;
  name: string;
  address: string;
  addressLink?: string;
  image: string;
  isMain?: boolean;
};

type Info = {
  id: string;
  pass: string;
  qrcode: string;
};

const Admin = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const { players } = usePlayers();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [addressLink, setAddressLink] = useState("");
  const [image, setImage] = useState("");
  const [isMain, setIsMain] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [newPlaceAddressLink, setNewPlaceAddressLink] = useState("");
  const [newPlaceImage, setNewPlaceImage] = useState("");
  const [newPlaceIsMain, setNewPlaceIsMain] = useState(false);
  const [infoId, setInfoId] = useState("");
  const [passLink, setPassLink] = useState("");
  const [qrCodeLink, setQrCodeLink] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerPhoto, setPlayerPhoto] = useState("");
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, Omit<Player, "id">>>({});

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [players]
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
        qrcode: value.qrcode || ""
      };
    });

    const info = data[0];

    setInfoId(info?.id || "");
    setPassLink(info?.pass || "");
    setQrCodeLink(info?.qrcode || "");
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
          willCome: player.willCome,
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
      isMain: newPlaceIsMain
    });

    setNewPlaceName("");
    setNewPlaceAddress("");
    setNewPlaceAddressLink("");
    setNewPlaceImage("");
    setNewPlaceIsMain(false);

    void fetchPlaces();
  };

  const createPlayer = async () => {
    if (!playerName.trim()) return;

    setIsSavingPlayer(true);

    try {
      await addPlayer({
        name: playerName.trim(),
        willCome: false,
        paid: false,
        photo: playerPhoto.trim() || "https://via.placeholder.com/80?text=Player"
      });

      setPlayerName("");
      setPlayerPhoto("");
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const setPlayerAttendance = async (player: Player, willCome: boolean) => {
    await updatePlayer(player.id, { willCome });
  };

  const saveInfo = async () => {
    const payload = {
      pass: passLink.trim(),
      qrcode: qrCodeLink.trim()
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
            главной, пока для него не выбран статус "Да".
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

          <button onClick={() => void saveInfo()}>Сохранить ссылки</button>

          <p className="admin-note">
            Данные сохраняются в коллекции "info" в поля "pass" и "qrcode".
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
          <h2>Все игроки</h2>
          <p>На главной показываются только игроки со статусом "Да"</p>
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
                            (playerDrafts[player.id]?.willCome ?? player.willCome)
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            void setPlayerAttendance(player, true);
                            updatePlayerDraft(player.id, "willCome", true);
                          }}
                        >
                          Да
                        </button>
                        <button
                          className={
                            !(playerDrafts[player.id]?.willCome ?? player.willCome)
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            void setPlayerAttendance(player, false);
                            updatePlayerDraft(player.id, "willCome", false);
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
