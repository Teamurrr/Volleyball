import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "./main.scss";

import { db } from "../../app/firebase";
import { usePlayers } from "../../features/players/hook";
import {
  getAttendanceLabel,
  normalizeAttendanceStatus,
  type AttendanceStatus
} from "../../entities/player";

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

type Info = {
  pass: string;
  qrcode: string;
  totalPaid?: number;
};

const INFO_DOC_ID = "info";

const getAttendancePriority = (value: AttendanceStatus) => {
  if (value === "yes") return 0;
  if (value === "maybe") return 1;
  if (value === "prospect") return 2;
  return 3;
};

const getAttendanceClassName = (value: AttendanceStatus) =>
  value === "maybe"
    ? "maybe"
    : value === "prospect"
      ? "prospect"
      : undefined;

const Main = () => {
  const navigate = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [info, setInfo] = useState<Info>({
    pass: "",
    qrcode: "",
    totalPaid: 0
  });
  const [selectedPhoto, setSelectedPhoto] = useState<{
    src: string;
    name: string;
  } | null>(null);
  const { players, playersError } = usePlayers();

  const visiblePlayers = useMemo(
    () =>
      [...players]
        .filter((player) => {
          const attendance = normalizeAttendanceStatus(player.willCome);
          return attendance === "yes" || attendance === "maybe" || attendance === "prospect";
        })
        .sort(
          (a, b) =>
            getAttendancePriority(normalizeAttendanceStatus(a.willCome)) -
            getAttendancePriority(normalizeAttendanceStatus(b.willCome))
        ),
    [players]
  );

  const confirmedPlayersCount = visiblePlayers.filter(
    (player) => normalizeAttendanceStatus(player.willCome) === "yes"
  ).length;

  const attendingPlayersCount = visiblePlayers.filter((player) => {
    const attendance = normalizeAttendanceStatus(player.willCome);
    return attendance === "yes" || attendance === "maybe";
  }).length;
  const playersToSplit = Math.max(attendingPlayersCount - 1, 0);
  const perPlayerAmount =
    playersToSplit > 0 && (info.totalPaid || 0) > 0
      ? Math.ceil((info.totalPaid || 0) / playersToSplit)
      : 0;

  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "places"));

        const data: Place[] = querySnapshot.docs.map((currentDoc) => {
          const currentData = currentDoc.data();

          return {
            id: currentDoc.id,
            name: currentData.name,
            address: currentData.address,
            addressLink: currentData.addressLink,
            image: currentData.image,
            weekday: currentData.weekday,
            time: currentData.time,
            isMain: currentData.isMain
          };
        });

        const mainPlace = data.find((currentPlace) => currentPlace.isMain);
        setPlace(mainPlace || data[0] || null);
      } catch {
        setPlace(null);
      }
    };

    void fetchPlaces();
  }, []);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const infoDoc = await getDoc(doc(db, "info", INFO_DOC_ID));

        if (!infoDoc.exists()) {
          setInfo({
            pass: "",
            qrcode: "",
            totalPaid: 0
          });
          return;
        }

        const data = infoDoc.data();

        setInfo({
          pass: data.pass || "",
          qrcode: data.qrcode || "",
          totalPaid: Number(data.totalPaid || 0)
        });
      } catch {
        setInfo({
          pass: "",
          qrcode: "",
          totalPaid: 0
        });
      }
    };

    void fetchInfo();
  }, []);

  return (
    <div className="main-page">
      <button
        type="button"
        className="secret-nav-button"
        aria-label="Open admin"
        onClick={() => navigate("/adminx")}
      />
      <button
        type="button"
        className="secret-nav-button secret-nav-button-lineup"
        aria-label="Open lineup"
        onClick={() => navigate("/lineup")}
      />

      <div
        className="main"
        style={{
          backgroundImage: place?.image ? `url(${place.image})` : undefined
        }}
      >
        <div className="overlay">
          <div className="content">
            <h1 className="title">{place?.name}</h1>

            {place?.addressLink ? (
              <a
                href={place.addressLink}
                target="_blank"
                rel="noopener noreferrer"
                className="address"
              >
                {place.address}
              </a>
            ) : (
              <p className="address">{place?.address}</p>
            )}


            <p className="daytime">
              {place?.weekday ? `${place.weekday}, ` : ""}
            
            </p>

            <p className="time">
              
              {place?.time || "08:00 - 22:00"}
            </p>
          </div>
        </div>
      </div>

      {(info.pass || info.qrcode) && (
        <section className="info-images-section">
          {info.pass && (
            <div className="info-image-card">
              <p className="info-image-label">Пропуск</p>
              <button
                type="button"
                className="info-image-button"
                onClick={() =>
                  setSelectedPhoto({
                    src: info.pass,
                    name: "Пропуск"
                  })
                }
              >
                <img className="info-image" src={info.pass} alt="Пропуск" />
              </button>
            </div>
          )}

          {info.qrcode && (
            <div className="info-image-card">
              <p className="info-image-label">QR для оплаты</p>
              <button
                type="button"
                className="info-image-button"
                onClick={() =>
                  setSelectedPhoto({
                    src: info.qrcode,
                    name: "QR для оплаты"
                  })
                }
              >
                <img className="info-image" src={info.qrcode} alt="QR для оплаты" />
              </button>

              <div className="payment-summary">
                {perPlayerAmount > 0 ? (
                  <>
                    <p className="payment-summary-label">Сумма на человека</p>
                    <p className="payment-summary-value">{perPlayerAmount} сом</p>
                  </>
                ) : (
                  <p className="payment-summary-note">
                    Сумма появится, когда будет указана общая оплата и хотя бы 2
                    игрока в списке.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="players-section">
        <div className="players-header">
          <h2>Игроки</h2>
          <p className="players-count">
            Всего: {attendingPlayersCount} ({confirmedPlayersCount} точно)
          </p>
        </div>

        {playersError && <p className="players-empty">{playersError}</p>}

        <div className="players-table-wrap">
          <table className="players-table">
            <thead>
              <tr>
                <th>Игрок</th>
                {/* <th>Амплуа</th> */}
                <th>Придет</th>
                <th>Оплатил</th>
                <th>Фото</th>
              </tr>
            </thead>

            <tbody>
              {visiblePlayers.length > 0 ? (
                visiblePlayers.map((player) => {
                  const attendance = normalizeAttendanceStatus(player.willCome);
                  const attendanceClassName = getAttendanceClassName(attendance);

                  return (
                    <tr
                      key={player.id}
                      className={
                        attendanceClassName
                          ? `player-row-${attendanceClassName}`
                          : undefined
                      }
                    >
                      <td className="player-name">{player.name}</td>
                      {/* <td>{player.position || "-"}</td> */}
                      <td
                        className={
                          attendanceClassName
                            ? `player-status-${attendanceClassName}`
                            : undefined
                        }
                      >
                        {getAttendanceLabel(attendance)}
                      </td>
                      <td>{player.paid ? "Да" : "Нет"}</td>
                      <td>
                        <button
                          type="button"
                          className="player-photo-button"
                          onClick={() =>
                            setSelectedPhoto({
                              src: player.photo,
                              name: player.name
                            })
                          }
                        >
                          <img className="player-photo" src={player.photo} alt={player.name} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="players-empty">
                    Пока никто не отметил, что придет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedPhoto && (
        <div className="photo-modal" onClick={() => setSelectedPhoto(null)}>
          <button
            type="button"
            className="photo-modal-close"
            onClick={() => setSelectedPhoto(null)}
          >
            x
          </button>

          <img
            className="photo-modal-image"
            src={selectedPhoto.src}
            alt={selectedPhoto.name}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default Main;
