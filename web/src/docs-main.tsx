import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Docs } from "@/pages/docs";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Docs origin={location.origin} />
  </StrictMode>,
);
