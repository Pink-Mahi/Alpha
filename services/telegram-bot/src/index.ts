/**
 * Telegram Bot for ALPHA — allows users to communicate with running swarm
 * supervisors via Telegram messages.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=<token> bun run src/index.ts
 *
 * The bot listens for messages and forwards them to the local agent's
 * swarm message injection endpoint. Users need to register their
 * Telegram chat ID and associate it with a running swarm.
 *
 * Commands:
 *   /start — Register and get your chat ID
 *   /link <swarm_id> — Link this chat to a running swarm
 *   /unlink — Unlink from the current swarm
 *   /status — Check the status of the linked swarm
 *   Any text message — Forwarded to the swarm's supervisor
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL ?? "http://localhost:8083";
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL ?? "http://localhost:8080";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required. Get one from @BotFather on Telegram.");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// In-memory mapping: chatId → swarmId (could be persisted to DB later)
const chatSwarms = new Map<number, string>();
// Track last seen status for each swarm to detect changes
const lastSwarmStatus = new Map<string, string>();
// Track last event count for each swarm to detect new events
const lastEventCount = new Map<string, number>();

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
    from?: { id: number; first_name: string; username?: string };
  };
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (e) {
    console.error(`[telegram] failed to send message: ${e}`);
  }
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Handle commands
  if (text.startsWith("/")) {
    const [cmd, ...args] = text.split(" ");

    switch (cmd.toLowerCase()) {
      case "/start": {
        await sendMessage(chatId, `👋 *ALPHA Telegram Bot*\n\nYour chat ID is: \`${chatId}\`\n\nUse \`/link <swarm_id>\` to connect this chat to a running swarm.\n\nOnce linked, any message you send will be forwarded to the swarm's supervisor agent in real-time.`);
        return;
      }

      case "/link": {
        const swarmId = args[0];
        if (!swarmId) {
          await sendMessage(chatId, "Usage: `/link <swarm_id>`\n\nGet the swarm ID from the ALPHA web UI when a task is running.");
          return;
        }
        chatSwarms.set(chatId, swarmId);
        await sendMessage(chatId, `✅ Linked to swarm \`${swarmId}\`\n\nNow any message you send will be forwarded to the supervisor agent. The supervisor will incorporate your feedback into its work.`);
        return;
      }

      case "/unlink": {
        chatSwarms.delete(chatId);
        await sendMessage(chatId, "✅ Unlinked from swarm. Use `/link <swarm_id>` to link again.");
        return;
      }

      case "/status": {
        const swarmId = chatSwarms.get(chatId);
        if (!swarmId) {
          await sendMessage(chatId, "Not linked to any swarm. Use `/link <swarm_id>` first.");
          return;
        }
        try {
          const resp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/swarm/${swarmId}`);
          if (!resp.ok) {
            await sendMessage(chatId, `❌ Swarm not found. It may have completed or expired.`);
            chatSwarms.delete(chatId);
            return;
          }
          const data = await resp.json() as {
            status: string;
            agents: Array<{ id: string; status: string; model: string }>;
            supervisors: Array<{ id: string; status: string; model: string }>;
            user_messages: Array<{ text: string; source: string; ts: string }>;
          };
          let statusText = `📊 *Swarm Status: ${data.status}*\n\n`;
          statusText += `*Workers:*\n`;
          for (const a of data.agents) {
            statusText += `  • Agent (${a.model}): ${a.status}\n`;
          }
          if (data.supervisors.length > 0) {
            statusText += `\n*Supervisors:*\n`;
            for (const s of data.supervisors) {
              statusText += `  • Supervisor (${s.model}): ${s.status}\n`;
            }
          }
          if (data.user_messages.length > 0) {
            statusText += `\n*Your messages:* ${data.user_messages.length}\n`;
          }
          await sendMessage(chatId, statusText);
        } catch {
          await sendMessage(chatId, "❌ Could not reach the local agent. Is it running?");
        }
        return;
      }

      case "/help": {
        await sendMessage(chatId, `*ALPHA Telegram Bot Commands*\n\n` +
          `/start — Get your chat ID\n` +
          `/link <swarm_id> — Link to a running swarm\n` +
          `/unlink — Unlink from swarm\n` +
          `/status — Check swarm status\n` +
          `/help — Show this help\n\n` +
          `Once linked, any text message is forwarded to the supervisor agent.`);
        return;
      }

      default:
        return; // Ignore unknown commands
    }
  }

  // Forward regular messages to the linked swarm
  const swarmId = chatSwarms.get(chatId);
  if (!swarmId) {
    await sendMessage(chatId, "Not linked to any swarm. Use `/link <swarm_id>` to connect first.");
    return;
  }

  try {
    const resp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/swarm/${swarmId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: "telegram" }),
    });

    if (resp.ok) {
      const data = await resp.json() as { delivered_to: number };
      await sendMessage(chatId, `✅ Message delivered to ${data.delivered_to} supervisor(s). They will incorporate your feedback.`);
    } else if (resp.status === 404) {
      await sendMessage(chatId, "❌ Swarm not found. It may have completed. Use `/link <new_swarm_id>` to link to a new one.");
      chatSwarms.delete(chatId);
    } else {
      await sendMessage(chatId, "❌ Failed to deliver message. Please try again.");
    }
  } catch {
    await sendMessage(chatId, "❌ Could not reach the local agent. Is it running?");
  }
}

// Long-polling loop
let lastUpdateId = 0;
console.log(`[telegram-bot] started, polling for updates...`);

async function pollLoop() {
  while (true) {
    try {
      const resp = await fetch(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`, {
        signal: AbortSignal.timeout(35000),
      });

      if (!resp.ok) {
        console.error(`[telegram-bot] getUpdates failed: ${resp.status}`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const data = await resp.json() as { ok: boolean; result: TelegramUpdate[] };
      if (!data.ok || !data.result) continue;

      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        await handleUpdate(update);
      }
    } catch (e) {
      // Timeout or network error — just continue
      if (e instanceof Error && !e.message.includes("abort")) {
        console.error(`[telegram-bot] poll error: ${e.message}`);
      }
    }
  }
}

pollLoop();

// Status monitoring loop — checks linked swarms for updates and notifies users
async function statusLoop() {
  while (true) {
    await new Promise((r) => setTimeout(r, 10000)); // check every 10 seconds

    for (const [chatId, swarmId] of chatSwarms) {
      try {
        const resp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/swarm/${swarmId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) continue;
        const data = await resp.json() as {
          status: string;
          agents: Array<{ id: string; status: string; model: string; events: Array<{ type: string; payload?: { summary?: string; reason?: string } }> }>;
          supervisors: Array<{ id: string; status: string; model: string; events: Array<{ type: string; payload?: { summary?: string; reason?: string; kind?: string } }> }>;
        };

        const prevStatus = lastSwarmStatus.get(swarmId);
        const prevEventCount = lastEventCount.get(swarmId) ?? 0;

        // Count total events
        const totalEvents = [...data.agents, ...data.supervisors].reduce((sum, a) => sum + a.events.length, 0);

        // Check for status change
        if (prevStatus && prevStatus !== data.status) {
          if (data.status === "complete") {
            // Find the supervisor's completion summary
            let summary = "All agents have completed their work.";
            for (const sup of data.supervisors) {
              const completeEvent = sup.events.find((e) => e.type === "task.complete");
              if (completeEvent?.payload?.summary) {
                summary = completeEvent.payload.summary;
                break;
              }
            }
            await sendMessage(chatId, `✅ *Swarm Complete!*\n\n${summary.slice(0, 1000)}\n\nCheck the ALPHA web UI for full details and files.`);
          } else if (data.status === "failed") {
            await sendMessage(chatId, `❌ *Swarm Failed*\n\nThe swarm encountered an error. Check the ALPHA web UI for details.`);
          }
        }

        // Check for new supervisor reflections or completions (new events)
        if (totalEvents > prevEventCount) {
          for (const sup of data.supervisors) {
            for (const evt of sup.events.slice(-5)) {
              // Speak new reflections via text (Telegram doesn't support TTS easily)
              if (evt.type === "state.event" && evt.payload?.kind === "self_reflection" && evt.payload?.summary) {
                // Only send if this is a new event
                const eventIndex = sup.events.indexOf(evt);
                if (eventIndex >= prevEventCount - sup.events.length + 5) {
                  // It's recent enough — send it
                  // Avoid spam: only send reflections every 30 seconds at most
                  const lastNotified = lastReflectionNotified.get(chatId) ?? 0;
                  if (Date.now() - lastNotified > 30000) {
                    await sendMessage(chatId, `🔭 *Supervisor Update:*\n${evt.payload.summary.slice(0, 500)}`);
                    lastReflectionNotified.set(chatId, Date.now());
                  }
                }
              }
            }
          }
        }

        lastSwarmStatus.set(swarmId, data.status);
        lastEventCount.set(swarmId, totalEvents);
      } catch {
        // Network error — skip this cycle
      }
    }
  }
}

const lastReflectionNotified = new Map<number, number>();
statusLoop();
