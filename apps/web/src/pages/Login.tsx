import { useState } from "react";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/v1/auth/login" : "/v1/auth/signup";
      const body = mode === "login"
        ? { email, password }
        : { email, password, org_name: orgName };
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Authentication failed");
        return;
      }
      localStorage.setItem("cascade_token", data.token);
      window.location.href = "/";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <div className="card" style={{ width: 400 }}>
        <h2>{mode === "login" ? "Log in to Cascade" : "Create your account"}</h2>
        {error && <div style={{ color: "#f85149", marginBottom: "1rem", fontSize: "0.875rem" }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Organization name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Loading..." : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>
        <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.875rem" }}>
          {mode === "login" ? (
            <span>Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); }}>Sign up</a></span>
          ) : (
            <span>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); }}>Log in</a></span>
          )}
        </div>
      </div>
    </div>
  );
}
