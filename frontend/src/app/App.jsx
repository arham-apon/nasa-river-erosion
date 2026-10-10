import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import Providers from "./providers.jsx";
import Shell from "../components/layout/Shell.jsx";
import HomePage from "../pages/HomePage.jsx";
import NotFoundPage from "../pages/NotFoundPage.jsx";

const MyAreaPage = lazy(() => import("../pages/MyAreaPage.jsx"));
const RiverChangesPage = lazy(() => import("../pages/RiverChangesPage.jsx"));
const HowItWorksPage = lazy(() => import("../pages/HowItWorksPage.jsx"));
const AboutPage = lazy(() => import("../pages/AboutPage.jsx"));
const RiverPage = lazy(() => import("../pages/RiverPage.jsx"));

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="my-area" element={<MyAreaPage />} />
            <Route path="river-changes" element={<RiverChangesPage />} />
            <Route path="how-it-works" element={<HowItWorksPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="river/:id" element={<RiverPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
