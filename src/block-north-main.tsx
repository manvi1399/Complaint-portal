import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BlockApp from "./BlockApp.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BlockApp
      portalId="north-block-b"
      defaultUsername="north.blockb@chandigarh.gov.in"
      title="North Block B Works Portal"
      description="Dedicated site for complaints directed to North Chandigarh Municipality Block B."
    />
  </StrictMode>,
);
