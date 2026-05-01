import { BrowserRouter, Route, Routes } from "react-router-dom";
import Main from "./pages/Main/Main";
import Admin from "./pages/Admin/Admin";
import Lineup from "./pages/Lineup/Lineup";

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <Routes>
        <Route path="/" element={<Main />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/lineup" element={<Lineup />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
