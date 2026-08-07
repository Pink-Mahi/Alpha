/**
 * Marketplace submission + review + revenue share.
 *
 * Extends the curated catalog with:
 * - Open submission: any org can submit a skill
 * - Review pipeline: submitted → in_review → approved/rejected
 * - Revenue share: 70% to skill author, 30% to ALPHA (per ADR-0009)
 * - Install tracking: counts + revenue per install
 *
 * M3: submission + review. Revenue share accounting (actual payouts via
 * Stripe Connect) lands in M4.
 */

import { randomUUID } from "node:crypto";

export type SubmissionStatus = "submitted" | "in_review" | "approved" | "rejected" | "published";

export interface SkillSubmission {
  id: string;
  orgId: string;
  submitterId: string;
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
  status: SubmissionStatus;
  category: string;
  tags: string[];
  readme: string;
  /** Pricing: 0 = free, >0 = monthly price in USD. */
  priceMonthly: number;
  /** Revenue share: 70% author, 30% ALPHA. */
  revenueShareAuthor: number; // 0.7
  /** Review notes (set by reviewer). */
  reviewNotes?: string;
  /** Reviewer ID. */
  reviewerId?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  publishedAt?: Date;
  installCount: number;
  totalRevenue: number;
}

/** In-memory submission store (M3; persisted to DB in M4). */
const submissions = new Map<string, SkillSubmission>();

export class SubmissionManager {
  submit(opts: {
    orgId: string;
    submitterId: string;
    manifest: SkillSubmission["manifest"];
    category: string;
    tags: string[];
    readme: string;
    priceMonthly: number;
  }): SkillSubmission {
    const sub: SkillSubmission = {
      id: randomUUID(),
      orgId: opts.orgId,
      submitterId: opts.submitterId,
      manifest: opts.manifest,
      status: "submitted",
      category: opts.category,
      tags: opts.tags,
      readme: opts.readme,
      priceMonthly: opts.priceMonthly,
      revenueShareAuthor: 0.7,
      submittedAt: new Date(),
      installCount: 0,
      totalRevenue: 0,
    };
    submissions.set(sub.id, sub);
    return sub;
  }

  /** Start review (admin only). */
  startReview(submissionId: string, reviewerId: string): SkillSubmission | null {
    const sub = submissions.get(submissionId);
    if (!sub || sub.status !== "submitted") return null;
    sub.status = "in_review";
    sub.reviewerId = reviewerId;
    return sub;
  }

  /** Approve and publish a submission (admin only). */
  approve(submissionId: string, reviewerId: string, notes: string): SkillSubmission | null {
    const sub = submissions.get(submissionId);
    if (!sub || sub.status !== "in_review") return null;
    sub.status = "published";
    sub.reviewNotes = notes;
    sub.reviewerId = reviewerId;
    sub.reviewedAt = new Date();
    sub.publishedAt = new Date();
    return sub;
  }

  /** Reject a submission (admin only). */
  reject(submissionId: string, reviewerId: string, notes: string): SkillSubmission | null {
    const sub = submissions.get(submissionId);
    if (!sub) return null;
    sub.status = "rejected";
    sub.reviewNotes = notes;
    sub.reviewerId = reviewerId;
    sub.reviewedAt = new Date();
    return sub;
  }

  /** Record an install (called when a user installs a published skill). */
  recordInstall(submissionId: string): void {
    const sub = submissions.get(submissionId);
    if (!sub || sub.status !== "published") return;
    sub.installCount++;
    if (sub.priceMonthly > 0) {
      sub.totalRevenue += sub.priceMonthly;
    }
  }

  /** Get a submission by ID. */
  get(submissionId: string): SkillSubmission | undefined {
    return submissions.get(submissionId);
  }

  /** List submissions with optional status filter. */
  list(status?: SubmissionStatus): SkillSubmission[] {
    const all = [...submissions.values()];
    return status ? all.filter((s) => s.status === status) : all;
  }

  /** List published skills (the open marketplace). */
  listPublished(): SkillSubmission[] {
    return this.list("published");
  }

  /** Get revenue stats for an author (across all their submissions). */
  getAuthorStats(submitterId: string): {
    totalRevenue: number;
    authorRevenue: number;
    ALPHARevenue: number;
    totalInstalls: number;
    submissionCount: number;
  } {
    const authorSubs = [...submissions.values()].filter((s) => s.submitterId === submitterId);
    const totalRevenue = authorSubs.reduce((sum, s) => sum + s.totalRevenue, 0);
    return {
      totalRevenue,
      authorRevenue: totalRevenue * 0.7,
      ALPHARevenue: totalRevenue * 0.3,
      totalInstalls: authorSubs.reduce((sum, s) => sum + s.installCount, 0),
      submissionCount: authorSubs.length,
    };
  }
}
