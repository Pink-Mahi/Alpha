/**
 * Stock Trading Tools — Technical indicators, options analysis,
 * market data fetching, and price prediction.
 *
 * Built for the wheel strategy (covered calls + cash-secured puts)
 * and general stock/volume prediction.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Simple Moving Average */
function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j]!;
    result.push(sum / period);
  }
  return result;
}

/** Exponential Moving Average */
function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = data[0] ?? 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(data[0]!); continue; }
    const val = data[i]! * k + prev * (1 - k);
    result.push(val);
    prev = val;
  }
  return result;
}

/** Wilder's smoothing (used for RSI, ATR) */
function wilderSmooth(data: number[], period: number): number[] {
  const result: number[] = [];
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      prev += data[i] ?? 0;
      if (i === period - 1) {
        prev = prev / period;
        result.push(prev);
      } else {
        result.push(NaN);
      }
    } else {
      prev = (prev * (period - 1) + (data[i] ?? 0)) / period;
      result.push(prev);
    }
  }
  return result;
}

/** True Range */
function trueRange(high: number[], low: number[], close: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < high.length; i++) {
    if (i === 0) { result.push(high[i]! - low[i]!); continue; }
    const tr = Math.max(
      high[i]! - low[i]!,
      Math.abs(high[i]! - close[i - 1]!),
      Math.abs(low[i]! - close[i - 1]!)
    );
    result.push(tr);
  }
  return result;
}

// =============================================================================
// STOCK INDICATORS — RSI, MACD, Bollinger, SMA/EMA, Stochastic, ATR, ADX,
//   OBV, VWAP, Ichimoku, Williams %R, CCI, ROC, MFI, Fibonacci
// =============================================================================

