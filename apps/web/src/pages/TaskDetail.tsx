import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileExplorer } from "../components/FileExplorer";

interface AgentEvent {
  version: string;
  org_id: string;
  run_id: string;
  task_id: string;
  seq: number;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
}

interface Message {
  id: string;
  role: string;
  content: string;
  model: string | null;
  cost_usd: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
}

interface TaskData {
  id: string;
  title: string;
  spec: string;
  status: string;
  budget_usd: string;
  runtime_pref: string;
  model: string | null;
  agent_count: number;
  created_at: string;
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

interface AgentState {
  status: string;
  events: AgentEvent[];
  result?: { summary: string; costUsd: number; iterations: number; success: boolean };
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentTaskId, setAgentTaskId] = useState<string | null>(null);
  // Swarm state
  const [swarmId, setSwarmId] = useState<string | null>(null);
  const [swarmAgents, setSwarmAgents] = useState<Array<{ id: string; status: string; model?: string; events: AgentEvent[]; result?: { summary: string; costUsd: number; iterations: number; success: boolean }; directives?: string[] }>>([]);
  const [swarmSupervisors, setSwarmSupervisors] = useState<Array<{ id: string; status: string; model?: string; events: AgentEvent[]; result?: { summary: string; costUsd: number; iterations: number; success: boolean } }>>([]);
  const [swarmSubtasks, setSwarmSubtasks] = useState<string[]>([]);
  const [activeAgentTab, setActiveAgentTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [inputText, setInputText] = useState("");
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const eventLogRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTask = useCallback(async () => {
    const token = localStorage.getItem("alpha_token");
    if (!token) { navigate("/login"); return; }
    try {
      const resp = await fetch(`/v1/tasks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        if (data.task) {
          setTask(data.task);
          setTitleDraft(data.task.title);
          if (data.task.model) setSelectedModel(data.task.model);
        }
      } else if (resp.status === 401) {
        navigate("/login");
        return;
      } else {
        setError(`Failed to load task (status ${resp.status})`);
      }
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchMessages = useCallback(async () => {
    const token = localStorage.getItem("alpha_token");
    if (!token) return;
    try {
      const resp = await fetch(`/v1/tasks/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setMessages(data.messages ?? []);
      }
    } catch { /* ignore */ }
  }, [id]);

  const fetchModels = useCallback(async () => {
    const token = localStorage.getItem("alpha_token");
    if (!token) return;
    try {
      const resp = await fetch(`/v1/models`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setProviders(data.providers ?? []);
        if (!selectedModel && data.default_model) setSelectedModel(data.default_model);
      }
    } catch { /* ignore */ }
  }, [selectedModel]);

  useEffect(() => {
    fetchTask();
    fetchMessages();
    fetchModels();
  }, [fetchTask, fetchMessages, fetchModels]);

  const pollEvents = useCallback(async () => {
    if (!id) return;
    const token = localStorage.getItem("alpha_token");

    // Swarm mode polling
    if (swarmId) {
      try {
        const resp = await fetch(`/v1/tasks/${id}/swarm-events?swarm_id=${swarmId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json() as {
            status: string;
            subtasks: string[];
            agents: Array<{ id: string; status: string; model?: string; events: AgentEvent[]; result?: { summary: string; costUsd: number; iterations: number; success: boolean }; directives?: string[] }>;
            supervisors?: Array<{ id: string; status: string; model?: string; events: AgentEvent[]; result?: { summary: string; costUsd: number; iterations: number; success: boolean } }>;
          };
          setSwarmAgents(data.agents ?? []);
          setSwarmSupervisors(data.supervisors ?? []);
          setSwarmSubtasks(data.subtasks ?? []);
          if (data.status === "complete") {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            fetchMessages();
            setSending(false);
          }
        }
      } catch { /* keep polling */ }
      return;
    }

    // Single agent mode polling
    if (!agentTaskId) return;
    try {
      const resp = await fetch(`/v1/tasks/${id}/events?agent_task_id=${agentTaskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = (await resp.json()) as AgentState;
        setAgentState(data);
        if (data.status === "complete" || data.status === "failed" || data.status === "killed") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          fetchMessages();
          setSending(false);
        }
      }
    } catch { /* keep polling */ }
  }, [agentTaskId, swarmId, id, fetchMessages]);

  useEffect(() => {
    if (agentTaskId || swarmId) {
      pollEvents();
      pollRef.current = setInterval(pollEvents, 1500);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [agentTaskId, swarmId, pollEvents]);

  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [agentState?.events.length, messages.length]);

  async function sendMessage() {
    if (!inputText.trim() || sending) return;
    setError("");
    setSending(true);
    setAgentState(null);
    setSwarmId(null);
    setSwarmAgents([]);
    setSwarmSubtasks([]);
    const token = localStorage.getItem("alpha_token");
    const userMsg = inputText.trim();
    setInputText("");

    // Optimistically add the user message
    setMessages((prev) => [...prev, {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMsg,
      model: null,
      cost_usd: null,
      tokens_in: null,
      tokens_out: null,
      created_at: new Date().toISOString(),
    }]);

    try {
      const resp = await fetch(`/v1/tasks/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: userMsg, model: selectedModel || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.message ?? data.error ?? "Failed to send message");
        setSending(false);
        return;
      }
      // Handle swarm vs single agent response
      if (data.swarm_id) {
        setSwarmId(data.swarm_id);
        setSwarmSubtasks(data.subtasks ?? []);
        setActiveAgentTab(0);
      } else {
        setAgentTaskId(data.agent_task_id);
      }
    } catch {
      setError("Network error — is the backend running?");
      setSending(false);
    }
  }

  async function saveTitle() {
    if (!titleDraft.trim() || !task) return;
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      if (resp.ok) {
        setTask({ ...task, title: titleDraft.trim() });
        setEditingTitle(false);
      }
    } catch { /* ignore */ }
  }

  async function changeModel(newModel: string) {
    setSelectedModel(newModel);
    if (task) {
      const token = localStorage.getItem("alpha_token");
      try {
        await fetch(`/v1/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model: newModel }),
        });
        setTask({ ...task, model: newModel });
      } catch { /* ignore */ }
    }
  }

  if (loading) return <div className="muted">Loading...</div>;
  if (!task) return <div className="muted">Task not found.</div>;

  const events = agentState?.events ?? [];
  const isRunning = agentState?.status === "running" || (swarmId && swarmAgents.some((a) => a.status === "running")) ? true : false;
  const availableModels = providers.filter((p) => p.has_key).flatMap((p) => p.models);
  const totalCost = events
    .filter((e) => e.type === "cost.tick")
    .reduce((sum, e) => sum + ((e.payload.cost_usd as number) ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 2rem)", maxHeight: "calc(100vh - 2rem)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexShrink: 0 }}>
        <button className="btn btn-secondary" style={{ fontSize: "0.8125rem", padding: "0.25rem 0.6rem" }} onClick={() => navigate("/tasks")}>
          ← Tasks
        </button>
        {editingTitle ? (
          <>
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              style={{ flex: 1, fontSize: "1.125rem", fontWeight: 600 }}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            />
            <button className="btn" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }} onClick={saveTitle}>Save</button>
            <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }} onClick={() => setEditingTitle(false)}>Cancel</button>
          </>
        ) : (
          <h1
            style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, cursor: "pointer", flex: 1 }}
            onClick={() => setEditingTitle(true)}
            title="Click to edit"
          >
            {task.title}
          </h1>
        )}
        {/* Model picker */}
        <select
          value={selectedModel}
          onChange={(e) => changeModel(e.target.value)}
          style={{ fontSize: "0.8125rem", maxWidth: "200px" }}
          title="Switch AI model"
        >
          {availableModels.length === 0 && <option value="">No keys</option>}
          {providers.filter((p) => p.has_key).map((pg) => (
            <optgroup key={pg.provider} label={pg.provider.charAt(0).toUpperCase() + pg.provider.slice(1)}>
              {pg.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          className={showFiles ? "btn" : "btn btn-secondary"}
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
          onClick={() => setShowFiles(!showFiles)}
          title="Toggle file explorer"
        >📁 Files</button>
        <span style={{
          padding: "0.25rem 0.6rem",
          borderRadius: "4px",
          fontSize: "0.75rem",
          background: task.status === "complete" ? "#238636" : task.status === "running" ? "#1f6feb" : task.status === "failed" ? "#f85149" : "var(--border)",
          color: "white",
        }}>{task.status}</span>
        <button
          className="btn btn-secondary"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", color: "#f85149" }}
          onClick={async () => {
            if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
            const token = localStorage.getItem("alpha_token");
            try {
              await fetch(`/v1/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
              navigate("/tasks");
            } catch { /* ignore */ }
          }}
        >🗑 Delete</button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#f85149", color: "#f85149", fontSize: "0.875rem", marginBottom: "0.75rem", flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Main content: chat + optional file explorer sidebar */}
      <div style={{ flex: 1, display: "flex", gap: "0.75rem", overflow: "hidden", marginBottom: "0.75rem" }}>
        {/* Chat area */}
        <div ref={eventLogRef} style={{ flex: 1, overflowY: "auto" }}>
          {/* Conversation messages */}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))

          /* Live agent events (while running) */
          }
          {agentTaskId && events.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#1f6feb", marginBottom: "0.5rem" }}>
                ● Agent working{totalCost > 0 ? ` — $${totalCost.toFixed(4)}` : ""}
              </div>
              {events.map((e, i) => <EventRow key={i} event={e} />)}
            </div>
          )}

          {/* Swarm mode: multiple agent streams with tabs */}
          {swarmId && swarmAgents.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#1f6feb", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                ● Swarm of {swarmAgents.length} agents working
                {swarmSupervisors.length > 0 && (
                  <span style={{ color: "#d29922" }}>
                    + {swarmSupervisors.length} supervisor{swarmSupervisors.length > 1 ? "s" : ""}
                  </span>
                )}
                {swarmAgents.filter((a) => a.status === "complete").length > 0 && (
                  <span style={{ color: "#238636" }}>
                    ({swarmAgents.filter((a) => a.status === "complete").length} workers done)
                  </span>
                )}
              </div>

              {/* Supervisor agents section */}
              {swarmSupervisors.length > 0 && (
                <div style={{ marginBottom: "0.5rem", padding: "0.5rem 0.6rem", background: "rgba(210, 153, 34, 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(210, 153, 34, 0.2)" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#d29922", marginBottom: "0.3rem" }}>
                    🔭 Supervisor Agents
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {swarmSupervisors.map((sup, i) => (
                      <span key={sup.id} style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "var(--radius)",
                        fontSize: "0.65rem",
                        background: sup.status === "complete" ? "rgba(35, 134, 54, 0.15)" : sup.status === "running" ? "rgba(31, 111, 235, 0.15)" : "var(--bg)",
                        border: `1px solid ${sup.status === "complete" ? "#238636" : sup.status === "running" ? "#1f6feb" : "var(--border)"}`,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}>
                        <span style={{
                          width: "0.4rem", height: "0.4rem", borderRadius: "50%",
                          background: sup.status === "complete" ? "#238636" : sup.status === "running" ? "#1f6feb" : sup.status === "failed" ? "#f85149" : "var(--muted)",
                        }} />
                        Supervisor {i + 1} ({sup.model?.split(":")[1]?.split("/").pop() ?? sup.model})
                      </span>
                    ))}
                  </div>
                  {/* Show latest supervisor events */}
                  {swarmSupervisors.map((sup) => sup.events.filter((e) => e.type === "tool.call" || e.type === "task.complete").slice(-2).map((e, i) => (
                    <div key={`${sup.id}-${i}`} style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                      {e.type === "tool.call" ? `🔧 ${e.payload.tool}` : "✓ Review complete"}
                    </div>
                  )))}
                </div>
              )}

              {/* Agent tabs */}
              <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                {swarmAgents.map((agent, i) => (
                  <button
                    key={agent.id}
                    onClick={() => setActiveAgentTab(i)}
                    style={{
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius)",
                      fontSize: "0.7rem",
                      border: `1px solid ${activeAgentTab === i ? "#1f6feb" : "var(--border)"}`,
                      background: activeAgentTab === i ? "#1f6feb" : "var(--bg)",
                      color: activeAgentTab === i ? "white" : "inherit",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <span style={{
                      width: "0.5rem", height: "0.5rem", borderRadius: "50%",
                      background: agent.status === "complete" ? "#238636" : agent.status === "running" ? "#1f6feb" : agent.status === "failed" ? "#f85149" : "var(--muted)",
                    }} />
                    Agent {i + 1}
                    {agent.model && (
                      <span style={{ fontSize: "0.6rem", opacity: 0.8, marginLeft: "0.2rem" }}>
                        {agent.model.split(":")[1]?.split("/").pop() ?? agent.model}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Subtask description for active agent */}
              {swarmSubtasks[activeAgentTab] && (
                <div style={{ fontSize: "0.75rem", padding: "0.4rem 0.6rem", background: "var(--bg)", borderRadius: "var(--radius)", marginBottom: "0.5rem", borderLeft: "3px solid #1f6feb" }}>
                  <strong>Subtask:</strong> {swarmSubtasks[activeAgentTab]}
                </div>
              )}

              {/* Supervisor directives for active agent */}
              {swarmAgents[activeAgentTab]?.directives && swarmAgents[activeAgentTab].directives!.length > 0 && (
                <div style={{ fontSize: "0.75rem", padding: "0.4rem 0.6rem", background: "rgba(210, 153, 34, 0.1)", borderRadius: "var(--radius)", marginBottom: "0.5rem", borderLeft: "3px solid #d29922" }}>
                  <strong style={{ color: "#d29922" }}>🔭 Supervisor directive:</strong>
                  <div style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>
                    {swarmAgents[activeAgentTab].directives![swarmAgents[activeAgentTab].directives!.length - 1]}
                  </div>
                </div>
              )}

              {/* Active agent's events */}
              {swarmAgents[activeAgentTab]?.events.map((e, i) => <EventRow key={i} event={e} />)}

              {/* Active agent's result */}
              {swarmAgents[activeAgentTab]?.result && (
                <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: swarmAgents[activeAgentTab].result.success ? "rgba(35, 134, 54, 0.1)" : "rgba(248, 81, 73, 0.1)", borderRadius: "var(--radius)", borderLeft: `3px solid ${swarmAgents[activeAgentTab].result.success ? "#238636" : "#f85149"}` }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {swarmAgents[activeAgentTab].result.success ? "✓" : "✗"} Agent {activeAgentTab + 1} {swarmAgents[activeAgentTab].result.success ? "Complete" : "Failed"}
                  </div>
                  <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>
                    {swarmAgents[activeAgentTab].result.summary}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* File explorer sidebar */}
        {showFiles && (
          <div className="card" style={{ width: "480px", flexShrink: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <FileExplorer taskId={id!} />
          </div>
        )}
      </div>

      {/* Input box */}
      <div style={{ flexShrink: 0, display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={isRunning ? "Agent is working..." : "Send a message to the agent... (Enter to send, Shift+Enter for newline)"}
          disabled={sending}
          rows={2}
          style={{ flex: 1, resize: "none", fontSize: "0.875rem" }}
        />
        <button
          className="btn"
          onClick={sendMessage}
          disabled={sending || !inputText.trim()}
          style={{ height: "fit-content" }}
        >
          {sending ? "Working..." : "Send ↵"}
        </button>
      </div>
    </div>
  );
}

/** Render a conversation message as a chat bubble. */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const time = new Date(message.created_at).toLocaleTimeString();
  const modelName = message.model ? (message.model.split(":")[1] ?? message.model) : null;

  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: "1rem",
    }}>
      <div style={{
        maxWidth: "80%",
        padding: "0.75rem 1rem",
        borderRadius: "var(--radius)",
        background: isUser ? "#1f6feb" : "var(--bg)",
        color: isUser ? "white" : "inherit",
        border: isUser ? "none" : "1px solid var(--border)",
      }}>
        <div style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.25rem" }}>
          {isUser ? "You" : `Agent${modelName ? ` · ${modelName}` : ""}`} · {time}
          {message.cost_usd && parseFloat(message.cost_usd) > 0 && ` · $${parseFloat(message.cost_usd).toFixed(4)}`}
        </div>
        <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {message.content}
        </div>
      </div>
    </div>
  );
}

/** Render a single agent event as a compact row. */
function EventRow({ event }: { event: AgentEvent }) {
  const time = new Date(event.ts).toLocaleTimeString();

  switch (event.type) {
    case "task.start":
      return (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem", paddingLeft: "0.5rem" }}>
          ▶ Started — {time} | Model: {(event.payload.model_policy as { preferred: string[] })?.preferred?.[0] ?? "default"}
        </div>
      );

    case "cost.tick":
      return (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem", paddingLeft: "0.5rem" }}>
          💰 {(event.payload.model as string)?.split(":")[1] ?? "model"} — {(event.payload.tokens_in as number) + (event.payload.tokens_out as number)} tokens, ${(event.payload.cost_usd as number)?.toFixed(4)}
        </div>
      );

    case "tool.call": {
      const tool = event.payload.tool as string;
      const args = event.payload.args as Record<string, unknown>;
      const argPreview = Object.entries(args).slice(0, 2).map(([k, v]) => `${k}: ${truncate(v, 50)}`).join(", ");
      // Special icons for browser tools
      const isBrowser = tool.startsWith("browser.");
      const isWeb = tool.startsWith("web.");
      const isMemory = tool.startsWith("memory.");
      const icon = isBrowser ? "🌐" : isWeb ? "🔍" : isMemory ? "🧠" : "🔧";
      const color = isBrowser ? "#1f6feb" : isWeb ? "#a371f7" : isMemory ? "#238636" : "#d29922";
      return (
        <div style={{ fontSize: "0.8125rem", color, marginBottom: "0.25rem", paddingLeft: "0.5rem" }}>
          {icon} {tool}({argPreview}{Object.keys(args).length > 2 ? "..." : ""})
        </div>
      );
    }

    case "tool.result": {
      const output = event.payload.output;
      const error = event.payload.error as string | null | undefined;
      const isError = error && error !== "null" && error !== undefined;
      return (
        <div style={{ marginBottom: "0.5rem", paddingLeft: "1rem", borderLeft: `2px solid ${isError ? "#f85149" : "var(--border)"}` }}>
          <pre style={{
            fontSize: "0.75rem",
            margin: 0,
            whiteSpace: "pre-wrap",
            color: isError ? "#f85149" : "var(--muted)",
            fontFamily: "monospace",
            maxHeight: "150px",
            overflow: "hidden",
          }}>
            {isError ? error : truncate(output ?? "(no output)", 300)}
          </pre>
        </div>
      );
    }

    case "state.event": {
      const kind = event.payload.kind as string;
      if (kind === "self_reflection") {
        return (
          <div style={{ marginBottom: "0.5rem", paddingLeft: "0.5rem", borderLeft: "3px solid #a371f7" }}>
            <div style={{ fontSize: "0.7rem", color: "#a371f7", fontWeight: 600 }}>🧠 Self-Reflection</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
              {event.payload.summary as string}
            </div>
          </div>
        );
      }
      return null;
    }

    case "supervisor.directive":
      return (
        <div style={{ marginBottom: "0.5rem", paddingLeft: "0.5rem", borderLeft: "3px solid #d29922" }}>
          <div style={{ fontSize: "0.7rem", color: "#d29922", fontWeight: 600 }}>🔭 Supervisor Directive</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem", whiteSpace: "pre-wrap" }}>
            {(event.payload as { directive?: string }).directive}
          </div>
        </div>
      );

    case "task.complete":
      return (
        <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "rgba(35, 134, 54, 0.1)", borderRadius: "var(--radius)", borderLeft: "3px solid #238636" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#238636" }}>✓ Complete — {time}</div>
        </div>
      );

    case "task.failed":
      return (
        <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "rgba(248, 81, 73, 0.1)", borderRadius: "var(--radius)", borderLeft: "3px solid #f85149" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#f85149" }}>✗ Failed — {time}</div>
          <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>{event.payload.reason as string}</div>
        </div>
      );

    default:
      return (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem", paddingLeft: "0.5rem" }}>
          {event.type} — {time}
        </div>
      );
  }
}

function truncate(s: unknown, max: number): string {
  const str = typeof s === "string" ? s : s == null ? "" : JSON.stringify(s);
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}
