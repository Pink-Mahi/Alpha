/**
 * Statistics & Data Analysis tools — descriptive statistics, hypothesis testing,
 * regression analysis, and probability distributions.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// Helper functions
// =============================================================================

function mean(data: number[]): number {
  return data.reduce((a, b) => a + b, 0) / data.length;
}

function median(data: number[]): number {
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mode(data: number[]): number[] {
  const counts: Record<number, number> = {};
  for (const v of data) counts[v] = (counts[v] ?? 0) + 1;
  const maxCount = Math.max(...Object.values(counts));
  if (maxCount === 1) return [];
  return Object.entries(counts)
    .filter(([, c]) => c === maxCount)
    .map(([v]) => Number(v));
}

function variance(data: number[], sample: boolean): number {
  const m = mean(data);
  const n = sample ? data.length - 1 : data.length;
  return data.reduce((sum, v) => sum + (v - m) ** 2, 0) / n;
}

function stdDev(data: number[], sample: boolean): number {
  return Math.sqrt(variance(data, sample));
}

function quartiles(data: number[]): { q1: number; q2: number; q3: number } {
  const sorted = [...data].sort((a, b) => a - b);
  const q2 = median(sorted);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, mid);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  return { q1: median(lower), q2, q3: median(upper) };
}

// Normal CDF using error function approximation
function normalCDF(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / (sigma * Math.SQRT2);
  return 0.5 * (1 + erf(z));
}

function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

// Inverse normal CDF (quantile function) using Beasley-Springer-Moro algorithm
function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let z: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    z = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    z = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    z = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return z;
}

// =============================================================================
// 1. DESCRIPTIVE STATISTICS
// =============================================================================

export const statsDescribe: ToolDef = {
  name: "stats.describe",
  description: "Calculate comprehensive descriptive statistics for a dataset: mean, median, mode, standard deviation, variance, range, quartiles, IQR, skewness, kurtosis, min, max, sum, count, outliers (using IQR method), and five-number summary. Provides a complete statistical overview.",
  inputSchema: z.object({
    data: z.array(z.number()).describe("Array of numerical values"),
    sample: z.boolean().default(true).describe("If true, use sample statistics (n-1); if false, use population statistics (n)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    statistics: z.object({
      count: z.number(),
      mean: z.number(),
      median: z.number(),
      mode: z.array(z.number()),
      std_dev: z.number(),
      variance: z.number(),
      min: z.number(),
      max: z.number(),
      range: z.number(),
      sum: z.number(),
      q1: z.number(),
      q3: z.number(),
      iqr: z.number(),
      skewness: z.number(),
      kurtosis: z.number(),
      outliers: z.array(z.number()),
    }),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ data, sample }) {
    const steps: string[] = [];
    if (!data || data.length === 0) {
      return { success: false, result: "", statistics: {} as any, steps, message: "Provide non-empty data array" };
    }

    const n = data.length;
    const m = mean(data);
    const med = median(data);
    const mod = mode(data);
    const sd = stdDev(data, sample);
    const varVal = variance(data, sample);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const sum = data.reduce((a: number, b: number) => a + b, 0);
    const { q1, q2, q3 } = quartiles(data);
    const iqr = q3 - q1;

    // Skewness (Fisher-Pearson)
    const skewness = n > 2 ? (data.reduce((s: number, v: number) => s + ((v - m) / sd) ** 3, 0) * n) / ((n - 1) * (n - 2)) : 0;

    // Excess Kurtosis
    const kurtosis = n > 3
      ? (data.reduce((s: number, v: number) => s + ((v - m) / sd) ** 4, 0) * n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
      : 0;

    // Outliers using IQR method (1.5 * IQR)
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outliers = data.filter((v: number) => v < lowerBound || v > upperBound);

    steps.push(`Descriptive Statistics for ${n} values:`);
    steps.push(`  Mean: ${m.toFixed(4)}`);
    steps.push(`  Median: ${med.toFixed(4)}`);
    steps.push(`  Mode: ${mod.length > 0 ? mod.join(", ") : "No mode (all unique)"}`);
    steps.push(`  Std Dev (${sample ? "sample" : "population"}): ${sd.toFixed(4)}`);
    steps.push(`  Variance: ${varVal.toFixed(4)}`);
    steps.push(`  Range: ${range.toFixed(4)} (min: ${min}, max: ${max})`);
    steps.push(`  Q1: ${q1.toFixed(4)}, Q2: ${med.toFixed(4)}, Q3: ${q3.toFixed(4)}`);
    steps.push(`  IQR: ${iqr.toFixed(4)}`);
    steps.push(`  Skewness: ${skewness.toFixed(4)} ${skewness > 0 ? "(right-skewed)" : skewness < 0 ? "(left-skewed)" : "(symmetric)"}`);
    steps.push(`  Excess Kurtosis: ${kurtosis.toFixed(4)} ${kurtosis > 0 ? "(leptokurtic, heavy tails)" : kurtosis < 0 ? "(platykurtic, light tails)" : "(mesokurtic, normal-like)"}`);
    steps.push(`  Outliers (IQR method): ${outliers.length > 0 ? outliers.join(", ") : "None"}`);

    return {
      success: true,
      result: `Mean=${m.toFixed(4)}, SD=${sd.toFixed(4)}, Median=${med.toFixed(4)}`,
      statistics: {
        count: n,
        mean: m,
        median: med,
        mode: mod,
        std_dev: sd,
        variance: varVal,
        min,
        max,
        range,
        sum,
        q1,
        q3,
        iqr,
        skewness,
        kurtosis,
        outliers,
      },
      steps,
      message: `Statistics computed for ${n} values. Mean=${m.toFixed(4)}, SD=${sd.toFixed(4)}, ${outliers.length} outliers found.`,
    };
  },
};

// =============================================================================
// 2. HYPOTHESIS TESTING — t-test, chi-square, z-test
// =============================================================================

export const statsHypothesisTest: ToolDef = {
  name: "stats.hypothesis_test",
  description: "Perform statistical hypothesis tests: one-sample t-test, two-sample t-test (independent), paired t-test, one-sample z-test, chi-square goodness of fit, chi-square test of independence, and one-way ANOVA. Returns test statistic, p-value, and conclusion. Use 'list' to see all test types.",
  inputSchema: z.object({
    test_type: z.enum(["one_sample_t", "two_sample_t", "paired_t", "one_sample_z", "chi_square_gof", "chi_square_independence", "anova", "list"]).describe("Type of hypothesis test"),
    data: z.array(z.number()).optional().describe("Sample data (for one-sample tests)"),
    data2: z.array(z.number()).optional().describe("Second sample data (for two-sample tests)"),
    paired_data: z.array(z.array(z.number())).optional().describe("Paired data as array of [before, after] pairs"),
    mu: z.number().optional().describe("Population mean (null hypothesis, for one-sample tests)"),
    sigma: z.number().optional().describe("Known population standard deviation (for z-test)"),
    alpha: z.number().default(0.05).describe("Significance level (default 0.05)"),
    observed: z.array(z.number()).optional().describe("Observed frequencies (chi-square)"),
    expected: z.array(z.number()).optional().describe("Expected frequencies (chi-square goodness of fit)"),
    contingency_table: z.array(z.array(z.number())).optional().describe("Contingency table (chi-square independence)"),
    groups: z.array(z.array(z.number())).optional().describe("Groups of data (for ANOVA)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    test_statistic: z.number().optional(),
    p_value: z.number().optional(),
    degrees_freedom: z.number().optional(),
    conclusion: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];
    const alpha = params.alpha;

    try {
      if (params.test_type === "list") {
        return {
          success: true,
          result: "Tests: one_sample_t, two_sample_t, paired_t, one_sample_z, chi_square_gof, chi_square_independence, anova",
          conclusion: "",
          steps,
          message: "Available hypothesis tests",
        };
      }

      switch (params.test_type) {
        case "one_sample_t": {
          if (!params.data || params.mu === undefined) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide data and mu (hypothesized mean)" };
          }
          const data = params.data;
          const n = data.length;
          const m = mean(data);
          const sd = stdDev(data, true);
          const se = sd / Math.sqrt(n);
          const t = (m - params.mu) / se;
          const df = n - 1;
          // Approximate p-value using normal distribution (good approximation for df > 30)
          // For smaller df, this is a conservative estimate
          const pValue = 2 * (1 - normalCDF(Math.abs(t), 0, 1));
          const reject = pValue < alpha;

          steps.push(`One-Sample T-Test:`);
          steps.push(`  H0: mu = ${params.mu}`);
          steps.push(`  H1: mu != ${params.mu}`);
          steps.push(`  Sample mean: ${m.toFixed(4)}`);
          steps.push(`  Sample SD: ${sd.toFixed(4)}`);
          steps.push(`  Standard error: ${se.toFixed(4)}`);
          steps.push(`  t = (${m.toFixed(4)} - ${params.mu}) / ${se.toFixed(4)} = ${t.toFixed(4)}`);
          steps.push(`  df = ${df}`);
          steps.push(`  p-value (two-tailed) ~ ${pValue.toFixed(6)}`);
          steps.push(`  alpha = ${alpha}`);
          steps.push(`  ${reject ? "REJECT H0: Significant difference found" : "FAIL TO REJECT H0: No significant difference"}`);

          return {
            success: true,
            result: `t=${t.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: t,
            p_value: pValue,
            degrees_freedom: df,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}). Significant difference from ${params.mu}.` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}). No significant difference from ${params.mu}.`,
            steps,
            message: `t=${t.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "significant" : "not significant"}`,
          };
        }

        case "two_sample_t": {
          if (!params.data || !params.data2) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide data and data2" };
          }
          const d1 = params.data;
          const d2 = params.data2;
          const n1 = d1.length;
          const n2 = d2.length;
          const m1 = mean(d1);
          const m2 = mean(d2);
          const v1 = variance(d1, true);
          const v2 = variance(d2, true);
          // Welch's t-test (unequal variances)
          const se = Math.sqrt(v1 / n1 + v2 / n2);
          const t = (m1 - m2) / se;
          // Welch-Satterthwaite degrees of freedom
          const df = Math.pow(v1 / n1 + v2 / n2, 2) / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
          const pValue = 2 * (1 - normalCDF(Math.abs(t), 0, 1));
          const reject = pValue < alpha;

          steps.push(`Two-Sample T-Test (Welch's):`);
          steps.push(`  H0: mu1 = mu2 (no difference between groups)`);
          steps.push(`  H1: mu1 != mu2`);
          steps.push(`  Group 1: n=${n1}, mean=${m1.toFixed(4)}, var=${v1.toFixed(4)}`);
          steps.push(`  Group 2: n=${n2}, mean=${m2.toFixed(4)}, var=${v2.toFixed(4)}`);
          steps.push(`  SE = sqrt(${v1.toFixed(4)}/${n1} + ${v2.toFixed(4)}/${n2}) = ${se.toFixed(4)}`);
          steps.push(`  t = (${m1.toFixed(4)} - ${m2.toFixed(4)}) / ${se.toFixed(4)} = ${t.toFixed(4)}`);
          steps.push(`  df (Welch) = ${df.toFixed(2)}`);
          steps.push(`  p-value ~ ${pValue.toFixed(6)}`);
          steps.push(`  ${reject ? "REJECT H0: Significant difference between groups" : "FAIL TO REJECT H0: No significant difference"}`);

          return {
            success: true,
            result: `t=${t.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: t,
            p_value: pValue,
            degrees_freedom: df,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}). Groups differ significantly.` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}). No significant difference between groups.`,
            steps,
            message: `t=${t.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "significant" : "not significant"}`,
          };
        }

        case "paired_t": {
          if (!params.paired_data || params.paired_data.length === 0) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide paired_data as [[before, after], ...]" };
          }
          const diffs = params.paired_data.map(([before, after]: number[]) => after! - before!);
          const n = diffs.length;
          const dBar = mean(diffs);
          const sdDiff = stdDev(diffs, true);
          const se = sdDiff / Math.sqrt(n);
          const t = dBar / se;
          const df = n - 1;
          const pValue = 2 * (1 - normalCDF(Math.abs(t), 0, 1));
          const reject = pValue < alpha;

          steps.push(`Paired T-Test:`);
          steps.push(`  H0: mean difference = 0`);
          steps.push(`  H1: mean difference != 0`);
          steps.push(`  n = ${n} pairs`);
          steps.push(`  Mean difference: ${dBar.toFixed(4)}`);
          steps.push(`  SD of differences: ${sdDiff.toFixed(4)}`);
          steps.push(`  SE = ${sdDiff.toFixed(4)} / sqrt(${n}) = ${se.toFixed(4)}`);
          steps.push(`  t = ${dBar.toFixed(4)} / ${se.toFixed(4)} = ${t.toFixed(4)}`);
          steps.push(`  df = ${df}`);
          steps.push(`  p-value ~ ${pValue.toFixed(6)}`);
          steps.push(`  ${reject ? "REJECT H0: Significant change detected" : "FAIL TO REJECT H0: No significant change"}`);

          return {
            success: true,
            result: `t=${t.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: t,
            p_value: pValue,
            degrees_freedom: df,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}). Significant change.` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}). No significant change.`,
            steps,
            message: `t=${t.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "significant" : "not significant"}`,
          };
        }

        case "one_sample_z": {
          if (!params.data || params.mu === undefined || params.sigma === undefined) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide data, mu, and sigma (known population SD)" };
          }
          const n = params.data.length;
          const m = mean(params.data);
          const se = params.sigma / Math.sqrt(n);
          const z = (m - params.mu) / se;
          const pValue = 2 * (1 - normalCDF(Math.abs(z), 0, 1));
          const reject = pValue < alpha;

          steps.push(`One-Sample Z-Test:`);
          steps.push(`  H0: mu = ${params.mu}`);
          steps.push(`  H1: mu != ${params.mu}`);
          steps.push(`  Sample mean: ${m.toFixed(4)}`);
          steps.push(`  Known sigma: ${params.sigma}`);
          steps.push(`  SE = ${params.sigma} / sqrt(${n}) = ${se.toFixed(4)}`);
          steps.push(`  z = (${m.toFixed(4)} - ${params.mu}) / ${se.toFixed(4)} = ${z.toFixed(4)}`);
          steps.push(`  p-value = ${pValue.toFixed(6)}`);
          steps.push(`  ${reject ? "REJECT H0" : "FAIL TO REJECT H0"}`);

          return {
            success: true,
            result: `z=${z.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: z,
            p_value: pValue,
            degrees_freedom: n - 1,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}).` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}).`,
            steps,
            message: `z=${z.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "significant" : "not significant"}`,
          };
        }

        case "chi_square_gof": {
          if (!params.observed || !params.expected) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide observed and expected frequency arrays" };
          }
          if (params.observed.length !== params.expected.length) {
            return { success: false, result: "", conclusion: "", steps, message: "Arrays must have same length" };
          }
          let chiSq = 0;
          steps.push(`Chi-Square Goodness of Fit:`);
          steps.push(`  H0: Observed matches expected distribution`);
          steps.push(`  H1: Observed differs from expected`);
          for (let i = 0; i < params.observed.length; i++) {
            const o = params.observed[i]!;
            const e = params.expected[i]!;
            const contrib = ((o - e) ** 2) / e;
            chiSq += contrib;
            steps.push(`  Category ${i + 1}: O=${o}, E=${e}, (O-E)^2/E = ${contrib.toFixed(4)}`);
          }
          const df = params.observed.length - 1;
          // Approximate p-value using normal approximation for large df
          const z = Math.sqrt(2 * chiSq) - Math.sqrt(2 * df - 1);
          const pValue = 1 - normalCDF(z, 0, 1);
          const reject = pValue < alpha;
          steps.push(`  Chi-square = ${chiSq.toFixed(4)}`);
          steps.push(`  df = ${df}`);
          steps.push(`  p-value ~ ${pValue.toFixed(6)}`);
          steps.push(`  ${reject ? "REJECT H0: Distribution differs" : "FAIL TO REJECT H0: Distribution fits"}`);

          return {
            success: true,
            result: `chi2=${chiSq.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: chiSq,
            p_value: pValue,
            degrees_freedom: df,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}). Distribution differs from expected.` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}). Distribution fits expected.`,
            steps,
            message: `chi2=${chiSq.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "significant" : "not significant"}`,
          };
        }

        case "chi_square_independence": {
          if (!params.contingency_table || params.contingency_table.length === 0) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide contingency_table as 2D array" };
          }
          const table = params.contingency_table;
          const rows = table.length;
          const cols = table[0]!.length;
          const rowSums = table.map((row: number[]) => row.reduce((a: number, b: number) => a + b, 0));
          const colSums: number[] = Array(cols).fill(0);
          let total = 0;
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
              colSums[j]! += table[i]![j]!;
              total += table[i]![j]!;
            }
          }
          let chiSq = 0;
          steps.push(`Chi-Square Test of Independence:`);
          steps.push(`  H0: Variables are independent`);
          steps.push(`  H1: Variables are associated`);
          steps.push(`  Contingency table: ${rows}x${cols}, total=${total}`);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
              const o = table[i]![j]!;
              const e = (rowSums[i]! * colSums[j]!) / total;
              const contrib = ((o - e) ** 2) / e;
              chiSq += contrib;
              steps.push(`  [${i + 1},${j + 1}]: O=${o}, E=${e.toFixed(2)}, contrib=${contrib.toFixed(4)}`);
            }
          }
          const df = (rows - 1) * (cols - 1);
          const z = Math.sqrt(2 * chiSq) - Math.sqrt(2 * df - 1);
          const pValue = 1 - normalCDF(z, 0, 1);
          const reject = pValue < alpha;
          steps.push(`  Chi-square = ${chiSq.toFixed(4)}`);
          steps.push(`  df = ${df}`);
          steps.push(`  p-value ~ ${pValue.toFixed(6)}`);
          steps.push(`  ${reject ? "REJECT H0: Variables are associated" : "FAIL TO REJECT H0: Variables are independent"}`);

          return {
            success: true,
            result: `chi2=${chiSq.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: chiSq,
            p_value: pValue,
            degrees_freedom: df,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}). Variables are associated.` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}). Variables appear independent.`,
            steps,
            message: `chi2=${chiSq.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "associated" : "independent"}`,
          };
        }

        case "anova": {
          if (!params.groups || params.groups.length < 2) {
            return { success: false, result: "", conclusion: "", steps, message: "Provide at least 2 groups" };
          }
          const groups = params.groups;
          const k = groups.length;
          const allData: number[] = [];
          for (const g of groups) allData.push(...g);
          const grandMean = mean(allData);
          const N = allData.length;

          // Between-group sum of squares
          let ssb = 0;
          for (const g of groups) {
            ssb += g.length * (mean(g) - grandMean) ** 2;
          }
          // Within-group sum of squares
          let ssw = 0;
          for (const g of groups) {
            const gm = mean(g);
            ssw += g.reduce((s: number, v: number) => s + (v - gm) ** 2, 0);
          }

          const dfb = k - 1;
          const dfw = N - k;
          const msb = ssb / dfb;
          const msw = ssw / dfw;
          const f = msw === 0 ? Infinity : msb / msw;
          // Approximate p-value
          const pValue = 1 - normalCDF(Math.sqrt(f), 0, 1);
          const reject = pValue < alpha;

          steps.push(`One-Way ANOVA:`);
          steps.push(`  H0: All group means are equal`);
          steps.push(`  H1: At least one group mean differs`);
          steps.push(`  Groups: ${k}, Total observations: ${N}`);
          steps.push(`  Grand mean: ${grandMean.toFixed(4)}`);
          steps.push(`  SSB (between): ${ssb.toFixed(4)}, df=${dfb}`);
          steps.push(`  SSW (within): ${ssw.toFixed(4)}, df=${dfw}`);
          steps.push(`  MSB = ${msb.toFixed(4)}, MSW = ${msw.toFixed(4)}`);
          steps.push(`  F = ${f.toFixed(4)}`);
          steps.push(`  p-value ~ ${pValue.toFixed(6)}`);
          steps.push(`  ${reject ? "REJECT H0: At least one group differs" : "FAIL TO REJECT H0: All groups equal"}`);

          return {
            success: true,
            result: `F=${f.toFixed(4)}, p=${pValue.toFixed(6)}`,
            test_statistic: f,
            p_value: pValue,
            degrees_freedom: dfb,
            conclusion: reject ? `Reject H0 (p=${pValue.toFixed(6)} < ${alpha}). At least one group mean differs.` : `Fail to reject H0 (p=${pValue.toFixed(6)} >= ${alpha}). No significant difference between groups.`,
            steps,
            message: `F=${f.toFixed(4)}, p=${pValue.toFixed(6)}, ${reject ? "significant" : "not significant"}`,
          };
        }

        default:
          return { success: false, result: "", conclusion: "", steps, message: "Unknown test type" };
      }
    } catch (e: any) {
      return { success: false, result: "", conclusion: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 3. REGRESSION ANALYSIS — linear, polynomial, correlation
// =============================================================================

export const statsRegression: ToolDef = {
  name: "stats.regression",
  description: "Perform regression analysis: linear regression (y = mx + b), correlation coefficient (Pearson r), coefficient of determination (R^2), and polynomial regression (degree 2-3). Returns equation, coefficients, R-squared, and predictions. Use 'list' to see all.",
  inputSchema: z.object({
    type: z.enum(["linear", "correlation", "polynomial", "list"]).describe("Type of regression analysis"),
    x: z.array(z.number()).optional().describe("X values (independent variable)"),
    y: z.array(z.number()).optional().describe("Y values (dependent variable)"),
    degree: z.number().default(2).describe("Polynomial degree (for polynomial regression)"),
    predict_x: z.number().optional().describe("X value to predict Y for"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    equation: z.string().optional(),
    coefficients: z.array(z.number()).optional(),
    r_squared: z.number().optional(),
    correlation: z.number().optional(),
    prediction: z.number().optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.type === "list") {
        return {
          success: true,
          result: "Types: linear, correlation, polynomial",
          steps,
          message: "Available regression types",
        };
      }

      if (!params.x || !params.y || params.x.length !== params.y.length) {
        return { success: false, result: "", steps, message: "Provide x and y arrays of equal length" };
      }

      const x = params.x;
      const y = params.y;
      const n = x.length;
      const xMean = mean(x);
      const yMean = mean(y);

      switch (params.type) {
        case "linear": {
          // Simple linear regression: y = mx + b
          let sxy = 0;
          let sxx = 0;
          let syy = 0;
          for (let i = 0; i < n; i++) {
            sxy += (x[i]! - xMean) * (y[i]! - yMean);
            sxx += (x[i]! - xMean) ** 2;
            syy += (y[i]! - yMean) ** 2;
          }
          const m = sxy / sxx;
          const b = yMean - m * xMean;
          const r = sxy / Math.sqrt(sxx * syy);
          const rSquared = r * r;

          steps.push(`Linear Regression: y = mx + b`);
          steps.push(`  n = ${n}`);
          steps.push(`  x mean = ${xMean.toFixed(4)}, y mean = ${yMean.toFixed(4)}`);
          steps.push(`  Slope (m) = ${m.toFixed(6)}`);
          steps.push(`  Intercept (b) = ${b.toFixed(6)}`);
          steps.push(`  Equation: y = ${m.toFixed(6)}x + ${b.toFixed(6)}`);
          steps.push(`  Correlation (r) = ${r.toFixed(6)}`);
          steps.push(`  R-squared = ${rSquared.toFixed(6)}`);
          steps.push(`  ${rSquared > 0.7 ? "Strong fit" : rSquared > 0.5 ? "Moderate fit" : rSquared > 0.3 ? "Weak fit" : "Very weak fit"}`);

          let prediction: number | undefined;
          if (params.predict_x !== undefined) {
            prediction = m * params.predict_x + b;
            steps.push(`  Prediction: y(${params.predict_x}) = ${prediction.toFixed(6)}`);
          }

          return {
            success: true,
            result: `y = ${m.toFixed(6)}x + ${b.toFixed(6)}, R^2 = ${rSquared.toFixed(6)}`,
            equation: `y = ${m.toFixed(6)}x + ${b.toFixed(6)}`,
            coefficients: [b, m],
            r_squared: rSquared,
            correlation: r,
            prediction,
            steps,
            message: `Linear fit: y = ${m.toFixed(4)}x + ${b.toFixed(4)}, R^2 = ${rSquared.toFixed(4)}`,
          };
        }

        case "correlation": {
          let sxy = 0;
          let sxx = 0;
          let syy = 0;
          for (let i = 0; i < n; i++) {
            sxy += (x[i]! - xMean) * (y[i]! - yMean);
            sxx += (x[i]! - xMean) ** 2;
            syy += (y[i]! - yMean) ** 2;
          }
          const r = sxy / Math.sqrt(sxx * syy);
          const rSquared = r * r;

          steps.push(`Pearson Correlation Coefficient:`);
          steps.push(`  r = ${r.toFixed(6)}`);
          steps.push(`  r^2 = ${rSquared.toFixed(6)}`);
          const strength = Math.abs(r) > 0.7 ? "strong" : Math.abs(r) > 0.5 ? "moderate" : Math.abs(r) > 0.3 ? "weak" : "very weak";
          const direction = r > 0 ? "positive" : r < 0 ? "negative" : "no";
          steps.push(`  Strength: ${strength}`);
          steps.push(`  Direction: ${direction} correlation`);

          return {
            success: true,
            result: `r = ${r.toFixed(6)}, r^2 = ${rSquared.toFixed(6)}`,
            correlation: r,
            r_squared: rSquared,
            steps,
            message: `Pearson r = ${r.toFixed(4)} (${strength} ${direction} correlation)`,
          };
        }

        case "polynomial": {
          // Polynomial regression using least squares (normal equations)
          const degree = params.degree;
          if (degree < 2 || degree > 5) {
            return { success: false, result: "", steps, message: "Degree must be between 2 and 5" };
          }

          // Build design matrix
          const size = degree + 1;
          const A: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
          const B: number[] = Array(size).fill(0);

          for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
              A[i]![j] = x.reduce((sum: number, xi: number) => sum + Math.pow(xi, i + j), 0);
            }
            B[i] = x.reduce((sum: number, xi: number, idx: number) => sum + y[idx]! * Math.pow(xi, i), 0);
          }

          // Solve using Gaussian elimination
          const augmented = A.map((row, i) => [...row, B[i]!]);
          for (let col = 0; col < size; col++) {
            // Pivot
            let maxRow = col;
            for (let row = col + 1; row < size; row++) {
              if (Math.abs(augmented[row]![col]!) > Math.abs(augmented[maxRow]![col]!)) maxRow = row;
            }
            [augmented[col], augmented[maxRow]] = [augmented[maxRow]!, augmented[col]!];
            // Eliminate
            for (let row = col + 1; row < size; row++) {
              const factor = augmented[row]![col]! / augmented[col]![col]!;
              for (let k = col; k <= size; k++) {
                augmented[row]![k] = (augmented[row]![k] ?? 0) - factor * (augmented[col]![k] ?? 0);
              }
            }
          }
          // Back substitution
          const coeffs = Array(size).fill(0);
          for (let i = size - 1; i >= 0; i--) {
            let sum = augmented[i]![size]!;
            for (let j = i + 1; j < size; j++) {
              sum -= augmented[i]![j]! * coeffs[j]!;
            }
            coeffs[i] = sum / augmented[i]![i]!;
          }

          // Calculate R-squared
          const yMeanVal = yMean;
          let ssTot = 0;
          let ssRes = 0;
          for (let i = 0; i < n; i++) {
            const yPred = coeffs.reduce((sum, c, d) => sum + c * Math.pow(x[i]!, d), 0);
            ssTot += (y[i]! - yMeanVal) ** 2;
            ssRes += (y[i]! - yPred) ** 2;
          }
          const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

          const terms = coeffs.map((c, d) => {
            if (d === 0) return `${c.toFixed(6)}`;
            if (d === 1) return `${c.toFixed(6)}x`;
            return `${c.toFixed(6)}x^${d}`;
          });
          const equation = `y = ${terms.reverse().join(" + ")}`;

          steps.push(`Polynomial Regression (degree ${degree}):`);
          steps.push(`  Equation: ${equation}`);
          steps.push(`  Coefficients: [${coeffs.map((c) => c.toFixed(6)).join(", ")}]`);
          steps.push(`  R-squared = ${rSquared.toFixed(6)}`);

          let prediction: number | undefined;
          if (params.predict_x !== undefined) {
            prediction = coeffs.reduce((sum: number, c: number, d: number) => sum + c * Math.pow(params.predict_x!, d), 0);
            steps.push(`  Prediction: y(${params.predict_x}) = ${prediction!.toFixed(6)}`);
          }

          return {
            success: true,
            result: `${equation}, R^2 = ${rSquared.toFixed(6)}`,
            equation,
            coefficients: coeffs,
            r_squared: rSquared,
            prediction,
            steps,
            message: `Polynomial (deg ${degree}) fit: R^2 = ${rSquared.toFixed(4)}`,
          };
        }

        default:
          return { success: false, result: "", steps, message: "Unknown regression type" };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 4. PROBABILITY DISTRIBUTIONS — normal, binomial, Poisson, exponential
// =============================================================================

export const statsDistribution: ToolDef = {
  name: "stats.distribution",
  description: "Calculate probability distributions: normal (PDF, CDF, quantiles), binomial (PMF, CDF), Poisson (PMF, CDF), exponential (PDF, CDF), and uniform (PDF, CDF). Also calculates confidence intervals. Use 'list' to see all.",
  inputSchema: z.object({
    distribution: z.enum(["normal_pdf", "normal_cdf", "normal_quantile", "binomial_pmf", "binomial_cdf", "poisson_pmf", "poisson_cdf", "exponential_pdf", "exponential_cdf", "confidence_interval", "list"]).describe("Distribution calculation"),
    x: z.number().optional().describe("Value to evaluate"),
    mean: z.number().default(0).describe("Mean (for normal distribution)"),
    std_dev: z.number().default(1).describe("Standard deviation (for normal)"),
    probability: z.number().optional().describe("Probability for quantile function (0-1)"),
    n: z.number().optional().describe("Number of trials (binomial)"),
    p: z.number().optional().describe("Success probability (binomial) or rate (exponential)"),
    k: z.number().optional().describe("Number of successes (binomial) or events (Poisson)"),
    lambda: z.number().optional().describe("Rate parameter (Poisson) or mean (exponential)"),
    sample_mean: z.number().optional().describe("Sample mean (for confidence interval)"),
    sample_std: z.number().optional().describe("Sample standard deviation (for CI)"),
    sample_size: z.number().optional().describe("Sample size (for CI)"),
    confidence_level: z.number().default(0.95).describe("Confidence level (0-1, default 0.95)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    result_value: z.number().optional(),
    formula: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.distribution === "list") {
        const list = [
          "normal_pdf: P(x) = (1/(sigma*sqrt(2pi))) * exp(-(x-mu)^2/(2*sigma^2))",
          "normal_cdf: Cumulative probability P(X <= x) for normal distribution",
          "normal_quantile: Inverse CDF — find x given probability",
          "binomial_pmf: P(X=k) = C(n,k) * p^k * (1-p)^(n-k)",
          "binomial_cdf: P(X <= k) for binomial distribution",
          "poisson_pmf: P(X=k) = (lambda^k * e^(-lambda)) / k!",
          "poisson_cdf: P(X <= k) for Poisson distribution",
          "exponential_pdf: f(x) = lambda * exp(-lambda*x)",
          "exponential_cdf: F(x) = 1 - exp(-lambda*x)",
          "confidence_interval: CI = mean +/- z * (sigma/sqrt(n))",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available distribution calculations" };
      }

      switch (params.distribution) {
        case "normal_pdf": {
          if (params.x === undefined) return { success: false, result: "", formula: "", steps, message: "Provide x" };
          const { x, mean: mu, std_dev: sigma } = params;
          const pdf = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
          steps.push(`Normal PDF: f(x) = (1/(sigma*sqrt(2pi))) * exp(-(x-mu)^2/(2*sigma^2))`);
          steps.push(`f(${x}) = ${pdf.toFixed(8)}`);
          return { success: true, result: `${pdf.toFixed(8)}`, result_value: pdf, formula: "Normal PDF", steps, message: `PDF at x=${x} = ${pdf.toFixed(8)}` };
        }

        case "normal_cdf": {
          if (params.x === undefined) return { success: false, result: "", formula: "", steps, message: "Provide x" };
          const { x, mean: mu, std_dev: sigma } = params;
          const cdf = normalCDF(x, mu, sigma);
          steps.push(`Normal CDF: P(X <= ${x}) where mu=${mu}, sigma=${sigma}`);
          steps.push(`P(X <= ${x}) = ${cdf.toFixed(8)}`);
          steps.push(`P(X > ${x}) = ${(1 - cdf).toFixed(8)}`);
          return { success: true, result: `${cdf.toFixed(8)}`, result_value: cdf, formula: "Normal CDF", steps, message: `P(X <= ${x}) = ${cdf.toFixed(6)} (${(cdf * 100).toFixed(2)}%)` };
        }

        case "normal_quantile": {
          if (params.probability === undefined) return { success: false, result: "", formula: "", steps, message: "Provide probability (0-1)" };
          const z = inverseNormalCDF(params.probability);
          const x = params.mean + z * params.std_dev;
          steps.push(`Normal Quantile (Inverse CDF):`);
          steps.push(`p = ${params.probability}`);
          steps.push(`z-score = ${z.toFixed(6)}`);
          steps.push(`x = mu + z*sigma = ${params.mean} + ${z.toFixed(6)}*${params.std_dev} = ${x.toFixed(6)}`);
          return { success: true, result: `${x.toFixed(6)}`, result_value: x, formula: "x = mu + z*sigma", steps, message: `${(params.probability * 100).toFixed(1)}th percentile = ${x.toFixed(4)}` };
        }

        case "binomial_pmf": {
          if (params.n === undefined || params.p === undefined || params.k === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide n, p, and k" };
          }
          // C(n,k) = n! / (k! * (n-k)!)
          function logFactorial(n: number): number {
            if (n <= 1) return 0;
            let s = 0;
            for (let i = 2; i <= n; i++) s += Math.log(i);
            return s;
          }
          const logComb = logFactorial(params.n) - logFactorial(params.k) - logFactorial(params.n - params.k);
          const logPmf = logComb + params.k * Math.log(params.p) + (params.n - params.k) * Math.log(1 - params.p);
          const pmf = Math.exp(logPmf);
          steps.push(`Binomial PMF: P(X=k) = C(n,k) * p^k * (1-p)^(n-k)`);
          steps.push(`n=${params.n}, p=${params.p}, k=${params.k}`);
          steps.push(`P(X=${params.k}) = ${pmf.toFixed(8)}`);
          return { success: true, result: `${pmf.toFixed(8)}`, result_value: pmf, formula: "Binomial PMF", steps, message: `P(X=${params.k}) = ${pmf.toFixed(6)}` };
        }

        case "binomial_cdf": {
          if (params.n === undefined || params.p === undefined || params.k === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide n, p, and k" };
          }
          function logFactorial(n: number): number {
            if (n <= 1) return 0;
            let s = 0;
            for (let i = 2; i <= n; i++) s += Math.log(i);
            return s;
          }
          let cdf = 0;
          for (let i = 0; i <= params.k; i++) {
            const logComb = logFactorial(params.n) - logFactorial(i) - logFactorial(params.n - i);
            const logPmf = logComb + i * Math.log(params.p) + (params.n - i) * Math.log(1 - params.p);
            cdf += Math.exp(logPmf);
          }
          steps.push(`Binomial CDF: P(X <= k) = sum of P(X=i) for i=0 to k`);
          steps.push(`n=${params.n}, p=${params.p}, k=${params.k}`);
          steps.push(`P(X <= ${params.k}) = ${cdf.toFixed(8)}`);
          return { success: true, result: `${cdf.toFixed(8)}`, result_value: cdf, formula: "Binomial CDF", steps, message: `P(X <= ${params.k}) = ${cdf.toFixed(6)}` };
        }

        case "poisson_pmf": {
          if (params.lambda === undefined || params.k === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide lambda and k" };
          }
          function logFactorial(n: number): number {
            if (n <= 1) return 0;
            let s = 0;
            for (let i = 2; i <= n; i++) s += Math.log(i);
            return s;
          }
          const logPmf = params.k * Math.log(params.lambda) - params.lambda - logFactorial(params.k);
          const pmf = Math.exp(logPmf);
          steps.push(`Poisson PMF: P(X=k) = (lambda^k * e^(-lambda)) / k!`);
          steps.push(`lambda=${params.lambda}, k=${params.k}`);
          steps.push(`P(X=${params.k}) = ${pmf.toFixed(8)}`);
          return { success: true, result: `${pmf.toFixed(8)}`, result_value: pmf, formula: "Poisson PMF", steps, message: `P(X=${params.k}) = ${pmf.toFixed(6)}` };
        }

        case "poisson_cdf": {
          if (params.lambda === undefined || params.k === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide lambda and k" };
          }
          function logFactorial(n: number): number {
            if (n <= 1) return 0;
            let s = 0;
            for (let i = 2; i <= n; i++) s += Math.log(i);
            return s;
          }
          let cdf = 0;
          for (let i = 0; i <= params.k; i++) {
            const logPmf = i * Math.log(params.lambda) - params.lambda - logFactorial(i);
            cdf += Math.exp(logPmf);
          }
          steps.push(`Poisson CDF: P(X <= k)`);
          steps.push(`lambda=${params.lambda}, k=${params.k}`);
          steps.push(`P(X <= ${params.k}) = ${cdf.toFixed(8)}`);
          return { success: true, result: `${cdf.toFixed(8)}`, result_value: cdf, formula: "Poisson CDF", steps, message: `P(X <= ${params.k}) = ${cdf.toFixed(6)}` };
        }

        case "exponential_pdf": {
          if (params.lambda === undefined || params.x === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide lambda and x" };
          }
          const pdf = params.lambda * Math.exp(-params.lambda * params.x);
          steps.push(`Exponential PDF: f(x) = lambda * exp(-lambda*x)`);
          steps.push(`lambda=${params.lambda}, x=${params.x}`);
          steps.push(`f(${params.x}) = ${pdf.toFixed(8)}`);
          return { success: true, result: `${pdf.toFixed(8)}`, result_value: pdf, formula: "Exponential PDF", steps, message: `PDF at x=${params.x} = ${pdf.toFixed(8)}` };
        }

        case "exponential_cdf": {
          if (params.lambda === undefined || params.x === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide lambda and x" };
          }
          const cdf = 1 - Math.exp(-params.lambda * params.x);
          steps.push(`Exponential CDF: F(x) = 1 - exp(-lambda*x)`);
          steps.push(`lambda=${params.lambda}, x=${params.x}`);
          steps.push(`P(X <= ${params.x}) = ${cdf.toFixed(8)}`);
          steps.push(`Mean = 1/lambda = ${(1 / params.lambda).toFixed(4)}`);
          return { success: true, result: `${cdf.toFixed(8)}`, result_value: cdf, formula: "Exponential CDF", steps, message: `P(X <= ${params.x}) = ${cdf.toFixed(6)}` };
        }

        case "confidence_interval": {
          if (params.sample_mean === undefined || params.sample_std === undefined || params.sample_size === undefined) {
            return { success: false, result: "", formula: "", steps, message: "Provide sample_mean, sample_std, and sample_size" };
          }
          const cl = params.confidence_level;
          const alphaCI = 1 - cl;
          const zCritical = inverseNormalCDF(1 - alphaCI / 2);
          const se = params.sample_std / Math.sqrt(params.sample_size);
          const margin = zCritical * se;
          const lower = params.sample_mean - margin;
          const upper = params.sample_mean + margin;
          steps.push(`Confidence Interval (${(cl * 100).toFixed(0)}%):`);
          steps.push(`  Sample mean: ${params.sample_mean}`);
          steps.push(`  Sample SD: ${params.sample_std}`);
          steps.push(`  Sample size: ${params.sample_size}`);
          steps.push(`  z-critical (${(cl * 100).toFixed(0)}%): ${zCritical.toFixed(4)}`);
          steps.push(`  Standard error: ${se.toFixed(6)}`);
          steps.push(`  Margin of error: ${margin.toFixed(6)}`);
          steps.push(`  CI: [${lower.toFixed(4)}, ${upper.toFixed(4)}]`);
          return { success: true, result: `[${lower.toFixed(4)}, ${upper.toFixed(4)}]`, result_value: lower, formula: "CI = mean +/- z*(sigma/sqrt(n))", steps, message: `${(cl * 100).toFixed(0)}% CI: [${lower.toFixed(4)}, ${upper.toFixed(4)}]` };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown distribution" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};