export const stockIndicators: ToolDef = {
  name: "stock.indicators",
  description: "Calculate ALL major technical analysis indicators from OHLCV data: RSI, MACD, Bollinger Bands, SMA, EMA, Stochastic Oscillator, ATR, ADX/DI+/DI-, OBV, VWAP, Ichimoku Cloud, Williams %R, CCI, Rate of Change, MFI, Fibonacci retracements, Parabolic SAR, and Pivot Points. Returns indicator values plus buy/sell/neutral signals. Use 'list' to see all indicators.",
  inputSchema: z.object({
    indicator: z.enum([
      "rsi", "macd", "bollinger", "sma", "ema", "stochastic", "atr",
      "adx", "obv", "vwap", "ichimoku", "williams_r", "cci", "roc",
      "mfi", "fibonacci", "parabolic_sar", "pivot_points", "all", "list",
    ]).describe("Indicator to calculate (or 'list' / 'all')"),
    highs: z.array(z.number()).optional().describe("Array of high prices"),
    lows: z.array(z.number()).optional().describe("Array of low prices"),
    closes: z.array(z.number()).optional().describe("Array of close prices"),
    volumes: z.array(z.number()).optional().describe("Array of volumes"),
    period: z.number().default(14).describe("Primary period (default 14)"),
    period2: z.number().default(26).describe("Secondary period (e.g. MACD slow, default 26)"),
    period3: z.number().default(9).describe("Tertiary period (e.g. MACD signal, default 9)"),
    std_dev: z.number().default(2).describe("Standard deviations for Bollinger Bands"),
    current_price: z.number().optional().describe("Current price (for Fibonacci/Pivot context)"),
    high_52: z.number().optional().describe("52-week high (for Fibonacci)"),
    low_52: z.number().optional().describe("52-week low (for Fibonacci)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    indicator: z.string(),
    values: z.record(z.any()).optional(),
    signal: z.string().optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.indicator === "list") {
        const list = [
          "rsi: Relative Strength Index (14) — momentum, >70 overbought, <30 oversold",
          "macd: Moving Average Convergence Divergence (12,26,9) — trend + momentum",
          "bollinger: Bollinger Bands (20, 2 std dev) — volatility + mean reversion",
          "sma: Simple Moving Average (configurable period)",
          "ema: Exponential Moving Average (configurable period)",
          "stochastic: Stochastic Oscillator (14,3) — momentum, >80 overbought, <20 oversold",
          "atr: Average True Range (14) — volatility measure",
          "adx: ADX/DI+/DI- (14) — trend strength + direction",
          "obv: On-Balance Volume — volume-based momentum",
          "vwap: Volume-Weighted Average Price — intraday fair value",
          "ichimoku: Ichimoku Cloud (9,26,52) — trend + support/resistance",
          "williams_r: Williams %R (14) — momentum, <-20 overbought, >-80 oversold",
          "cci: Commodity Channel Index (20) — momentum, >100 overbought, <-100 oversold",
          "roc: Rate of Change (12) — momentum percentage",
          "mfi: Money Flow Index (14) — volume-weighted RSI, >80 overbought, <20 oversold",
          "fibonacci: Fibonacci retracement levels (needs high_52, low_52)",
          "parabolic_sar: Parabolic Stop and Reverse — trend reversal points",
          "pivot_points: Pivot points + support/resistance levels",
          "all: Calculate key indicators together (RSI, MACD, Bollinger, SMA-50, SMA-200, ATR, OBV)",
        ].join("\n");
        return { success: true, result: list, indicator: "list", steps, message: "19 indicators available" };
      }

      const closes = params.closes ?? [];
      const highs = params.highs ?? closes;
      const lows = params.lows ?? closes;
      const volumes = params.volumes ?? [];

      if (closes.length === 0) {
        return { success: false, result: "", indicator: params.indicator, steps, message: "Provide closes array (and optionally highs, lows, volumes)" };
      }

      const last = closes[closes.length - 1]!;
      const n = closes.length;

      switch (params.indicator) {
        // ================================================================
        // RSI — Relative Strength Index
        // ================================================================
        case "rsi": {
          const period = params.period;
          if (n < period + 1) return { success: false, result: "", indicator: "rsi", steps, message: `Need at least ${period + 1} data points` };
          const gains: number[] = [];
          const losses: number[] = [];
          for (let i = 1; i < n; i++) {
            const diff = closes[i]! - closes[i - 1]!;
            gains.push(Math.max(0, diff));
            losses.push(Math.max(0, -diff));
          }
          const avgGains = wilderSmooth(gains, period);
          const avgLosses = wilderSmooth(losses, period);
          const rsiValues: number[] = [];
          for (let i = 0; i < avgGains.length; i++) {
            const ag = avgGains[i]!;
            const al = avgLosses[i]!;
            if (isNaN(ag) || isNaN(al) || al === 0) { rsiValues.push(al === 0 ? 100 : NaN); continue; }
            const rs = ag / al;
            rsiValues.push(100 - 100 / (1 + rs));
          }
          const currentRSI = rsiValues[rsiValues.length - 1]!;
          const signal = currentRSI > 70 ? "SELL (overbought)" : currentRSI < 30 ? "BUY (oversold)" : "NEUTRAL";
          steps.push(`RSI (${period}):`);
          steps.push(`  Current RSI: ${currentRSI.toFixed(2)}`);
          steps.push(`  >70 = overbought (sell signal), <30 = oversold (buy signal)`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `RSI=${currentRSI.toFixed(2)}`, indicator: "rsi", values: { rsi: currentRSI, rsi_series: rsiValues.slice(-10) }, signal, steps, message: `RSI(${period}) = ${currentRSI.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // MACD — Moving Average Convergence Divergence
        // ================================================================
        case "macd": {
          const fast = params.period;   // 12
          const slow = params.period2;  // 26
          const signalP = params.period3; // 9
          if (n < slow + signalP) return { success: false, result: "", indicator: "macd", steps, message: `Need at least ${slow + signalP} data points` };
          const emaFast = ema(closes, fast);
          const emaSlow = ema(closes, slow);
          const macdLine: number[] = [];
          for (let i = 0; i < n; i++) macdLine.push(emaFast[i]! - emaSlow[i]!);
          const signalLine = ema(macdLine, signalP);
          const histogram: number[] = [];
          for (let i = 0; i < n; i++) histogram.push(macdLine[i]! - signalLine[i]!);
          const currentMACD = macdLine[n - 1]!;
          const currentSignal = signalLine[n - 1]!;
          const currentHist = histogram[n - 1]!;
          const prevHist = histogram[n - 2] ?? 0;
          const signal = currentMACD > currentSignal ? "BUY (bullish crossover)" : currentMACD < currentSignal ? "SELL (bearish crossover)" : "NEUTRAL";
          const momentum = currentHist > prevHist ? "increasing" : "decreasing";
          steps.push(`MACD (${fast}, ${slow}, ${signalP}):`);
          steps.push(`  MACD line: ${currentMACD.toFixed(4)}`);
          steps.push(`  Signal line: ${currentSignal.toFixed(4)}`);
          steps.push(`  Histogram: ${currentHist.toFixed(4)} (${momentum})`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `MACD=${currentMACD.toFixed(4)}, Signal=${currentSignal.toFixed(4)}, Hist=${currentHist.toFixed(4)}`, indicator: "macd", values: { macd: currentMACD, signal: currentSignal, histogram: currentHist, momentum }, signal, steps, message: `MACD ${signal} (hist ${momentum})` };
        }

        // ================================================================
        // Bollinger Bands
        // ================================================================
        case "bollinger": {
          const period = params.period;
          const sd = params.std_dev;
          if (n < period) return { success: false, result: "", indicator: "bollinger", steps, message: `Need at least ${period} data points` };
          const smaVals = sma(closes, period);
          const mid = smaVals[n - 1]!;
          let variance = 0;
          for (let i = n - period; i < n; i++) variance += (closes[i]! - mid) ** 2;
          variance /= period;
          const std = Math.sqrt(variance);
          const upper = mid + sd * std;
          const lower = mid - sd * std;
          const pctB = (last - lower) / (upper - lower);
          const bandwidth = (upper - lower) / mid;
          const signal = pctB > 1 ? "SELL (above upper band)" : pctB < 0 ? "BUY (below lower band)" : pctB > 0.8 ? "CAUTION (near upper)" : pctB < 0.2 ? "WATCH (near lower)" : "NEUTRAL";
          steps.push(`Bollinger Bands (${period}, ${sd}σ):`);
          steps.push(`  Upper: ${upper.toFixed(4)}`);
          steps.push(`  Middle (SMA): ${mid.toFixed(4)}`);
          steps.push(`  Lower: ${lower.toFixed(4)}`);
          steps.push(`  %B: ${pctB.toFixed(4)} (0=lower, 1=upper)`);
          steps.push(`  Bandwidth: ${(bandwidth * 100).toFixed(2)}% (low=squeeze)`);
          steps.push(`  Current price: ${last}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `Upper=${upper.toFixed(2)}, Mid=${mid.toFixed(2)}, Lower=${lower.toFixed(2)}, %B=${pctB.toFixed(2)}`, indicator: "bollinger", values: { upper, middle: mid, lower, pct_b: pctB, bandwidth }, signal, steps, message: `Bollinger: ${signal}, %B=${pctB.toFixed(2)}` };
        }

        // ================================================================
        // SMA — Simple Moving Average
        // ================================================================
        case "sma": {
          const period = params.period;
          if (n < period) return { success: false, result: "", indicator: "sma", steps, message: `Need at least ${period} data points` };
          const smaVals = sma(closes, period);
          const current = smaVals[n - 1]!;
          const prev = smaVals[n - 2] ?? current;
          const trend = current > prev ? "rising" : current < prev ? "falling" : "flat";
          const signal = last > current ? "BULLISH (price above SMA)" : "BEARISH (price below SMA)";
          steps.push(`SMA (${period}):`);
          steps.push(`  Current SMA: ${current.toFixed(4)} (${trend})`);
          steps.push(`  Current price: ${last}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `SMA(${period})=${current.toFixed(4)}`, indicator: "sma", values: { sma: current, trend, price_vs_sma: last > current ? "above" : "below" }, signal, steps, message: `SMA(${period}) = ${current.toFixed(2)}, ${signal}` };
        }

        // ================================================================
        // EMA — Exponential Moving Average
        // ================================================================
        case "ema": {
          const period = params.period;
          if (n < period) return { success: false, result: "", indicator: "ema", steps, message: `Need at least ${period} data points` };
          const emaVals = ema(closes, period);
          const current = emaVals[n - 1]!;
          const prev = emaVals[n - 2] ?? current;
          const trend = current > prev ? "rising" : current < prev ? "falling" : "flat";
          const signal = last > current ? "BULLISH (price above EMA)" : "BEARISH (price below EMA)";
          steps.push(`EMA (${period}):`);
          steps.push(`  Current EMA: ${current.toFixed(4)} (${trend})`);
          steps.push(`  Current price: ${last}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `EMA(${period})=${current.toFixed(4)}`, indicator: "ema", values: { ema: current, trend, price_vs_ema: last > current ? "above" : "below" }, signal, steps, message: `EMA(${period}) = ${current.toFixed(2)}, ${signal}` };
        }

        // ================================================================
        // Stochastic Oscillator
        // ================================================================
        case "stochastic": {
          const period = params.period;
          const smoothK = params.period3;
          if (n < period + smoothK) return { success: false, result: "", indicator: "stochastic", steps, message: `Need at least ${period + smoothK} data points` };
          const kValues: number[] = [];
          for (let i = period - 1; i < n; i++) {
            let hh = -Infinity, ll = Infinity;
            for (let j = i - period + 1; j <= i; j++) {
              hh = Math.max(hh, highs[j]!);
              ll = Math.min(ll, lows[j]!);
            }
            kValues.push(hh === ll ? 50 : ((closes[i]! - ll) / (hh - ll)) * 100);
          }
          // Smooth %K
          const kSmoothed = sma(kValues, smoothK);
          const dLine = sma(kSmoothed, 3);
          const currentK = kSmoothed[kSmoothed.length - 1]!;
          const currentD = dLine[dLine.length - 1]!;
          const signal = currentK > 80 ? "SELL (overbought)" : currentK < 20 ? "BUY (oversold)" : currentK > currentD ? "BUY (K crosses above D)" : "SELL (K crosses below D)";
          steps.push(`Stochastic Oscillator (${period}, ${smoothK}):`);
          steps.push(`  %K: ${currentK.toFixed(2)}`);
          steps.push(`  %D: ${currentD.toFixed(2)}`);
          steps.push(`  >80 = overbought, <20 = oversold`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `%K=${currentK.toFixed(2)}, %D=${currentD.toFixed(2)}`, indicator: "stochastic", values: { k: currentK, d: currentD }, signal, steps, message: `Stochastic %K=${currentK.toFixed(2)}, %D=${currentD.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // ATR — Average True Range
        // ================================================================
        case "atr": {
          const period = params.period;
          if (n < period + 1) return { success: false, result: "", indicator: "atr", steps, message: `Need at least ${period + 1} data points` };
          const tr = trueRange(highs, lows, closes);
          const atrVals = wilderSmooth(tr.slice(1), period);
          const currentATR = atrVals[atrVals.length - 1]!;
          const atrPct = (currentATR / last) * 100;
          const volatility = atrPct > 3 ? "HIGH" : atrPct > 1.5 ? "MODERATE" : "LOW";
          steps.push(`ATR (${period}):`);
          steps.push(`  Current ATR: ${currentATR.toFixed(4)}`);
          steps.push(`  ATR as % of price: ${atrPct.toFixed(2)}%`);
          steps.push(`  Volatility: ${volatility}`);
          steps.push(`  Useful for: stop-loss placement, position sizing, options premium`);
          return { success: true, result: `ATR=${currentATR.toFixed(4)} (${atrPct.toFixed(2)}%)`, indicator: "atr", values: { atr: currentATR, atr_pct: atrPct, volatility }, steps, message: `ATR = ${currentATR.toFixed(2)} (${atrPct.toFixed(2)}% — ${volatility} volatility)` };
        }

        // ================================================================
        // ADX — Average Directional Index (trend strength)
        // ================================================================
        case "adx": {
          const period = params.period;
          if (n < period * 2 + 1) return { success: false, result: "", indicator: "adx", steps, message: `Need at least ${period * 2 + 1} data points` };
          const plusDM: number[] = [];
          const minusDM: number[] = [];
          const tr: number[] = [];
          for (let i = 1; i < n; i++) {
            const upMove = highs[i]! - highs[i - 1]!;
            const downMove = lows[i - 1]! - lows[i]!;
            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
            tr.push(Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!)));
          }
          const atrVals = wilderSmooth(tr, period);
          const plusDMSmooth = wilderSmooth(plusDM, period);
          const minusDMSmooth = wilderSmooth(minusDM, period);
          const plusDI: number[] = [];
          const minusDI: number[] = [];
          const dx: number[] = [];
          for (let i = 0; i < atrVals.length; i++) {
            const atr = atrVals[i]!;
            const pdi = atr > 0 ? (plusDMSmooth[i]! / atr) * 100 : 0;
            const mdi = atr > 0 ? (minusDMSmooth[i]! / atr) * 100 : 0;
            plusDI.push(pdi);
            minusDI.push(mdi);
            const sum = pdi + mdi;
            dx.push(sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0);
          }
          const adxVals = wilderSmooth(dx, period);
          const currentADX = adxVals[adxVals.length - 1]!;
          const currentPDI = plusDI[plusDI.length - 1]!;
          const currentMDI = minusDI[minusDI.length - 1]!;
          const trendStrength = currentADX > 50 ? "VERY STRONG" : currentADX > 25 ? "STRONG" : currentADX > 20 ? "DEVELOPING" : "WEAK";
          const direction = currentPDI > currentMDI ? "BULLISH" : "BEARISH";
          const signal = currentADX > 25 ? (direction === "BULLISH" ? "BUY (strong uptrend)" : "SELL (strong downtrend)") : "NEUTRAL (no strong trend)";
          steps.push(`ADX/DI (${period}):`);
          steps.push(`  ADX: ${currentADX.toFixed(2)} — ${trendStrength} trend`);
          steps.push(`  +DI: ${currentPDI.toFixed(2)} (bullish pressure)`);
          steps.push(`  -DI: ${currentMDI.toFixed(2)} (bearish pressure)`);
          steps.push(`  Direction: ${direction}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `ADX=${currentADX.toFixed(2)}, +DI=${currentPDI.toFixed(2)}, -DI=${currentMDI.toFixed(2)}`, indicator: "adx", values: { adx: currentADX, plus_di: currentPDI, minus_di: currentMDI, trend_strength: trendStrength, direction }, signal, steps, message: `ADX=${currentADX.toFixed(1)} (${trendStrength}), ${direction} — ${signal}` };
        }

        // ================================================================
        // OBV — On-Balance Volume
        // ================================================================
        case "obv": {
          if (volumes.length === 0) return { success: false, result: "", indicator: "obv", steps, message: "Provide volumes array" };
          const obvVals: number[] = [0];
          for (let i = 1; i < n; i++) {
            const prev = obvVals[i - 1]!;
            if (closes[i]! > closes[i - 1]!) obvVals.push(prev + (volumes[i] ?? 0));
            else if (closes[i]! < closes[i - 1]!) obvVals.push(prev - (volumes[i] ?? 0));
            else obvVals.push(prev);
          }
          const currentOBV = obvVals[n - 1]!;
          const prevOBV = obvVals[n - 2] ?? currentOBV;
          const trend = currentOBV > prevOBV ? "rising (accumulation)" : currentOBV < prevOBV ? "falling (distribution)" : "flat";
          steps.push(`On-Balance Volume (OBV):`);
          steps.push(`  Current OBV: ${currentOBV.toLocaleString()}`);
          steps.push(`  Trend: ${trend}`);
          steps.push(`  Rising OBV = buying pressure, Falling OBV = selling pressure`);
          const signal = currentOBV > prevOBV ? "BULLISH (volume accumulation)" : "BEARISH (volume distribution)";
          return { success: true, result: `OBV=${currentOBV.toLocaleString()}`, indicator: "obv", values: { obv: currentOBV, trend }, signal, steps, message: `OBV ${trend} — ${signal}` };
        }

        // ================================================================
        // VWAP — Volume-Weighted Average Price
        // ================================================================
        case "vwap": {
          if (volumes.length === 0) return { success: false, result: "", indicator: "vwap", steps, message: "Provide volumes array" };
          let cumPV = 0;
          let cumV = 0;
          for (let i = 0; i < n; i++) {
            const tp = (highs[i]! + lows[i]! + closes[i]!) / 3;
            cumPV += tp * (volumes[i] ?? 0);
            cumV += volumes[i] ?? 0;
          }
          const vwap = cumV > 0 ? cumPV / cumV : 0;
          const signal = last > vwap ? "BULLISH (price above VWAP)" : "BEARISH (price below VWAP)";
          steps.push(`VWAP (Volume-Weighted Average Price):`);
          steps.push(`  VWAP: ${vwap.toFixed(4)}`);
          steps.push(`  Current price: ${last}`);
          steps.push(`  Above VWAP = institutional buying, Below = selling`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `VWAP=${vwap.toFixed(4)}`, indicator: "vwap", values: { vwap, price_vs_vwap: last > vwap ? "above" : "below" }, signal, steps, message: `VWAP = ${vwap.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // Ichimoku Cloud
        // ================================================================
        case "ichimoku": {
          const convP = 9, baseP = 26, spanP = 52;
          if (n < spanP) return { success: false, result: "", indicator: "ichimoku", steps, message: `Need at least ${spanP} data points` };
          const midpoint = (period: number, idx: number) => {
            let hh = -Infinity, ll = Infinity;
            for (let j = idx - period + 1; j <= idx; j++) { hh = Math.max(hh, highs[j]!); ll = Math.min(ll, lows[j]!); }
            return (hh + ll) / 2;
          };
          const conversionLine = midpoint(convP, n - 1);
          const baseLine = midpoint(baseP, n - 1);
          const leadA = (conversionLine + baseLine) / 2;
          const leadB = midpoint(spanP, n - 1);
          const lagSpan = closes[n - 1 - baseP] ?? 0;
          const cloudTop = Math.max(leadA, leadB);
          const cloudBottom = Math.min(leadA, leadB);
          const signal = last > cloudTop ? "BULLISH (above cloud)" : last < cloudBottom ? "BEARISH (below cloud)" : "NEUTRAL (inside cloud)";
          steps.push(`Ichimoku Cloud (9, 26, 52):`);
          steps.push(`  Conversion (Tenkan): ${conversionLine.toFixed(2)}`);
          steps.push(`  Base (Kijun): ${baseLine.toFixed(2)}`);
          steps.push(`  Leading Span A (Senkou A): ${leadA.toFixed(2)}`);
          steps.push(`  Leading Span B (Senkou B): ${leadB.toFixed(2)}`);
          steps.push(`  Cloud: ${cloudBottom.toFixed(2)} - ${cloudTop.toFixed(2)}`);
          steps.push(`  Lagging (Chikou): ${lagSpan.toFixed(2)}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `Tenkan=${conversionLine.toFixed(2)}, Kijun=${baseLine.toFixed(2)}, Cloud=[${cloudBottom.toFixed(2)}, ${cloudTop.toFixed(2)}]`, indicator: "ichimoku", values: { conversion: conversionLine, base: baseLine, lead_a: leadA, lead_b: leadB, cloud_top: cloudTop, cloud_bottom: cloudBottom }, signal, steps, message: `Ichimoku: ${signal}` };
        }

        // ================================================================
        // Williams %R
        // ================================================================
        case "williams_r": {
          const period = params.period;
          if (n < period) return { success: false, result: "", indicator: "williams_r", steps, message: `Need at least ${period} data points` };
          let hh = -Infinity, ll = Infinity;
          for (let i = n - period; i < n; i++) { hh = Math.max(hh, highs[i]!); ll = Math.min(ll, lows[i]!); }
          const wr = hh === ll ? -50 : ((hh - last) / (hh - ll)) * -100;
          const signal = wr < -80 ? "BUY (oversold)" : wr > -20 ? "SELL (overbought)" : "NEUTRAL";
          steps.push(`Williams %R (${period}):`);
          steps.push(`  Current: ${wr.toFixed(2)}`);
          steps.push(`  <-80 = oversold (buy), >-20 = overbought (sell)`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `Williams %R=${wr.toFixed(2)}`, indicator: "williams_r", values: { williams_r: wr }, signal, steps, message: `Williams %R = ${wr.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // CCI — Commodity Channel Index
        // ================================================================
        case "cci": {
          const period = params.period;
          if (n < period) return { success: false, result: "", indicator: "cci", steps, message: `Need at least ${period} data points` };
          const tp: number[] = [];
          for (let i = 0; i < n; i++) tp.push((highs[i]! + lows[i]! + closes[i]!) / 3);
          const smaTP = sma(tp, period);
          const currentSMA = smaTP[n - 1]!;
          let meanDev = 0;
          for (let i = n - period; i < n; i++) meanDev += Math.abs(tp[i]! - currentSMA);
          meanDev /= period;
          const cci = meanDev === 0 ? 0 : (tp[n - 1]! - currentSMA) / (0.015 * meanDev);
          const signal = cci > 100 ? "SELL (overbought)" : cci < -100 ? "BUY (oversold)" : "NEUTRAL";
          steps.push(`CCI (${period}):`);
          steps.push(`  Current CCI: ${cci.toFixed(2)}`);
          steps.push(`  >100 = overbought, <-100 = oversold`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `CCI=${cci.toFixed(2)}`, indicator: "cci", values: { cci }, signal, steps, message: `CCI = ${cci.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // ROC — Rate of Change
        // ================================================================
        case "roc": {
          const period = params.period;
          if (n < period + 1) return { success: false, result: "", indicator: "roc", steps, message: `Need at least ${period + 1} data points` };
          const past = closes[n - 1 - period]!;
          const roc = ((last - past) / past) * 100;
          const signal = roc > 0 ? "BULLISH (positive momentum)" : "BEARISH (negative momentum)";
          steps.push(`Rate of Change (${period}):`);
          steps.push(`  Current: ${roc.toFixed(2)}%`);
          steps.push(`  Price ${period} periods ago: ${past}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `ROC=${roc.toFixed(2)}%`, indicator: "roc", values: { roc, past_price: past }, signal, steps, message: `ROC = ${roc.toFixed(2)}% — ${signal}` };
        }

        // ================================================================
        // MFI — Money Flow Index (volume-weighted RSI)
        // ================================================================
        case "mfi": {
          const period = params.period;
          if (n < period + 1 || volumes.length === 0) return { success: false, result: "", indicator: "mfi", steps, message: `Need ${period + 1} closes, highs, lows, and volumes` };
          const tp: number[] = [];
          const mf: number[] = [];
          for (let i = 0; i < n; i++) {
            const t = (highs[i]! + lows[i]! + closes[i]!) / 3;
            tp.push(t);
            mf.push(t * (volumes[i] ?? 0));
          }
          const posMF: number[] = [];
          const negMF: number[] = [];
          for (let i = 1; i < n; i++) {
            if (tp[i]! > tp[i - 1]!) { posMF.push(mf[i]!); negMF.push(0); }
            else { posMF.push(0); negMF.push(mf[i]!); }
          }
          let posSum = 0, negSum = 0;
          for (let i = posMF.length - period; i < posMF.length; i++) {
            posSum += posMF[i]!;
            negSum += negMF[i]!;
          }
          const mfr = negSum === 0 ? 100 : posSum / negSum;
          const mfi = 100 - 100 / (1 + mfr);
          const signal = mfi > 80 ? "SELL (overbought)" : mfi < 20 ? "BUY (oversold)" : "NEUTRAL";
          steps.push(`Money Flow Index (${period}):`);
          steps.push(`  Current MFI: ${mfi.toFixed(2)}`);
          steps.push(`  >80 = overbought (sell), <20 = oversold (buy)`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `MFI=${mfi.toFixed(2)}`, indicator: "mfi", values: { mfi }, signal, steps, message: `MFI = ${mfi.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // Fibonacci Retracement
        // ================================================================
        case "fibonacci": {
          const high = params.high_52 ?? Math.max(...highs);
          const low = params.low_52 ?? Math.min(...lows);
          const diff = high - low;
          const levels = {
            "0% (high)": high,
            "23.6%": high - 0.236 * diff,
            "38.2%": high - 0.382 * diff,
            "50%": high - 0.5 * diff,
            "61.8%": high - 0.618 * diff,
            "78.6%": high - 0.786 * diff,
            "100% (low)": low,
          };
          // Find nearest level
          let nearest = "0% (high)";
          let minDist = Infinity;
          for (const [label, val] of Object.entries(levels)) {
            const dist = Math.abs(last - val);
            if (dist < minDist) { minDist = dist; nearest = label; }
          }
          const signal = last > levels["61.8%"]! ? "BULLISH (above 61.8% retracement)" : last < levels["38.2%"]! ? "BEARISH (below 38.2% retracement)" : "NEUTRAL (in retracement zone)";
          steps.push(`Fibonacci Retracement:`);
          steps.push(`  High: ${high.toFixed(2)}, Low: ${low.toFixed(2)}`);
          for (const [label, val] of Object.entries(levels)) {
            steps.push(`  ${label}: ${val.toFixed(2)}`);
          }
          steps.push(`  Current price: ${last} (near ${nearest})`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `Fib: nearest=${nearest} (${(levels as any)[nearest].toFixed(2)})`, indicator: "fibonacci", values: { ...levels, nearest, current_price: last }, signal, steps, message: `Fibonacci: near ${nearest} — ${signal}` };
        }

        // ================================================================
        // Parabolic SAR
        // ================================================================
        case "parabolic_sar": {
          if (n < 3) return { success: false, result: "", indicator: "parabolic_sar", steps, message: "Need at least 3 data points" };
          const afStep = 0.02;
          const afMax = 0.2;
          let af = afStep;
          let trend: "up" | "down" = closes[1]! > closes[0]! ? "up" : "down";
          let sar = trend === "up" ? lows[0]! : highs[0]!;
          let ep = trend === "up" ? highs[1]! : lows[1]!;
          const sarVals: number[] = [sar];
          for (let i = 2; i < n; i++) {
            if (trend === "up") {
              sar = sar + af * (ep - sar);
              if (lows[i]! < sar) {
                trend = "down";
                sar = ep;
                ep = lows[i]!;
                af = afStep;
              } else {
                if (highs[i]! > ep) { ep = highs[i]!; af = Math.min(af + afStep, afMax); }
              }
            } else {
              sar = sar + af * (ep - sar);
              if (highs[i]! > sar) {
                trend = "up";
                sar = ep;
                ep = highs[i]!;
                af = afStep;
              } else {
                if (lows[i]! < ep) { ep = lows[i]!; af = Math.min(af + afStep, afMax); }
              }
            }
            sarVals.push(sar);
          }
          const currentSAR = sarVals[sarVals.length - 1]!;
          const signal = trend === "up" ? "BUY (uptrend, SAR below price)" : "SELL (downtrend, SAR above price)";
          steps.push(`Parabolic SAR (0.02, 0.2):`);
          steps.push(`  Current SAR: ${currentSAR.toFixed(4)}`);
          steps.push(`  Trend: ${trend}`);
          steps.push(`  Current price: ${last}`);
          steps.push(`  Signal: ${signal}`);
          steps.push(`  Stop loss suggestion: ${currentSAR.toFixed(2)}`);
          return { success: true, result: `SAR=${currentSAR.toFixed(4)}, trend=${trend}`, indicator: "parabolic_sar", values: { sar: currentSAR, trend }, signal, steps, message: `PSAR: ${signal}, stop at ${currentSAR.toFixed(2)}` };
        }

        // ================================================================
        // Pivot Points
        // ================================================================
        case "pivot_points": {
          const prevHigh = highs[n - 2] ?? Math.max(...highs);
          const prevLow = lows[n - 2] ?? Math.min(...lows);
          const prevClose = closes[n - 2] ?? last;
          const pivot = (prevHigh + prevLow + prevClose) / 3;
          const r1 = 2 * pivot - prevLow;
          const s1 = 2 * pivot - prevHigh;
          const r2 = pivot + (prevHigh - prevLow);
          const s2 = pivot - (prevHigh - prevLow);
          const r3 = prevHigh + 2 * (pivot - prevLow);
          const s3 = prevLow - 2 * (prevHigh - pivot);
          const signal = last > r1 ? "BULLISH (above R1)" : last < s1 ? "BEARISH (below S1)" : "NEUTRAL (between S1 and R1)";
          steps.push(`Pivot Points:`);
          steps.push(`  R3: ${r3.toFixed(2)}`);
          steps.push(`  R2: ${r2.toFixed(2)}`);
          steps.push(`  R1: ${r1.toFixed(2)}`);
          steps.push(`  Pivot: ${pivot.toFixed(2)}`);
          steps.push(`  S1: ${s1.toFixed(2)}`);
          steps.push(`  S2: ${s2.toFixed(2)}`);
          steps.push(`  S3: ${s3.toFixed(2)}`);
          steps.push(`  Current price: ${last}`);
          steps.push(`  Signal: ${signal}`);
          return { success: true, result: `Pivot=${pivot.toFixed(2)}, R1=${r1.toFixed(2)}, S1=${s1.toFixed(2)}`, indicator: "pivot_points", values: { pivot, r1, r2, r3, s1, s2, s3 }, signal, steps, message: `Pivot=${pivot.toFixed(2)} — ${signal}` };
        }

        // ================================================================
        // ALL — Calculate key indicators together
        // ================================================================
        case "all": {
          const results: Record<string, any> = {};
          const signals: string[] = [];
          steps.push(`=== COMPREHENSIVE TECHNICAL ANALYSIS ===`);
          steps.push(`Data points: ${n}, Current price: ${last}`);
          steps.push("");

          // RSI
          if (n > 15) {
            const gains: number[] = [];
            const losses: number[] = [];
            for (let i = 1; i < n; i++) { const d = closes[i]! - closes[i - 1]!; gains.push(Math.max(0, d)); losses.push(Math.max(0, -d)); }
            const ag = wilderSmooth(gains, 14);
            const al = wilderSmooth(losses, 14);
            const rsi = al[al.length - 1]! === 0 ? 100 : 100 - 100 / (1 + ag[ag.length - 1]! / al[al.length - 1]!);
            results.rsi = rsi;
            const sig = rsi > 70 ? "SELL" : rsi < 30 ? "BUY" : "NEUTRAL";
            signals.push(sig);
            steps.push(`RSI(14): ${rsi.toFixed(2)} → ${sig}`);
          }

          // MACD
          if (n > 35) {
            const ef = ema(closes, 12);
            const es = ema(closes, 26);
            const macdLine = ef[n - 1]! - es[n - 1]!;
            const macdArr: number[] = [];
            for (let i = 0; i < n; i++) macdArr.push(ef[i]! - es[i]!);
            const sigLine = ema(macdArr, 9);
            const sig = macdLine > sigLine[n - 1]! ? "BUY" : "SELL";
            results.macd = macdLine;
            results.macd_signal = sigLine[n - 1]!;
            signals.push(sig);
            steps.push(`MACD: ${macdLine.toFixed(4)} vs ${sigLine[n - 1]!.toFixed(4)} → ${sig}`);
          }

          // Bollinger
          if (n > 20) {
            const sma20 = sma(closes, 20)[n - 1]!;
            let v = 0;
            for (let i = n - 20; i < n; i++) v += (closes[i]! - sma20) ** 2;
            v /= 20;
            const sd = Math.sqrt(v);
            const upper = sma20 + 2 * sd;
            const lower = sma20 - 2 * sd;
            const pctB = (last - lower) / (upper - lower);
            results.bollinger = { upper, middle: sma20, lower, pct_b: pctB };
            const sig = pctB > 1 ? "SELL" : pctB < 0 ? "BUY" : "NEUTRAL";
            signals.push(sig);
            steps.push(`Bollinger: %B=${pctB.toFixed(2)} → ${sig}`);
          }

          // SMA-50 and SMA-200
          let s50 = 0;
          if (n >= 50) {
            s50 = sma(closes, 50)[n - 1]!;
            results.sma_50 = s50;
            const sig = last > s50 ? "BUY" : "SELL";
            signals.push(sig);
            steps.push(`SMA-50: ${s50.toFixed(2)} → ${sig}`);
          }
          if (n >= 200) {
            const s200 = sma(closes, 200)[n - 1]!;
            results.sma_200 = s200;
            const golden = s50 > s200;
            const sig = last > s200 ? "BUY" : "SELL";
            signals.push(sig);
            steps.push(`SMA-200: ${s200.toFixed(2)} → ${sig}`);
            steps.push(`Golden Cross: ${golden ? "YES (bullish)" : "NO"}`);
          }

          // ATR
          if (n > 15) {
            const tr = trueRange(highs, lows, closes);
            const atr = wilderSmooth(tr.slice(1), 14)[13]!;
            results.atr = atr;
            results.atr_pct = (atr / last) * 100;
            steps.push(`ATR(14): ${atr.toFixed(4)} (${((atr / last) * 100).toFixed(2)}% volatility)`);
          }

          // OBV
          if (volumes.length > 0) {
            let obv = 0;
            for (let i = 1; i < n; i++) {
              if (closes[i]! > closes[i - 1]!) obv += volumes[i] ?? 0;
              else if (closes[i]! < closes[i - 1]!) obv -= volumes[i] ?? 0;
            }
            results.obv = obv;
            steps.push(`OBV: ${obv.toLocaleString()}`);
          }

          // Consensus
          const buyCount = signals.filter((s) => s === "BUY").length;
          const sellCount = signals.filter((s) => s === "SELL").length;
          const neutralCount = signals.filter((s) => s === "NEUTRAL").length;
          const consensus = buyCount > sellCount + 1 ? "STRONG BUY" : buyCount > sellCount ? "BUY" : sellCount > buyCount + 1 ? "STRONG SELL" : sellCount > buyCount ? "SELL" : "NEUTRAL";
          steps.push("");
          steps.push(`=== CONSENSUS: ${consensus} ===`);
          steps.push(`  Buy: ${buyCount}, Sell: ${sellCount}, Neutral: ${neutralCount}`);

          return { success: true, result: `Consensus: ${consensus}`, indicator: "all", values: results, signal: consensus, steps, message: `Technical analysis: ${consensus} (${buyCount}B/${sellCount}S/${neutralCount}N)` };
        }

        default:
          return { success: false, result: "", indicator: params.indicator, steps, message: "Unknown indicator. Use 'list' to see all." };
      }
    } catch (e: any) {
      return { success: false, result: "", indicator: params.indicator, steps, message: e.message ?? String(e) };
    }
  },
};
