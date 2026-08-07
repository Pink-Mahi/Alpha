import { useEffect, useState } from "react";

interface ByoKey {
  id: string;
  provider: string;
  label: string;
  created_at: string;
}

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic (Claude)", prefix: "sk-ant-", url: "https://console.anthropic.com" },
  { id: "openai", name: "OpenAI (GPT)", prefix: "sk-", url: "https://platform.openai.com/api-keys" },
  { id: "xai", name: "xAI (Grok)", prefix: "xai-", url: "https://console.x.ai" },
  { id: "google", name: "Google (Gemini)", prefix: "AI", url: "https://aistudio.google.com/apikey" },
];

export function Settings() {
  const [keys, setKeys] = useState<ByoKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    const token = localStorage.getItem("alpha_token");
    if (!token) { window.location.href = "/login"; return; }
    try {
      const resp = await fetch("/v1/byo-keys", { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setKeys(data.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setAdding(true);
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch("/v1/byo-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, key: apiKey, label: label || `${provider} key` }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Failed to add key");
        return;
      }
      setSuccess(`Added ${provider} key successfully`);
      setApiKey("");
      setLabel("");
      fetchKeys();
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function deleteKey(id: string, providerName: string) {
    if (!confirm(`Delete the ${providerName} key?`)) return;
    const token = localStorage.getItem("alpha_token");
    const resp = await fetch(`/v1/byo-keys/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      setSuccess(`Deleted ${providerName} key`);
      fetchKeys();
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);

  if (loading) return <div className="muted">Loading...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Settings</h1>

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

      {/* --- BYO Keys --- */}
      <div className="card">
        <h2>API Keys (Bring Your Own)</h2>
        <p className="muted" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
          Add your own LLM provider API keys. Keys are encrypted at rest and used to route
          agent requests to your preferred provider. Get keys from the provider consoles linked below.
        </p>

        {/* Add key form */}
        <form onSubmit={addKey} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.75rem" }}>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder={`Label (e.g. "work key") — defaults to "${provider} key"`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <input
            type="password"
            placeholder={`Paste your ${selectedProvider?.name ?? ""} API key here...`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            minLength={10}
          />
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button type="submit" className="btn" disabled={adding || !apiKey}>
              {adding ? "Adding..." : "Add Key"}
            </button>
            {selectedProvider && (
              <a href={selectedProvider.url} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: "0.8125rem" }}>
                Get a {selectedProvider.name} key →
              </a>
            )}
          </div>
        </form>

        {/* Existing keys */}
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem" }}>Your Keys</h3>
        {keys.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.875rem" }}>No API keys added yet. Add one above to start using the agent.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {keys.map((k) => {
              const prov = PROVIDERS.find((p) => p.id === k.provider);
              return (
                <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "var(--bg)", borderRadius: "var(--radius)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      background: "var(--border)",
                      textTransform: "capitalize",
                    }}>{k.provider}</span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{k.label}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        Added {new Date(k.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => deleteKey(k.id, prov?.name ?? k.provider)}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Provider info --- */}
      <div className="card">
        <h2>Supported Providers</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {PROVIDERS.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0" }}>
              <div>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>key prefix: {p.prefix}...</span>
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: "0.8125rem" }}>
                Get key →
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
