import { BrowserRouter, Routes, Route } from "react-router-dom";
import Main from "./pages/Main/Main";
import Admin from "./pages/Admin/Admin";
import Lineup from "./pages/Lineup/Lineup";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Main />} />
        <Route path="/adminx" element={<Admin />} />
        <Route path="/lineup" element={<Lineup />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
