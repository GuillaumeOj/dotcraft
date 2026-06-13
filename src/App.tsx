import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer";
import { EditorPage } from "./pages/EditorPage";
import { FaqPage } from "./pages/FaqPage";
import { HelpCenterPage } from "./pages/HelpCenterPage";

/** The app shell: the `.app` flex column that hosts the routed pages and the
 *  footer shared across every route. */
export function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/help-center" element={<HelpCenterPage />} />
      </Routes>
      <Footer />
    </div>
  );
}
