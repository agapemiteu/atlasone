import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { langFromSearch } from "@/lib/content";
import { Home } from "@/pages/home";

const lang = langFromSearch(location.search);
document.documentElement.lang = lang;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home origin={location.origin} lang={lang} />
  </StrictMode>,
);
