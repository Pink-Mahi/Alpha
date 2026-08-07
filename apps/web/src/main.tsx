import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App.js";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Tasks } from "./pages/Tasks.js";
import { Billing } from "./pages/Billing.js";
import { Marketplace } from "./pages/Marketplace.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="billing" element={<Billing />} />
          <Route path="marketplace" element={<Marketplace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
