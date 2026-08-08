/**
 * System Administration tools — process management, network diagnostics,
 * cron schedule parsing, disk/memory info, and system health checks.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// SYS PROCESS — process listing and management info
// =============================================================================

export const sysProcess: ToolDef = {
  name: "sys.process",
  description: "List and analyze system processes: get running processes with CPU/memory usage, find processes by name, get system resource summary (CPU, memory, disk, uptime), and kill process by PID (requires approval). Useful for monitoring system health and diagnosing performance issues.",
  inputSchema: z.object({
    operation: z.enum(["list", "find", "resources", "top_cpu", "top_memory"]).describe("Process operation"),
    process_name: z.string().optional().describe("Process name to search for (for 'find')"),
    limit: z.number().default(20).describe("Maximum number of results"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    processes: z.array(z.object({
      pid: z.number(),
      name: z.string(),
      cpu: z.number().optional(),
      memory: z.number().optional(),
    })).optional(),
    resources: z.object({
      cpu_usage: z.number().optional(),
      memory_total: z.number().optional(),
      memory_used: z.number().optional(),
      memory_free: z.number().optional(),
      disk_total: z.number().optional(),
      disk_used: z.number().optional(),
      uptime: z.string().optional(),
      load_average: z.array(z.number()).optional(),
    }).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      const os = await import("os");
      const { execSync } = await import("child_process");

      switch (params.operation) {
        case "resources": {
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const uptime = os.uptime();
          const loadAvg = os.loadavg();
          const cpus = os.cpus();
          const platform = os.platform();
          const arch = os.arch();
          const hostname = os.hostname();

          const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

          let diskTotal: number | undefined;
          let diskUsed: number | undefined;
          try {
            if (platform === "win32") {
              const dfOutput = execSync("wmic logicaldisk get size,freespace,caption", { encoding: "utf8" });
              const lines = dfOutput.trim().split("\n").slice(1);
              let total = 0;
              let used = 0;
              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                  const free = parseInt(parts[1] || "0");
                  const size = parseInt(parts[2] || "0");
                  total += size;
                  used += size - free;
                }
              }
              diskTotal = total;
              diskUsed = used;
            } else {
              const dfOutput = execSync("df -k /", { encoding: "utf8" });
              const lines = dfOutput.trim().split("\n");
              if (lines.length >= 2) {
                const parts = lines[1]!.trim().split(/\s+/);
                diskTotal = parseInt(parts[1] || "0") * 1024;
                diskUsed = parseInt(parts[2] || "0") * 1024;
              }
            }
          } catch {
            // Disk info not available
          }

          const resources = {
            cpu_usage: loadAvg[0] ?? 0,
            memory_total: totalMem,
            memory_used: usedMem,
            memory_free: freeMem,
            disk_total: diskTotal,
            disk_used: diskUsed,
            uptime: uptimeStr,
            load_average: loadAvg,
          };

          steps.push(`System Resources:`);
          steps.push(`  Platform: ${platform} ${arch}, Host: ${hostname}`);
          steps.push(`  CPU cores: ${cpus.length}, Load avg: ${loadAvg.map((l) => l.toFixed(2)).join(", ")}`);
          steps.push(`  Memory: ${(usedMem / 1e9).toFixed(2)} / ${(totalMem / 1e9).toFixed(2)} GB used (${((usedMem / totalMem) * 100).toFixed(1)}%)`);
          steps.push(`  Uptime: ${uptimeStr}`);
          if (diskTotal && diskUsed !== undefined) steps.push(`  Disk: ${(diskUsed / 1e9).toFixed(2)} / ${(diskTotal / 1e9).toFixed(2)} GB used`);

          return {
            success: true,
            result: steps.join("\n"),
            resources,
            steps,
            message: `CPU load: ${(loadAvg[0] ?? 0).toFixed(2)}, Memory: ${((usedMem / totalMem) * 100).toFixed(1)}% used, Uptime: ${uptimeStr}`,
          };
        }

        case "list":
        case "top_cpu":
        case "top_memory": {
          let processes: Array<{ pid: number; name: string; cpu?: number; memory?: number }> = [];
          try {
            if (os.platform() === "win32") {
              const output = execSync('powershell -Command "Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First ' + params.limit + ' Id,ProcessName,CPU,WorkingSet | Format-Table -HideTableHeaders"', { encoding: "utf8" });
              const lines = output.trim().split("\n");
              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                  const pid = parseInt(parts[0] || "0");
                  const name = parts.slice(1, -2).join(" ");
                  const cpu = parseFloat(parts[parts.length - 2] || "0");
                  const mem = parseFloat(parts[parts.length - 1] || "0");
                  processes.push({ pid, name, cpu, memory: mem });
                }
              }
              if (params.operation === "top_memory") {
                processes.sort((a, b) => (b.memory ?? 0) - (a.memory ?? 0));
              }
            } else {
              const output = execSync('ps aux --sort=-%cpu | head -n ' + (params.limit + 1), { encoding: "utf8" });
              const lines = output.trim().split("\n").slice(1);
              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 11) {
                  const pid = parseInt(parts[1] || "0");
                  const cpu = parseFloat(parts[2] || "0");
                  const mem = parseFloat(parts[3] || "0");
                  const name = parts.slice(10).join(" ");
                  processes.push({ pid, name, cpu, memory: mem });
                }
              }
              if (params.operation === "top_memory") {
                processes.sort((a, b) => (b.memory ?? 0) - (a.memory ?? 0));
              }
            }
          } catch {
            return { success: false, result: "", steps, message: "Failed to list processes" };
          }

          processes = processes.slice(0, params.limit);
          steps.push(`${params.operation === "top_memory" ? "Top memory" : "Top CPU"} processes (${processes.length}):`);
          for (const p of processes.slice(0, 10)) {
            steps.push(`  PID ${p.pid}: ${p.name} (CPU: ${p.cpu ?? "N/A"}, Mem: ${p.memory ?? "N/A"})`);
          }

          return {
            success: true,
            result: steps.join("\n"),
            processes,
            steps,
            message: `${processes.length} processes listed`,
          };
        }

        case "find": {
          if (!params.process_name) return { success: false, result: "", steps, message: "Provide process_name to search" };
          const nameLower = params.process_name.toLowerCase();
          let processes: Array<{ pid: number; name: string; cpu?: number; memory?: number }> = [];
          try {
            if (os.platform() === "win32") {
              const output = execSync('powershell -Command "Get-Process | Where-Object { $_.ProcessName -like \'*' + params.process_name + '*\' } | Select-Object Id,ProcessName,CPU,WorkingSet | Format-Table -HideTableHeaders"', { encoding: "utf8" });
              const lines = output.trim().split("\n");
              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                  const pid = parseInt(parts[0] || "0");
                  const name = parts.slice(1, -2).join(" ");
                  const cpu = parseFloat(parts[parts.length - 2] || "0");
                  const mem = parseFloat(parts[parts.length - 1] || "0");
                  if (name.toLowerCase().includes(nameLower)) {
                    processes.push({ pid, name, cpu, memory: mem });
                  }
                }
              }
            } else {
              const output = execSync('ps aux', { encoding: "utf8" });
              const lines = output.trim().split("\n").slice(1);
              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 11) {
                  const name = parts.slice(10).join(" ");
                  if (name.toLowerCase().includes(nameLower)) {
                    processes.push({
                      pid: parseInt(parts[1] || "0"),
                      name,
                      cpu: parseFloat(parts[2] || "0"),
                      memory: parseFloat(parts[3] || "0"),
                    });
                  }
                }
              }
            }
          } catch {
            return { success: false, result: "", steps, message: "Failed to search processes" };
          }

          processes = processes.slice(0, params.limit);
          steps.push(`Found ${processes.length} processes matching '${params.process_name}':`);
          for (const p of processes) {
            steps.push(`  PID ${p.pid}: ${p.name} (CPU: ${p.cpu ?? "N/A"}, Mem: ${p.memory ?? "N/A"})`);
          }

          return {
            success: true,
            result: steps.join("\n"),
            processes,
            steps,
            message: `${processes.length} processes found matching '${params.process_name}'`,
          };
        }

        default:
          return { success: false, result: "", steps, message: "Unknown operation" };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// SYS NETWORK — network diagnostics (ping, DNS, ports)
// =============================================================================

export const sysNetwork: ToolDef = {
  name: "sys.network",
  description: "Network diagnostics: ping a host, DNS lookup (resolve hostname to IP), reverse DNS, check if port is open, list network interfaces, and get public IP. Useful for troubleshooting connectivity and network configuration.",
  inputSchema: z.object({
    operation: z.enum(["ping", "dns_lookup", "reverse_dns", "port_check", "interfaces", "public_ip"]).describe("Network operation"),
    host: z.string().optional().describe("Hostname or IP address"),
    port: z.number().optional().describe("Port number (for port_check)"),
    timeout_ms: z.number().default(5000).describe("Timeout in milliseconds"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      const os = await import("os");
      const { execSync } = await import("child_process");

      switch (params.operation) {
        case "ping": {
          if (!params.host) return { success: false, result: "", steps, message: "Provide host to ping" };
          try {
            const cmd = os.platform() === "win32"
              ? `ping -n 4 ${params.host}`
              : `ping -c 4 ${params.host}`;
            const output = execSync(cmd, { encoding: "utf8", timeout: params.timeout_ms + 5000 });
            steps.push(`Ping ${params.host}:`);
            steps.push(output.trim());
            return { success: true, result: output.trim(), steps, message: `Ping ${params.host} completed` };
          } catch (e: any) {
            steps.push(`Ping ${params.host} failed: ${e.message}`);
            return { success: false, result: "", steps, message: `Ping failed: ${e.message}` };
          }
        }

        case "dns_lookup": {
          if (!params.host) return { success: false, result: "", steps, message: "Provide hostname to resolve" };
          try {
            const { promises: dnsPromises } = await import("dns");
            const addresses = await dnsPromises.lookup(params.host, { all: true });
            steps.push(`DNS lookup for ${params.host}:`);
            for (const addr of addresses) {
              steps.push(`  ${addr.address} (${addr.family === 4 ? "IPv4" : "IPv6"})`);
            }
            return { success: true, result: addresses.map((a) => a.address).join(", "), steps, message: `Resolved ${params.host} to ${addresses.length} address(es)` };
          } catch (e: any) {
            return { success: false, result: "", steps, message: `DNS lookup failed: ${e.message}` };
          }
        }

        case "reverse_dns": {
          if (!params.host) return { success: false, result: "", steps, message: "Provide IP for reverse DNS" };
          try {
            const { promises: dnsPromises } = await import("dns");
            const hostnames = await dnsPromises.reverse(params.host);
            steps.push(`Reverse DNS for ${params.host}:`);
            for (const h of hostnames) {
              steps.push(`  ${h}`);
            }
            return { success: true, result: hostnames.join(", "), steps, message: `Reverse DNS: ${hostnames.join(", ")}` };
          } catch (e: any) {
            return { success: false, result: "", steps, message: `Reverse DNS failed: ${e.message}` };
          }
        }

        case "port_check": {
          if (!params.host || params.port === undefined) return { success: false, result: "", steps, message: "Provide host and port" };
          try {
            const net = await import("net");
            const isOpen = await new Promise<boolean>((resolve) => {
              const socket = new net.Socket();
              socket.setTimeout(params.timeout_ms);
              socket.once("connect", () => { socket.destroy(); resolve(true); });
              socket.once("timeout", () => { socket.destroy(); resolve(false); });
              socket.once("error", () => { socket.destroy(); resolve(false); });
              socket.connect(params.port!, params.host!);
            });
            steps.push(`Port check: ${params.host}:${params.port}`);
            steps.push(`  Status: ${isOpen ? "OPEN" : "CLOSED/FILTERED"}`);
            return { success: true, result: isOpen ? "open" : "closed", steps, message: `Port ${params.port} on ${params.host} is ${isOpen ? "open" : "closed"}` };
          } catch (e: any) {
            return { success: false, result: "", steps, message: `Port check failed: ${e.message}` };
          }
        }

        case "interfaces": {
          const interfaces = os.networkInterfaces();
          steps.push(`Network Interfaces:`);
          for (const [name, addrs] of Object.entries(interfaces)) {
            if (!addrs) continue;
            steps.push(`  ${name}:`);
            for (const addr of addrs) {
              steps.push(`    ${addr.family} ${addr.address} ${addr.internal ? "(internal)" : ""}`);
            }
          }
          return { success: true, result: steps.join("\n"), steps, message: `${Object.keys(interfaces).length} network interfaces` };
        }

        case "public_ip": {
          try {
            const output = execSync('powershell -Command "(Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content"', { encoding: "utf8", timeout: params.timeout_ms + 5000 });
            const ip = output.trim();
            steps.push(`Public IP: ${ip}`);
            return { success: true, result: ip, steps, message: `Public IP: ${ip}` };
          } catch {
            try {
              const output = execSync('curl -s https://api.ipify.org', { encoding: "utf8", timeout: params.timeout_ms + 5000 });
              const ip = output.trim();
              steps.push(`Public IP: ${ip}`);
              return { success: true, result: ip, steps, message: `Public IP: ${ip}` };
            } catch (e: any) {
              return { success: false, result: "", steps, message: `Failed to get public IP: ${e.message}` };
            }
          }
        }

        default:
          return { success: false, result: "", steps, message: "Unknown operation" };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// SYS CRON — cron expression parsing and next run calculation
// =============================================================================

export const sysCron: ToolDef = {
  name: "sys.cron",
  description: "Parse and analyze cron expressions: validate a cron schedule, calculate next N run times, explain what a cron expression means in human-readable form, and convert simple intervals to cron format. Supports standard 5-field cron (minute hour day-of-month month day-of-week).",
  inputSchema: z.object({
    operation: z.enum(["parse", "next_runs", "explain", "from_interval"]).describe("Cron operation"),
    expression: z.string().optional().describe("Cron expression (5 fields: min hour dom month dow)"),
    count: z.number().default(5).describe("Number of next runs to calculate"),
    from_date: z.string().optional().describe("Start date for next runs (ISO format, default: now)"),
    interval_minutes: z.number().optional().describe("Interval in minutes (for from_interval)"),
    interval_hours: z.number().optional().describe("Interval in hours (for from_interval)"),
    interval_days: z.number().optional().describe("Interval in days (for from_interval)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    valid: z.boolean().optional(),
    next_runs: z.array(z.string()).optional(),
    explanation: z.string().optional(),
    cron_expression: z.string().optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      const parseCronField = (field: string, min: number, max: number): number[] | null => {
        if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => min + i);
        const values: number[] = [];
        for (const part of field.split(",")) {
          if (part.includes("/")) {
            const [range, stepStr] = part.split("/");
            const step = parseInt(stepStr || "1");
            if (isNaN(step) || step < 1) return null;
            let start = min;
            let end = max;
            if (range !== "*") {
              if (range!.includes("-")) {
                const [s, e] = range!.split("-");
                start = parseInt(s || "0");
                end = parseInt(e || "0");
              } else {
                start = parseInt(range || "0");
              }
            }
            for (let i = start; i <= end; i += step) {
              if (i >= min && i <= max) values.push(i);
            }
          } else if (part.includes("-")) {
            const [s, e] = part.split("-");
            const start = parseInt(s || "0");
            const end = parseInt(e || "0");
            for (let i = start; i <= end; i++) {
              if (i >= min && i <= max) values.push(i);
            }
          } else {
            const v = parseInt(part);
            if (isNaN(v) || v < min || v > max) return null;
            values.push(v);
          }
        }
        return values.length > 0 ? values : null;
      };

      switch (params.operation) {
        case "parse":
        case "next_runs":
        case "explain": {
          if (!params.expression) return { success: false, result: "", steps, message: "Provide cron expression" };
          const fields = params.expression.trim().split(/\s+/);
          if (fields.length !== 5) {
            return { success: false, result: "", valid: false, steps, message: "Cron expression must have 5 fields: minute hour day-of-month month day-of-week" };
          }

          const minutes = parseCronField(fields[0]!, 0, 59);
          const hours = parseCronField(fields[1]!, 0, 23);
          const daysOfMonth = parseCronField(fields[2]!, 1, 31);
          const months = parseCronField(fields[3]!, 1, 12);
          const daysOfWeek = parseCronField(fields[4]!, 0, 6);

          if (!minutes || !hours || !daysOfMonth || !months || !daysOfWeek) {
            return { success: false, result: "", valid: false, steps, message: "Invalid cron expression — check field ranges" };
          }

          const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

          // Explain
          const explainParts: string[] = [];
          explainParts.push(`Minute: ${fields[0] === "*" ? "every minute" : minutes.join(", ")}`);
          explainParts.push(`Hour: ${fields[1] === "*" ? "every hour" : hours.join(", ")}`);
          explainParts.push(`Day of month: ${fields[2] === "*" ? "every day" : daysOfMonth.join(", ")}`);
          explainParts.push(`Month: ${fields[3] === "*" ? "every month" : months.map((m) => monthNames[m]).join(", ")}`);
          explainParts.push(`Day of week: ${fields[4] === "*" ? "every day" : daysOfWeek.map((d) => dowNames[d]).join(", ")}`);

          const explanation = `Runs at: ${explainParts.join("; ")}`;
          steps.push(`Cron expression: ${params.expression}`);
          steps.push(explanation);

          if (params.operation === "explain") {
            return { success: true, result: explanation, valid: true, explanation, steps, message: explanation };
          }

          // Calculate next runs
          const nextRuns: string[] = [];
          let currentDate = params.from_date ? new Date(params.from_date) : new Date();
          currentDate.setSeconds(0, 0);
          currentDate.setMinutes(currentDate.getMinutes() + 1); // Start from next minute

          const maxIterations = 500000; // Safety limit
          let iterations = 0;

          while (nextRuns.length < params.count && iterations < maxIterations) {
            iterations++;
            const min = currentDate.getMinutes();
            const hour = currentDate.getHours();
            const dom = currentDate.getDate();
            const month = currentDate.getMonth() + 1;
            const dow = currentDate.getDay();

            if (
              minutes.includes(min) &&
              hours.includes(hour) &&
              daysOfMonth.includes(dom) &&
              months.includes(month) &&
              daysOfWeek.includes(dow)
            ) {
              nextRuns.push(currentDate.toISOString());
            }
            currentDate = new Date(currentDate.getTime() + 60000); // Add 1 minute
          }

          steps.push(`Next ${nextRuns.length} runs:`);
          for (const run of nextRuns) {
            steps.push(`  ${new Date(run).toLocaleString()}`);
          }

          return {
            success: true,
            result: nextRuns.join("\n"),
            valid: true,
            next_runs: nextRuns,
            explanation,
            steps,
            message: `Next run: ${nextRuns.length > 0 ? new Date(nextRuns[0]!).toLocaleString() : "could not calculate"}`,
          };
        }

        case "from_interval": {
          const mins = params.interval_minutes ?? 0;
          const hours = params.interval_hours ?? 0;
          const days = params.interval_days ?? 0;

          if (mins === 0 && hours === 0 && days === 0) {
            return { success: false, result: "", steps, message: "Provide at least one interval (minutes, hours, or days)" };
          }

          let cronExpr: string;
          if (days > 0 && hours === 0 && mins === 0) {
            cronExpr = `0 0 */${days} * *`;
          } else if (hours > 0 && mins === 0) {
            cronExpr = `0 */${hours} * * *`;
          } else if (mins > 0 && hours === 0 && days === 0) {
            cronExpr = `*/${mins} * * * *`;
          } else {
            // Combined — use base + step
            const minPart = mins > 0 ? `*/${mins}` : "0";
            const hourPart = hours > 0 ? `*/${hours}` : "*";
            const dayPart = days > 0 ? `*/${days}` : "*";
            cronExpr = `${minPart} ${hourPart} ${dayPart} * *`;
          }

          steps.push(`Interval: ${mins}m ${hours}h ${days}d`);
          steps.push(`Cron expression: ${cronExpr}`);

          return {
            success: true,
            result: cronExpr,
            cron_expression: cronExpr,
            steps,
            message: `Cron: ${cronExpr}`,
          };
        }

        default:
          return { success: false, result: "", steps, message: "Unknown operation" };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};
