import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

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

interface TaskData {
  id: string;
  title: string;
  spec: string;
  status: string;
  budget_usd: string;
  runtime_pref: string;
  model: string | null;
  created_at: string;
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
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentTaskId, setAgentTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [killing, setKilling] = useState(false);
  const eventLogRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTask = useCallback(async () => {
    const token = localStorage.getItem("alpha_token");
    if (!token) { navigate("/login"); return; }
    try {
      const resp = await fetch(`/v1/tasks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setTask(data.task);
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const pollEvents = useCallback(async () => {
    if (!agentTaskId || !id) return;
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${id}/events?agent_task_id=${agentTaskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = (await resp.json()) as AgentState;
        setAgentState(data);
        if (data.status === "complete" || data.status === "failed" || data.status === "killed") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }
    } catch { /* keep polling */ }
  }, [agentTaskId, id]);

  useEffect(() => {
    if (agentTaskId) {
      pollEvents();
      pollRef.current = setInterval(pollEvents, 1500);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [agentTaskId, pollEvents]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [agentState?.events.length]);

  async function startAgent() {
    setError("");
    setStarting(true);
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${id}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.message ?? data.error ?? "Failed to start agent");
        return;
      }
      setAgentTaskId(data.agent_task_id);
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setStarting(false);
    }
  }

  async function killAgent() {
    if (!agentTaskId) return;
    setKilling(true);
    const token = localStorage.getItem("alpha_token");
    try {
      await fetch(`/v1/tasks/${id}/kill?agent_task_id=${agentTaskId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      pollEvents();
    } finally {
      setKilling(false);
    }
  }

  if (loading) return <div className="muted">Loading...</div>;
  if (!task) return <div className="muted">Task not found.</div>;

  const events = agentState?.events ?? [];
  const agentStatus = agentState?.status;
  const isRunning = agentStatus === "running";
  const isDone = agentStatus === "complete" || agentStatus === "failed" || agentStatus === "killed";

  // Calculate total cost from events
  const totalCost = events
    .filter((e) => e.type === "cost.tick")
    .reduce((sum, e) => sum + ((e.payload.cost_usd as number) ?? 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <button className="btn btn-secondary" style={{ fontSize: "0.8125rem", padding: "0.25rem 0.6rem" }} onClick={() => navigate("/tasks")}>
          ← Tasks
        </button>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{task.title}</h1>
        <span style={{
          padding: "0.25rem 0.6rem",
          borderRadius: "4px",
          fontSize: "0.75rem",
          background: task.status === "complete" ? "#238636" : task.status === "running" ? "#1f6feb" : task.status === "failed" ? "#f85149" : "var(--border)",
          color: "white",
        }}>{task.status}</span>
      </div>

      {/* Task spec */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.25rem" }}>Task spec</div>
        <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{task.spec}</div>
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem" }}>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Budget: ${task.budget_usd}</span>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Runtime: {task.runtime_pref}</span>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Model: {task.model ? (task.model.split(":")[1] ?? task.model) : "auto"}</span>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#f85149", color: "#f85149", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Agent controls */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        {!agentTaskId && !isDone && (
          <button className="btn" onClick={startAgent} disabled={starting}>
            {starting ? "Starting agent..." : "▶ Start Agent"}
          </button>
        )}
        {isRunning && (
          <button className="btn btn-secondary" onClick={killAgent} disabled={killing}>
            {killing ? "Stopping..." : "■ Stop Agent"}
          </button>
        )}
        {agentTaskId && (
          <span className="muted" style={{ fontSize: "0.8125rem", alignSelf: "center" }}>
            {isRunning && <span style={{ color: "#1f6feb" }}>● Agent working...</span>}
            {agentStatus === "complete" && <span style={{ color: "#238636" }}>✓ Complete</span>}
            {agentStatus === "failed" && <span style={{ color: "#f85149" }}>✗ Failed</span>}
            {agentStatus === "killed" && <span style={{ color: "#f85149" }}>■ Stopped</span>}
          </span>
        )}
      </div>

      {/* Agent event stream — chat-like UI */}
      {agentTaskId && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Agent Activity</span>
            {totalCost > 0 && (
              <span className="muted" style={{ fontSize: "0.75rem" }}>Cost: ${totalCost.toFixed(4)}</span>
            )}
          </div>
          <div ref={eventLogRef} style={{ maxHeight: "60vh", overflowY: "auto", padding: "0.75rem" }}>
            {events.length === 0 && (
              <div className="muted" style={{ fontSize: "0.875rem", padding: "1rem" }}>Waiting for agent to start...</div>
            )}
            {events.map((e, i) => <EventRow key={i} event={e} />)}
          </div>
        </div>
      )}

      {/* Result summary */}
      {agentState?.result && isDone && (
        <div className="card" style={{ marginTop: "1rem", borderColor: agentState.result.success ? "#238636" : "#f85149" }}>
          <h2 style={{ fontSize: "1rem" }}>Result</h2>
          <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap", marginBottom: "0.75rem" }}>
            {agentState.result.summary}
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <span className="muted" style={{ fontSize: "0.75rem" }}>Cost: ${agentState.result.costUsd.toFixed(4)}</span>
            <span className="muted" style={{ fontSize: "0.75rem" }}>Iterations: {agentState.result.iterations}</span>
            <span className="muted" style={{ fontSize: "0.75rem" }}>Success: {agentState.result.success ? "Yes" : "No"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Render a single agent event as a chat-like row. */
function EventRow({ event }: { event: AgentEvent }) {
  const time = new Date(event.ts).toLocaleTimeString();

  switch (event.type) {
    case "task.start":
      return (
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#1f6feb", marginBottom: "0.25rem" }}>▶ Task started — {time}</div>
          <div style={{ fontSize: "0.875rem", paddingLeft: "1rem", borderLeft: "2px solid var(--border)" }}>
            Budget: ${(event.payload.budget_usd as number)?.toFixed(2)} | Model: {(event.payload.model_policy as { preferred: string[] })?.preferred?.[0] ?? "default"}
          </div>
        </div>
      );

    case "cost.tick":
      return (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem", paddingLeft: "1rem" }}>
          💰 {(event.payload.model as string)?.split(":")[1] ?? "model"} — {(event.payload.tokens_in as number) + (event.payload.tokens_out as number)} tokens, ${(event.payload.cost_usd as number)?.toFixed(4)}
        </div>
      );

    case "tool.call": {
      const tool = event.payload.tool as string;
      const args = event.payload.args as Record<string, unknown>;
      const argPreview = Object.entries(args).slice(0, 3).map(([k, v]) => `${k}: ${truncate(String(v), 60)}`).join(", ");
      return (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#d29922" }}>
            🔧 {tool}({argPreview}{Object.keys(args).length > 3 ? "..." : ""})
          </div>
        </div>
      );
    }

    case "tool.result": {
      const output = event.payload.output as string | undefined;
      const error = event.payload.error as string | null;
      const isError = error && error !== "null";
      return (
        <div style={{ marginBottom: "0.75rem", paddingLeft: "1rem", borderLeft: `2px solid ${isError ? "#f85149" : "var(--border)"}` }}>
          <pre style={{
            fontSize: "0.75rem",
            margin: 0,
            whiteSpace: "pre-wrap",
            color: isError ? "#f85149" : "var(--muted)",
            fontFamily: "monospace",
            maxHeight: "200px",
            overflow: "hidden",
          }}>
            {isError ? error : truncate(output ?? "(no output)", 500)}
          </pre>
        </div>
      );
    }

    case "state.event":
      return null; // redundant with tool.result

    case "task.complete":
      return (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(35, 134, 54, 0.1)", borderRadius: "var(--radius)", borderLeft: "3px solid #238636" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#238636" }}>✓ Task Complete — {time}</div>
          <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>
            {event.payload.summary as string}
          </div>
        </div>
      );

    case "task.failed":
      return (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(248, 81, 73, 0.1)", borderRadius: "var(--radius)", borderLeft: "3px solid #f85149" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f85149" }}>✗ Task Failed — {time}</div>
          <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>
            {event.payload.reason as string}
          </div>
        </div>
      );

    default:
      return (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
          {event.type} — {time}
        </div>
      );
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}
