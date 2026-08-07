import { Outlet, NavLink } from "react-router-dom";

export function App() {
  return (
    <div className="layout">
      <nav className="sidebar">
        <div style={{ fontSize: "1.25rem", fontWeight: 700, padding: "0.5rem 0.75rem", marginBottom: "1rem" }}>
          ALPHA
        </div>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
          Tasks
        </NavLink>
        <NavLink to="/billing" className={({ isActive }) => (isActive ? "active" : "")}>
          Billing
        </NavLink>
        <NavLink to="/marketplace" className={({ isActive }) => (isActive ? "active" : "")}>
          Marketplace
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Settings
        </NavLink>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
