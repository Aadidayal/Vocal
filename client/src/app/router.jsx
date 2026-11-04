import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell.jsx";
import { HomePage } from "../pages/HomePage.jsx";
import { NotFoundPage } from "../pages/NotFoundPage.jsx";
import { LandingPage } from "../pages/LandingPage.jsx";
import { DemoPage } from "../pages/DemoPage.jsx";
import { GrievancesPage } from "../pages/GrievancesPage.jsx";

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<HomePage />} />
        <Route path="demo" element={<DemoPage />} />
        <Route path="grievances" element={<GrievancesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
