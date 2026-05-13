import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BlockApp from "./BlockApp.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BlockApp
      portalId="central-block-b"
      defaultUsername="central.blockb@chandigarh.gov.in"
      title="Central Block B Works Portal"
      description="Dedicated site for complaints directed to Central Chandigarh Municipality Block B."
    />
  </StrictMode>,
);
