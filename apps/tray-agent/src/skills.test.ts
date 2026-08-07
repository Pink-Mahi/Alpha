import { describe, it, expect, beforeEach } from "bun:test";
import { SkillRegistry, type SkillManifest } from "./skills.js";

const testManifest: SkillManifest = {
  name: "test-skill",
  version: "1.0.0",
  description: "A test skill",
  permissions: ["fs.read", "fs.write"],
  tools: ["test.tool"],
  heartbeats: [
    { id: "hb1", name: "HB1", schedule: "5", scheduleType: "interval", action: "doThing" },
  ],
  defaultConfig: { setting: true },
};

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it("registers an available skill", () => {
    registry.registerAvailable(testManifest);
    expect(registry.listAvailable().length).toBe(1);
    expect(registry.listAvailable()[0]!.name).toBe("test-skill");
  });

  it("installs a skill with granted permissions", () => {
    registry.registerAvailable(testManifest);
    const skill = registry.install(testManifest, ["fs.read", "fs.write"]);
    expect(skill.id).toBe("test-skill@1.0.0");
    expect(skill.enabled).toBe(true);
  });

  it("throws when installing without all required permissions", () => {
    registry.registerAvailable(testManifest);
    expect(() => registry.install(testManifest, ["fs.read"])).toThrow("ungranted permissions: fs.write");
  });

  it("lists installed skills", () => {
    registry.registerAvailable(testManifest);
    registry.install(testManifest, ["fs.read", "fs.write"]);
    expect(registry.listInstalled().length).toBe(1);
  });

  it("uninstalls a skill", () => {
    registry.registerAvailable(testManifest);
    registry.install(testManifest, ["fs.read", "fs.write"]);
    registry.uninstall("test-skill@1.0.0");
    expect(registry.listInstalled().length).toBe(0);
  });

  it("enables and disables a skill", () => {
    registry.registerAvailable(testManifest);
    registry.install(testManifest, ["fs.read", "fs.write"]);
    registry.disable("test-skill@1.0.0");
    expect(registry.getInstalled("test-skill@1.0.0")!.enabled).toBe(false);
    registry.enable("test-skill@1.0.0");
    expect(registry.getInstalled("test-skill@1.0.0")!.enabled).toBe(true);
  });

  it("gets heartbeats from enabled skills only", () => {
    registry.registerAvailable(testManifest);
    registry.install(testManifest, ["fs.read", "fs.write"]);
    expect(registry.getHeartbeats().length).toBe(1);
    registry.disable("test-skill@1.0.0");
    expect(registry.getHeartbeats().length).toBe(0);
  });

  it("uses default config when no config provided", () => {
    registry.registerAvailable(testManifest);
    const skill = registry.install(testManifest, ["fs.read", "fs.write"]);
    expect(skill.config).toEqual({ setting: true });
  });
});
