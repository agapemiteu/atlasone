import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Guide } from "@/pages/guide";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Guide origin={location.origin} />
  </StrictMode>,
);
