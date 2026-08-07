import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface Task {
  id: string;
  title: string;
  status: string;
  budget_usd: string;
  created_at: string;
  model: string | null;
}

interface ModelInfo {
  id: string;
  name: string;
  model: string;
  context_window: number;
  pricing: { input_per_1m: number; output_per_1m: number };
  tags: string[];
}

interface ProviderGroup {
  provider: string;
  has_key: boolean;
  models: ModelInfo[];
}

export function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSpec, setNewSpec] = useState("");
  const [budgetUsd, setBudgetUsd] = useState("2.00");
  const [runtimePref, setRuntimePref] = useState("local");
  const [selectedModel, setSelectedModel] = useState("");
  const [agentCount, setAgentCount] = useState(1);
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const [hasAnyKey, setHasAnyKey] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchModels();
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

  async function fetchModels() {
    const token = localStorage.getItem("alpha_token");
    if (!token) return;
    try {
      const resp = await fetch("/v1/models", { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setProviders(data.providers ?? []);
        setHasAnyKey(data.has_any_key);
        if (data.default_model) setSelectedModel(data.default_model);
      }
    } catch { /* ignore */ }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch("/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: newTitle || "New Conversation",
          spec: newSpec || "Help me with a coding task",
          budget_usd: parseFloat(budgetUsd),
          runtime_pref: runtimePref,
          model: selectedModel || undefined,
          agent_count: agentCount,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Failed to create task");
        if (data.issues) {
          setError(data.error + ": " + data.issues.map((i: { message: string }) => i.message).join(", "));
        }
        return;
      }
      // Navigate to the new conversation
      navigate(`/tasks/${data.task.id}`);
    } catch {
      setError("Network error — is the backend running on port 8080?");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="muted">Loading...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Conversations</h1>
        <button className="btn" onClick={() => setShowNew(!showNew)}>
          {showNew ? "Cancel" : "+ New Conversation"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#f85149", color: "#f85149", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {showNew && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Start New Conversation</h2>
          {!hasAnyKey && (
            <div style={{ padding: "0.75rem", background: "rgba(210, 153, 34, 0.1)", borderRadius: "var(--radius)", marginBottom: "1rem", fontSize: "0.8125rem", color: "#d29922" }}>
              ⚠ No API keys found. Add one in <a href="/settings" style={{ color: "#d29922", textDecoration: "underline" }}>Settings</a> first.
            </div>
          )}
          <form onSubmit={createTask} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              type="text"
              placeholder="Conversation title (e.g. 'Build a snake game')"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <textarea
              placeholder="What do you want the agent to do? (you can continue chatting after it starts)"
              value={newSpec}
              onChange={(e) => setNewSpec(e.target.value)}
              rows={3}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label className="muted" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Model</label>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={!hasAnyKey}>
                  {availableModels.length === 0 && <option value="">No keys — add in Settings</option>}
                  {providers.filter((p) => p.has_key).map((pg) => (
                    <optgroup key={pg.provider} label={pg.provider.charAt(0).toUpperCase() + pg.provider.slice(1)}>
                      {pg.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.tags.includes("recommended") ? "⭐" : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="muted" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Budget (USD)</label>
                <input type="number" step="0.50" min="0.50" max="100" value={budgetUsd} onChange={(e) => setBudgetUsd(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="muted" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>
                Agents {agentCount > 1 && <span style={{ color: "#1f6feb" }}>— Swarm mode: task will be decomposed into {agentCount} subtasks</span>}
              </label>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={agentCount === n ? "btn" : "btn btn-secondary"}
                    style={{ width: "2.5rem", padding: "0.3rem", fontSize: "0.8125rem" }}
                    onClick={() => setAgentCount(n)}
                  >{n}</button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn" disabled={creating || !hasAnyKey}>
              {creating ? "Creating..." : "Create & Start Chatting"}
            </button>
          </form>
        </div>
      )}

      {/* Conversation list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {tasks.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted" style={{ marginBottom: "1rem" }}>No conversations yet.</p>
            <button className="btn" onClick={() => setShowNew(true)}>Start your first conversation</button>
          </div>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/tasks/${t.id}`)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.875rem 1rem",
                background: "var(--bg)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                transition: "background 0.15s",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg)")}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{t.title}</div>
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  {t.model ? t.model.split(":")[1] ?? t.model : "auto"} · {new Date(t.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  background: t.status === "complete" ? "#238636" : t.status === "running" ? "#1f6feb" : t.status === "failed" ? "#f85149" : "var(--border)",
                  color: "white",
                }}>{t.status}</span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", color: "#f85149" }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
                    const token = localStorage.getItem("alpha_token");
                    try {
                      await fetch(`/v1/tasks/${t.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                      setTasks(tasks.filter((x) => x.id !== t.id));
                    } catch { /* ignore */ }
                  }}
                >🗑</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  function availableModels() {
    return providers.filter((p) => p.has_key).flatMap((p) => p.models);
  }
}
