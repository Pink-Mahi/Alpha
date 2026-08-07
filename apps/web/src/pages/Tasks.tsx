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
  const [newTitle, setNewTitle] = useState("");
  const [newSpec, setNewSpec] = useState("");
  const [budgetUsd, setBudgetUsd] = useState("2.00");
  const [runtimePref, setRuntimePref] = useState("local");
  const [selectedModel, setSelectedModel] = useState("");
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [hasAnyKey, setHasAnyKey] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
        setDefaultModel(data.default_model);
        setHasAnyKey(data.has_any_key);
        if (data.default_model) setSelectedModel(data.default_model);
      }
    } catch { /* ignore */ }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch("/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: newTitle,
          spec: newSpec,
          budget_usd: parseFloat(budgetUsd),
          runtime_pref: runtimePref,
          model: selectedModel || undefined,
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
      setSuccess("Task created! Click it to start the agent.");
      setNewTitle("");
      setNewSpec("");
      fetchTasks();
    } catch {
      setError("Network error — is the backend running on port 8080?");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="muted">Loading...</div>;

  // Build flat list of available models (only from providers with keys)
  const availableModels = providers.filter((p) => p.has_key).flatMap((p) =>
    p.models.map((m) => ({ ...m, provider: p.provider }))
  );

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Tasks</h1>

      {error && (
        <div className="card" style={{ borderColor: "#f85149", color: "#f85149", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="card" style={{ borderColor: "#238636", color: "#238636", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {success}
        </div>
      )}

      <div className="card">
        <h2>Create New Task</h2>
        {!hasAnyKey && (
          <div style={{ padding: "0.75rem", background: "rgba(210, 153, 34, 0.1)", borderRadius: "var(--radius)", marginBottom: "1rem", fontSize: "0.8125rem", color: "#d29922" }}>
            ⚠ No API keys found. Add one in <a href="/settings" style={{ color: "#d29922", textDecoration: "underline" }}>Settings</a> to use the agent.
          </div>
        )}
        <form onSubmit={createTask} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <input
            type="text"
            placeholder="Task title (e.g. 'Add login page')"
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="muted" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Model</label>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={!hasAnyKey}>
                {availableModels.length === 0 && <option value="">No keys — add in Settings</option>}
                {providers.filter((p) => p.has_key).map((pg) => (
                  <optgroup key={pg.provider} label={pg.provider.charAt(0).toUpperCase() + pg.provider.slice(1)}>
                    {pg.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — ${m.pricing.input_per_1m}/M in, ${m.pricing.output_per_1m}/M out
                        {m.tags.includes("recommended") ? " ⭐" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="muted" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Budget (USD)</label>
              <input
                type="number"
                step="0.50"
                min="0.50"
                max="100"
                placeholder="2.00"
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="muted" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Runtime</label>
              <select value={runtimePref} onChange={(e) => setRuntimePref(e.target.value)}>
                <option value="local">Local (your machine)</option>
                <option value="cloud">Cloud (sandboxed)</option>
              </select>
            </div>
          </div>
          {selectedModel && (
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {(() => {
                const m = availableModels.find((m) => m.id === selectedModel);
                if (!m) return null;
                return `Context: ${(m.context_window / 1000).toFixed(0)}K tokens | Cost: $${m.pricing.input_per_1m}/M input, $${m.pricing.output_per_1m}/M output | Tags: ${m.tags.join(", ")}`;
              })()}
            </div>
          )}
          <button type="submit" className="btn" disabled={creating || !hasAnyKey}>
            {creating ? "Creating..." : "Create Task"}
          </button>
        </form>
      </div>
      <div className="card">
        <h2>Recent Tasks</h2>
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet. Create one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {tasks.map((t) => (
              <div
                key={t.id}
                onClick={() => navigate(`/tasks/${t.id}`)}
                style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem", background: "var(--bg)", borderRadius: "var(--radius)", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg)")}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: "0.8125rem" }}>
                    {t.model ? t.model.split(":")[1] ?? t.model : "auto"} · {t.id.slice(0, 8)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <span className="muted" style={{ fontSize: "0.8125rem" }}>${t.budget_usd}</span>
                  <span style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    background: t.status === "complete" ? "#238636" : t.status === "running" ? "#1f6feb" : t.status === "failed" ? "#f85149" : "var(--border)",
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
