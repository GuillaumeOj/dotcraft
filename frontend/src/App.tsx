import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer";
import { AccountPage } from "./pages/AccountPage";
import { EditorPage } from "./pages/EditorPage";
import { FaqPage } from "./pages/FaqPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HelpCenterPage } from "./pages/HelpCenterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

/** The app shell: the `.app` flex column that hosts the routed pages and the
 *  footer shared across every route. */
export function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/help-center" element={<HelpCenterPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/reset-password/:uid/:token"
          element={<ResetPasswordPage />}
        />
      </Routes>
      <Footer />
    </div>
  );
}
