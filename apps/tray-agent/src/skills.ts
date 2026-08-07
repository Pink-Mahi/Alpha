/**
 * Skills system — declarative skill packages with permission grants.
 *
 * A skill is a bundle of:
 * - A manifest (name, version, description, permissions needed)
 * - Tool definitions (what tools the skill provides)
 * - Heartbeat schedules (proactive actions the skill registers)
 * - Configuration schema
 *
 * Skills are installed per-org with explicit permission grants. The user
 * approves each new capability. Skills are sandboxed: they can only use
 * the tools they declare, and only with the permissions they're granted.
 */

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  /** Permissions this skill requires. User must approve at install time. */
  permissions: string[];
  /** Tools this skill provides (names). */
  tools?: string[];
  /** Heartbeat schedules this skill registers. */
  heartbeats?: SkillHeartbeat[];
  /** Configuration schema (JSON Schema). */
  configSchema?: Record<string, unknown>;
  /** Default configuration. */
  defaultConfig?: Record<string, unknown>;
}

export interface SkillHeartbeat {
  id: string;
  name: string;
  schedule: string;
  scheduleType: "cron" | "interval";
  /** Action to execute (a function name in the skill module). */
  action: string;
}

export interface InstalledSkill {
  id: string;
  manifest: SkillManifest;
  grantedPermissions: string[];
  config: Record<string, unknown>;
  installedAt: Date;
  enabled: boolean;
}

export class SkillRegistry {
  private installed = new Map<string, InstalledSkill>();
  private available = new Map<string, SkillManifest>();

  /** Register an available skill (from marketplace or built-in). */
  registerAvailable(manifest: SkillManifest): void {
    this.available.set(`${manifest.name}@${manifest.version}`, manifest);
  }

  listAvailable(): SkillManifest[] {
    return [...this.available.values()];
  }

  /** Install a skill with explicit permission grants. */
  install(
    manifest: SkillManifest,
    grantedPermissions: string[],
    config?: Record<string, unknown>,
  ): InstalledSkill {
    // Verify all required permissions are granted.
    const ungranted = manifest.permissions.filter((p) => !grantedPermissions.includes(p));
    if (ungranted.length > 0) {
      throw new Error(`ungranted permissions: ${ungranted.join(", ")}`);
    }

    const skill: InstalledSkill = {
      id: `${manifest.name}@${manifest.version}`,
      manifest,
      grantedPermissions,
      config: config ?? manifest.defaultConfig ?? {},
      installedAt: new Date(),
      enabled: true,
    };
    this.installed.set(skill.id, skill);
    return skill;
  }

  uninstall(id: string): void {
    this.installed.delete(id);
  }

  enable(id: string): void {
    const s = this.installed.get(id);
    if (s) s.enabled = true;
  }

  disable(id: string): void {
    const s = this.installed.get(id);
    if (s) s.enabled = false;
  }

  listInstalled(): InstalledSkill[] {
    return [...this.installed.values()];
  }

  getInstalled(id: string): InstalledSkill | undefined {
    return this.installed.get(id);
  }

  /** Get all heartbeats from installed + enabled skills. */
  getHeartbeats(): Array<{ skillId: string; heartbeat: SkillHeartbeat }> {
    const result: Array<{ skillId: string; heartbeat: SkillHeartbeat }> = [];
    for (const skill of this.installed.values()) {
      if (!skill.enabled) continue;
      for (const hb of skill.manifest.heartbeats ?? []) {
        result.push({ skillId: skill.id, heartbeat: hb });
      }
    }
    return result;
  }
}
