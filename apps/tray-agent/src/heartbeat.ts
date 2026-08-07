/**
 * Heartbeat scheduler — proactive action engine for the personal agent.
 *
 * Lets the agent initiate actions on:
 * - Cron schedules (e.g. "every morning at 9am") — minimal 5-field cron
 * - Intervals (e.g. "every 30 minutes")
 * - Events (webhooks, file changes, incoming messages)
 *
 * This is what makes the agent "proactive" rather than purely reactive.
 * The OpenClaw philosophy: the agent has a heartbeat, a pulse, it doesn't
 * just wait for you to talk to it.
 */

export interface HeartbeatAction {
  id: string;
  name: string;
  /** Cron expression or interval in minutes. */
  schedule: string;
  /** Whether this is a cron expr or a minute interval. */
  scheduleType: "cron" | "interval";
  /** The action to execute. */
  execute: () => Promise<void>;
  /** Whether this heartbeat is currently active. */
  enabled: boolean;
  /** Last run time. */
  lastRun?: Date;
  /** Last run result. */
  lastResult?: "success" | "error";
  /** Number of times this has run. */
  runCount: number;
}

export class HeartbeatScheduler {
  private heartbeats = new Map<string, HeartbeatAction>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  register(action: Omit<HeartbeatAction, "lastRun" | "lastResult" | "runCount">): void {
    if (this.heartbeats.has(action.id)) {
      throw new Error(`heartbeat already registered: ${action.id}`);
    }
    const hb: HeartbeatAction = { ...action, runCount: 0 };
    this.heartbeats.set(action.id, hb);
    if (hb.enabled) this.start(hb);
  }

  unregister(id: string): void {
    this.stop(id);
    this.heartbeats.delete(id);
  }

  enable(id: string): void {
    const hb = this.heartbeats.get(id);
    if (hb) {
      hb.enabled = true;
      this.start(hb);
    }
  }

  disable(id: string): void {
    const hb = this.heartbeats.get(id);
    if (hb) {
      hb.enabled = false;
      this.stop(id);
    }
  }

  list(): HeartbeatAction[] {
    return [...this.heartbeats.values()];
  }

  private start(hb: HeartbeatAction): void {
    if (hb.scheduleType === "interval") {
      const minutes = parseInt(hb.schedule, 10);
      const ms = minutes * 60 * 1000;
      const timer = setInterval(() => void this.run(hb), ms);
      this.timers.set(hb.id, timer);
    } else {
      // Minimal cron: check every minute if the current time matches.
      const timer = setInterval(() => {
        if (cronMatches(hb.schedule, new Date())) void this.run(hb);
      }, 60 * 1000);
      this.timers.set(hb.id, timer);
    }
  }

  private stop(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  private async run(hb: HeartbeatAction): Promise<void> {
    console.log(`[heartbeat] running ${hb.name} (${hb.id})`);
    try {
      await hb.execute();
      hb.lastRun = new Date();
      hb.lastResult = "success";
      hb.runCount++;
    } catch (e) {
      hb.lastRun = new Date();
      hb.lastResult = "error";
      hb.runCount++;
      console.error(`[heartbeat] ${hb.id} failed: ${e}`);
    }
  }

  stopAll(): void {
    for (const id of this.heartbeats.keys()) {
      this.stop(id);
    }
  }
}

/**
 * Minimal 5-field cron matcher (minute hour day-of-month month day-of-week).
 * Supports: wildcard, specific numbers, step expressions (star-slash-N), comma lists.
 * Does NOT support ranges (1-5), named days, or L/W modifiers (M2 scope).
 */
function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minField, hourField, domField, monthField, dowField] = fields;

  return (
    fieldMatches(minField!, date.getMinutes()) &&
    fieldMatches(hourField!, date.getHours()) &&
    fieldMatches(domField!, date.getDate()) &&
    fieldMatches(monthField!, date.getMonth() + 1) &&
    fieldMatches(dowField!, date.getDay())
  );
}

function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  // */N step
  const stepMatch = field.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1]!, 10);
    return value % step === 0;
  }
  // Comma list
  if (field.includes(",")) {
    return field.split(",").some((f) => fieldMatches(f, value));
  }
  // Specific number
  const n = parseInt(field, 10);
  if (isNaN(n)) return false;
  return n === value;
}
