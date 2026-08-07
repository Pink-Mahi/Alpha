import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HeartbeatScheduler } from "./heartbeat.js";

describe("HeartbeatScheduler", () => {
  let scheduler: HeartbeatScheduler;

  beforeEach(() => {
    scheduler = new HeartbeatScheduler();
  });

  afterEach(() => {
    scheduler.stopAll();
  });

  it("registers a heartbeat", () => {
    scheduler.register({
      id: "test-1",
      name: "Test",
      schedule: "5",
      scheduleType: "interval",
      enabled: true,
      execute: async () => {},
    });
    expect(scheduler.list().length).toBe(1);
    expect(scheduler.list()[0]!.id).toBe("test-1");
  });

  it("throws on duplicate registration", () => {
    expect(() => {
      scheduler.register({
        id: "dup", name: "Dup", schedule: "1", scheduleType: "interval", enabled: true, execute: async () => {},
      });
      scheduler.register({
        id: "dup", name: "Dup", schedule: "1", scheduleType: "interval", enabled: true, execute: async () => {},
      });
    }).toThrow("already registered");
  });

  it("unregisters a heartbeat", () => {
    scheduler.register({
      id: "test-2", name: "Test", schedule: "1", scheduleType: "interval", enabled: true, execute: async () => {},
    });
    scheduler.unregister("test-2");
    expect(scheduler.list().length).toBe(0);
  });

  it("disables and enables a heartbeat", () => {
    scheduler.register({
      id: "test-3", name: "Test", schedule: "1", scheduleType: "interval", enabled: true, execute: async () => {},
    });
    scheduler.disable("test-3");
    expect(scheduler.list()[0]!.enabled).toBe(false);
    scheduler.enable("test-3");
    expect(scheduler.list()[0]!.enabled).toBe(true);
  });

  it("stopAll clears all timers", () => {
    scheduler.register({
      id: "a", name: "A", schedule: "1", scheduleType: "interval", enabled: true, execute: async () => {},
    });
    scheduler.register({
      id: "b", name: "B", schedule: "1", scheduleType: "interval", enabled: true, execute: async () => {},
    });
    scheduler.stopAll();
    expect(scheduler.list().length).toBe(2); // still registered, just stopped
  });
});
