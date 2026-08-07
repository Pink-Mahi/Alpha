import { useEffect, useState } from "react";

interface Task {
  id: string;
  title: string;
  status: string;
  budget_usd: number;
  created_at: string;
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newSpec, setNewSpec] = useState("");

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    const token = localStorage.getItem("alpha_token");
    if (!token) { window.location.href = "/login"; return; }
    try {
      const resp = await fetch("/v1/tasks", { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setTasks(data.tasks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("alpha_token");
    const resp = await fetch("/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: newTitle, spec: newSpec }),
    });
    if (resp.ok) {
      setNewTitle("");
      setNewSpec("");
      fetchTasks();
    }
  }

  if (loading) return <div className="muted">Loading...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Tasks</h1>
      <div className="card">
        <h2>Create New Task</h2>
        <form onSubmit={createTask} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <input
            type="text"
            placeholder="Task title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="Describe what you want the agent to do..."
            value={newSpec}
            onChange={(e) => setNewSpec(e.target.value)}
            rows={4}
            required
          />
          <button type="submit" className="btn">Create Task</button>
        </form>
      </div>
      <div className="card">
        <h2>Recent Tasks</h2>
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet. Create one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem", background: "var(--bg)", borderRadius: "var(--radius)" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: "0.8125rem" }}>{t.id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <span className="muted" style={{ fontSize: "0.8125rem" }}>${t.budget_usd}</span>
                  <span style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    background: t.status === "complete" ? "#238636" : t.status === "running" ? "#1f6feb" : "var(--border)",
                    color: "white",
                  }}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
