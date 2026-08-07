/**
 * Skills marketplace — curated catalog of reviewed skills.
 *
 * M2: static curated catalog (built-in + reviewed third-party skills).
 * M3: open submission + review pipeline + revenue share.
 *
 * Each marketplace listing includes:
 * - The skill manifest
 * - Curator review status (verified, reviewed, experimental)
 * - Install count
 * - Rating
 * - Category tags
 */

export type ReviewStatus = "verified" | "reviewed" | "experimental";

export interface MarketplaceListing {
  id: string;
  manifest: {
    name: string;
    version: string;
    description: string;
    author: string;
    permissions: string[];
    tools?: string[];
    heartbeats?: Array<{ id: string; name: string; schedule: string; scheduleType: "cron" | "interval"; action: string }>;
    configSchema?: Record<string, unknown>;
    defaultConfig?: Record<string, unknown>;
  };
  review: ReviewStatus;
  category: string;
  tags: string[];
  installCount: number;
  rating: number; // 0-5
  readme: string;
}

/** Curated marketplace listings for M2 launch. */
export const CURATED_LISTINGS: MarketplaceListing[] = [
  {
    id: "daily-summary",
    manifest: {
      name: "daily-summary",
      version: "0.1.0",
      description: "Morning digest: summarizes git commits, agent tasks, and messages from the previous day.",
      author: "ALPHA",
      permissions: ["git.read", "fs.read", "memory.read", "message.send"],
      heartbeats: [{ id: "morning-digest", name: "Morning Digest", schedule: "0 9 * * *", scheduleType: "cron", action: "generateDigest" }],
      defaultConfig: { channel: "console", repos: [] },
    },
    review: "verified",
    category: "productivity",
    tags: ["digest", "summary", "morning", "git"],
    installCount: 0,
    rating: 5.0,
    readme: "Every morning at 9am, get a summary of what happened across your repos and tasks the previous day. Configure which repos to track and which messaging channel to deliver to.",
  },
  {
    id: "code-watcher",
    manifest: {
      name: "code-watcher",
      version: "0.1.0",
      description: "Watches for file changes and can trigger agent tasks automatically.",
      author: "ALPHA",
      permissions: ["fs.read", "fs.watch", "agent.start"],
      heartbeats: [{ id: "watch-check", name: "Check for changes", schedule: "5", scheduleType: "interval", action: "checkChanges" }],
      defaultConfig: { paths: [], autoTask: false },
    },
    review: "verified",
    category: "development",
    tags: ["watch", "files", "auto-task", "monitor"],
    installCount: 0,
    rating: 4.5,
    readme: "Monitors configured directories for file changes. When changes are detected, can optionally start an agent task to review or fix issues. Great for keeping tests green.",
  },
  {
    id: "reminder",
    manifest: {
      name: "reminder",
      version: "0.1.0",
      description: "Set reminders via chat and get notified at the scheduled time.",
      author: "ALPHA",
      permissions: ["memory.read", "memory.write", "message.send"],
      heartbeats: [{ id: "reminder-check", name: "Check reminders", schedule: "1", scheduleType: "interval", action: "checkReminders" }],
      defaultConfig: { notifyChannel: "console" },
    },
    review: "verified",
    category: "productivity",
    tags: ["reminder", "notification", "schedule"],
    installCount: 0,
    rating: 4.8,
    readme: "Simple reminder system. Tell your agent 'remind me to check the build in 30 minutes' and it'll notify you via your configured channel.",
  },
  {
    id: "git-monitor",
    manifest: {
      name: "git-monitor",
      version: "0.1.0",
      description: "Monitors git repos for uncommitted changes and reminds you to commit.",
      author: "ALPHA",
      permissions: ["git.read", "message.send"],
      heartbeats: [{ id: "git-check", name: "Check git status", schedule: "30", scheduleType: "interval", action: "checkGitStatus" }],
      defaultConfig: { repos: [], notifyChannel: "console" },
    },
    review: "verified",
    category: "development",
    tags: ["git", "commit", "reminder", "clean-working-tree"],
    installCount: 0,
    rating: 4.2,
    readme: "Checks your configured repos every 30 minutes for uncommitted changes. Sends a reminder if you have work that hasn't been committed yet.",
  },
  {
    id: "cost-monitor",
    manifest: {
      name: "cost-monitor",
      version: "0.1.0",
      description: "Alerts when your ALPHA usage spending approaches plan limits.",
      author: "ALPHA",
      permissions: ["usage.read", "message.send"],
      heartbeats: [{ id: "cost-check", name: "Check spending", schedule: "0 */6 * * *", scheduleType: "cron", action: "checkSpending" }],
      defaultConfig: { alertThreshold: 80, notifyChannel: "console" },
    },
    review: "verified",
    category: "billing",
    tags: ["cost", "alert", "budget", "spending"],
    installCount: 0,
    rating: 4.7,
    readme: "Every 6 hours, checks your ALPHA spending against your plan cap. Alerts you at 80% (configurable) so you're never surprised by overages.",
  },
  {
    id: "standup-bot",
    manifest: {
      name: "standup-bot",
      version: "0.1.0",
      description: "Collects and posts daily standup updates from team members via Slack.",
      author: "ALPHA",
      permissions: ["message.send", "message.receive", "memory.read", "memory.write"],
      heartbeats: [
        { id: "standup-prompt", name: "Prompt team", schedule: "0 9 * * 1-5", scheduleType: "cron", action: "promptTeam" },
        { id: "standup-post", name: "Post summary", schedule: "0 10 * * 1-5", scheduleType: "cron", action: "postSummary" },
      ],
      defaultConfig: { slackChannel: "#standup", teamMembers: [] },
    },
    review: "reviewed",
    category: "team",
    tags: ["standup", "slack", "team", "daily"],
    installCount: 0,
    rating: 4.3,
    readme: "At 9am on weekdays, DMs each team member for their standup update. At 10am, posts a compiled summary to the team's standup channel.",
  },
  {
    id: "pr-reviewer",
    manifest: {
      name: "pr-reviewer",
      version: "0.1.0",
      description: "Automatically reviews new PRs in your repos and posts comments.",
      author: "ALPHA",
      permissions: ["git.read", "fs.read", "agent.start", "message.send"],
      heartbeats: [{ id: "pr-check", name: "Check for new PRs", schedule: "10", scheduleType: "interval", action: "checkNewPRs" }],
      defaultConfig: { repos: [], autoComment: true },
    },
    review: "reviewed",
    category: "development",
    tags: ["pr", "review", "code-review", "github"],
    installCount: 0,
    rating: 4.6,
    readme: "Polls for new pull requests every 10 minutes. When a new PR is found, starts an agent task to review the code and posts comments with suggestions.",
  },
  {
    id: "meeting-notes",
    manifest: {
      name: "meeting-notes",
      version: "0.1.0",
      description: "Summarizes meeting transcripts and extracts action items.",
      author: "ALPHA",
      permissions: ["memory.read", "memory.write", "message.send"],
      heartbeats: [],
      defaultConfig: { notifyChannel: "console" },
    },
    review: "experimental",
    category: "productivity",
    tags: ["meeting", "notes", "transcript", "action-items"],
    installCount: 0,
    rating: 4.0,
    readme: "Paste a meeting transcript and get a structured summary with action items, owners, and deadlines. Saves to memory for future reference.",
  },
];
