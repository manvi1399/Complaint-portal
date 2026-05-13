export function Header({
  portal,
  title,
  description,
}: {
  portal: "citizen" | "admin" | "block";
  title: string;
  description: string;
}) {
  const label =
    portal === "admin"
      ? "Admin"
      : portal === "block"
        ? "Block"
        : "Citizen";
  const eyebrow =
    portal === "admin"
      ? "Control Room"
      : portal === "block"
        ? "Municipality Desk"
        : "Civic Access";

  return (
    <header className="page-header">
      <div className="page-wrap">
        <div className="header-row">
          <div className="brand-mark" aria-hidden="true">
            <span>{label.slice(0, 1)}</span>
          </div>
          <div>
            <div className="header-label">{eyebrow} / {label} Portal</div>
            <h1>{title}</h1>
            <p className="muted">{description}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
