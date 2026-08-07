/**
 * Built-in starter skills — ship with the tray agent so users have immediate
 * value without installing anything from the marketplace.
 *
 * M2 starter set:
 *   1. daily-summary — morning digest of what happened (git commits, tasks, messages)
 *   2. code-watcher — watches for file changes and can trigger agent tasks
 *   3. reminder — simple reminder system via messaging integrations
 *   4. git-monitor — monitors git repos for uncommitted changes and reminds
 *   5. cost-monitor — alerts when usage spending approaches limits
 */

import type { SkillManifest } from "./skills.js";

export const dailySummary: SkillManifest = {
  name: "daily-summary",
  version: "0.1.0",
  description: "Morning digest: summarizes git commits, agent tasks, and messages from the previous day.",
  author: "Cascade",
  permissions: ["git.read", "fs.read", "memory.read", "message.send"],
  heartbeats: [
    {
      id: "morning-digest",
      name: "Morning Digest",
      schedule: "0 9 * * *",
      scheduleType: "cron",
      action: "generateDigest",
    },
  ],
  configSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Where to send the digest (slack|email|console)" },
      repos: { type: "array", items: { type: "string" }, description: "Repo paths to summarize" },
    },
  },
  defaultConfig: { channel: "console", repos: [] },
};

export const codeWatcher: SkillManifest = {
  name: "code-watcher",
  version: "0.1.0",
  description: "Watches for file changes in configured directories and can trigger agent tasks on change.",
  author: "Cascade",
  permissions: ["fs.read", "fs.watch", "agent.start"],
  heartbeats: [
    {
      id: "watch-check",
      name: "Check for changes",
      schedule: "5",
      scheduleType: "interval",
      action: "checkChanges",
    },
  ],
  configSchema: {
    type: "object",
    properties: {
      paths: { type: "array", items: { type: "string" } },
      autoTask: { type: "boolean", description: "Automatically start an agent task on change" },
    },
  },
  defaultConfig: { paths: [], autoTask: false },
};

export const reminder: SkillManifest = {
  name: "reminder",
  version: "0.1.0",
  description: "Simple reminder system. Set reminders via chat/message and get notified at the scheduled time.",
  author: "Cascade",
  permissions: ["memory.read", "memory.write", "message.send"],
  heartbeats: [
    {
      id: "reminder-check",
      name: "Check reminders",
      schedule: "1",
      scheduleType: "interval",
      action: "checkReminders",
    },
  ],
  configSchema: {
    type: "object",
    properties: {
      notifyChannel: { type: "string", description: "Where to send reminders (slack|email|sms|console)" },
    },
  },
  defaultConfig: { notifyChannel: "console" },
};

export const gitMonitor: SkillManifest = {
  name: "git-monitor",
  version: "0.1.0",
  description: "Monitors git repos for uncommitted changes and reminds you to commit.",
  author: "Cascade",
  permissions: ["git.read", "message.send"],
  heartbeats: [
    {
      id: "git-check",
      name: "Check git status",
      schedule: "30",
      scheduleType: "interval",
      action: "checkGitStatus",
    },
  ],
  configSchema: {
    type: "object",
    properties: {
      repos: { type: "array", items: { type: "string" } },
      notifyChannel: { type: "string" },
    },
  },
  defaultConfig: { repos: [], notifyChannel: "console" },
};

export const costMonitor: SkillManifest = {
  name: "cost-monitor",
  version: "0.1.0",
  description: "Alerts when your Cascade usage spending approaches plan limits.",
  author: "Cascade",
  permissions: ["usage.read", "message.send"],
  heartbeats: [
    {
      id: "cost-check",
      name: "Check spending",
      schedule: "0 */6 * * *",
      scheduleType: "cron",
      action: "checkSpending",
    },
  ],
  configSchema: {
    type: "object",
    properties: {
      alertThreshold: { type: "number", description: "Alert at this % of cap (default 80)" },
      notifyChannel: { type: "string" },
    },
  },
  defaultConfig: { alertThreshold: 80, notifyChannel: "console" },
};

export const BUILTIN_SKILLS: SkillManifest[] = [
  dailySummary,
  codeWatcher,
  reminder,
  gitMonitor,
  costMonitor,
];
