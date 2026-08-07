import { useEffect, useState } from "react";

interface UsageData {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  task_count: number;
}

export function Dashboard() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      const token = localStorage.getItem("cascade_token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      try {
        const resp = await fetch("/v1/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) setUsage(await resp.json());
      } catch {
        // Ignore — dashboard still renders with placeholder data
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, []);

  if (loading) return <div className="muted">Loading...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Dashboard</h1>
      <div className="grid">
        <div className="card stat">
          <span className="label">Total Cost (this month)</span>
          <span className="value">${(usage?.cost_usd ?? 0).toFixed(2)}</span>
        </div>
        <div className="card stat">
          <span className="label">Tokens In</span>
          <span className="value">{(usage?.tokens_in ?? 0).toLocaleString()}</span>
        </div>
        <div className="card stat">
          <span className="label">Tokens Out</span>
          <span className="value">{(usage?.tokens_out ?? 0).toLocaleString()}</span>
        </div>
        <div className="card stat">
          <span className="label">Tasks Run</span>
          <span className="value">{usage?.task_count ?? 0}</span>
        </div>
      </div>
      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Quick Actions</h2>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a href="/tasks"><button className="btn">View Tasks</button></a>
          <a href="/marketplace"><button className="btn btn-secondary">Browse Skills</button></a>
        </div>
      </div>
    </div>
  );
}
