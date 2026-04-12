import type { Player } from "../entities/player";
import { updatePlayer } from "../features/players/api";

type Props = {
  players: Player[];
};

export const PlayerTable = ({ players }: Props) => {
  const toggleCome = (p: Player) => {
    updatePlayer(p.id, { willCome: !p.willCome });
  };

  const togglePaid = (p: Player) => {
    updatePlayer(p.id, { paid: !p.paid });
  };

  return (
    <table border={1} cellPadding={10}>
      <thead>
        <tr>
          <th>Имя</th>
          <th>Придет</th>
          <th>Оплатил</th>
          <th>Фото</th>
        </tr>
      </thead>

      <tbody>
        {players.map(p => (
          <tr key={p.id}>
            <td>{p.name}</td>

            <td>
              <button onClick={() => toggleCome(p)}>
                {p.willCome ? "Да" : "Нет"}
              </button>
            </td>

            <td>
              <button onClick={() => togglePaid(p)}>
                {p.paid ? "Да" : "Нет"}
              </button>
            </td>

            <td>
              <img src={p.photo} width={50} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};