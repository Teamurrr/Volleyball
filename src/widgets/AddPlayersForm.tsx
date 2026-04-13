import { useState } from "react";
import { addPlayer } from "../features/players/api";

export const AddPlayerForm = () => {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // 🔥 загрузка в Cloudinary
  const uploadImage = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "unsigned_preset");
    formData.append("folder", folder);

    const res = await fetch(
      "https://api.cloudinary.com/v1_1/dadnxtpum/image/upload",
      {
        method: "POST",
        body: formData
      }
    );

    const data = await res.json();
    console.log("Cloudinary response:", data);

    return data.secure_url;
  };

  const handleAdd = async () => {
    if (!name) return;

    let photoUrl = "https://via.placeholder.com/50";

    if (file) {
      console.log("Uploading...");
      photoUrl = await uploadImage(file, "players"); // 👈 папка players
    }

    await addPlayer({
      name,
      willCome: "no",
      paid: false,
      photo: photoUrl
    });

    setName("");
    setFile(null);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <h2>➕ Добавить игрока</h2>

      <input
        placeholder="Имя"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      <input
        type="file"
        onChange={e => {
          if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
          }
        }}
      />

      <button onClick={handleAdd}>Добавить</button>
    </div>
  );
};
