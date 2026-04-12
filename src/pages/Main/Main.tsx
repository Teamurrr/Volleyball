import { useEffect, useState } from "react";
import "./main.scss";

import { db } from "../../app/firebase";
import { collection, getDocs } from "firebase/firestore";
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
  pass: string;
  qrcode: string;
};

const Main = () => {
  const [place, setPlace] = useState<Place | null>(null);
  const [info, setInfo] = useState<Info>({
    pass: "",
    qrcode: ""
  });
  const [selectedPhoto, setSelectedPhoto] = useState<{
    src: string;
    name: string;
  } | null>(null);
  const { players } = usePlayers();
  const visiblePlayers = players.filter((player) => player.willCome);

  useEffect(() => {
    const fetchPlaces = async () => {
      const querySnapshot = await getDocs(collection(db, "places"));

      const data: Place[] = querySnapshot.docs.map((doc) => {
        const d = doc.data();

        return {
          id: doc.id,
          name: d.name,
          address: d.address,
          addressLink: d.addressLink,
          image: d.image,
          isMain: d.isMain
        };
      });

      const mainPlace = data.find((p) => p.isMain);
      setPlace(mainPlace || data[0]);
    };

    void fetchPlaces();
  }, []);

  useEffect(() => {
    const fetchInfo = async () => {
      const querySnapshot = await getDocs(collection(db, "info"));
      const firstDoc = querySnapshot.docs[0];

      if (!firstDoc) {
        setInfo({
          pass: "",
          qrcode: ""
        });
        return;
      }

      const data = firstDoc.data();

      setInfo({
        pass: data.pass || "",
        qrcode: data.qrcode || ""
      });
    };

    void fetchInfo();
  }, []);

  return (
    <div className="main-page">
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
                {place?.address}
              </a>
            ) : (
              <p className="address">{place?.address}</p>
            )}

            <p className="time">08:00 - 22:00</p>
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
                <img
                  className="info-image"
                  src={info.pass}
                  alt="Пропуск"
                />
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
                <img
                  className="info-image"
                  src={info.qrcode}
                  alt="QR для оплаты"
                />
              </button>
            </div>
          )}
        </section>
      )}

      <section className="players-section">
        <div className="players-header">
          <h2>Игроки</h2>
          <p className="players-count">Всего: {visiblePlayers.length}</p>
        </div>

        <div className="players-table-wrap">
          <table className="players-table">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Придет</th>
                <th>Оплатил</th>
                <th>Фото</th>
              </tr>
            </thead>

            <tbody>
              {visiblePlayers.length > 0 ? (
                visiblePlayers.map((player) => (
                  <tr key={player.id}>
                    <td className="player-name">{player.name}</td>
                    <td>Да</td>
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
                        <img
                          className="player-photo"
                          src={player.photo}
                          alt={player.name}
                        />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="players-empty">
                    Пока никто не отметил, что придет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedPhoto && (
        <div
          className="photo-modal"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            className="photo-modal-close"
            onClick={() => setSelectedPhoto(null)}
          >
            ×
          </button>

          <img
            className="photo-modal-image"
            src={selectedPhoto.src}
            alt={selectedPhoto.name}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default Main;
