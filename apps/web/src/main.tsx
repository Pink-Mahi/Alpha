import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App.js";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Tasks } from "./pages/Tasks.js";
import { Billing } from "./pages/Billing.js";
import { Marketplace } from "./pages/Marketplace.js";
import { Settings } from "./pages/Settings.js";
import { TaskDetail } from "./pages/TaskDetail.js";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("React crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", fontFamily: "monospace", color: "#f85149" }}>
          <h2>Page crashed</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: "1rem" }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<App />}>
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
            <Route path="billing" element={<Billing />} />
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
