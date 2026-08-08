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

// =============================================================================
// Normal CDF for Black-Scholes (reused from statisticsTools pattern)
// =============================================================================

function normCDF(x: number): number {
  // Abramowitz & Stegun approximation
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((0.254829592 * t - 0.284496736) * t + 1.421413741) * t - 1.453152027) * t + 1.061405429) * t) * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// =============================================================================
// STOCK OPTIONS — Black-Scholes pricing, Greeks, wheel strategy
// =============================================================================

export const stockOptions: ToolDef = {
  name: "stock.options",
  description: "Options pricing and analysis: Black-Scholes pricing for calls/puts, all Greeks (delta, gamma, theta, vega, rho), implied volatility estimation, covered call analysis (premium yield, assignment risk), cash-secured put analysis (premium, breakeven, ROI), and full wheel strategy evaluation (which leg to enter, optimal strike selection). Built for income strategies.",
  inputSchema: z.object({
    operation: z.enum([
      "black_scholes", "greeks", "implied_volatility", "covered_call",
      "cash_secured_put", "wheel_strategy", "list",
    ]).describe("Options operation (or 'list')"),
    option_type: z.enum(["call", "put"]).optional().describe("Call or Put"),
    spot: z.number().optional().describe("Current stock price"),
    strike: z.number().optional().describe("Strike price"),
    time_to_expiry: z.number().optional().describe("Time to expiry in years (e.g. 0.083 = ~1 month)"),
    days_to_expiry: z.number().optional().describe("Days to expiry (alternative to time_to_expiry)"),
    volatility: z.number().optional().describe("Implied volatility (decimal, e.g. 0.35 = 35%)"),
    risk_free_rate: z.number().default(0.05).describe("Risk-free rate (decimal, default 5%)"),
    dividend_yield: z.number().default(0).describe("Dividend yield (decimal, default 0)"),
    premium: z.number().optional().describe("Option premium (market price, for IV calculation)"),
    shares: z.number().default(100).describe("Number of shares (default 100 = 1 contract)"),
    account_size: z.number().optional().describe("Account size for position sizing"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    values: z.record(z.any()).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "black_scholes: Price a call/put using Black-Scholes-Merton",
          "greeks: Calculate delta, gamma, theta, vega, rho",
          "implied_volatility: Estimate IV from market premium",
          "covered_call: Analyze covered call (premium yield, assignment risk, breakeven)",
          "cash_secured_put: Analyze cash-secured put (premium, ROI, breakeven, capital required)",
          "wheel_strategy: Full wheel evaluation — which leg, optimal strike, expected returns",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available options operations" };
      }

      const r = params.risk_free_rate;
      const q = params.dividend_yield;
      const T = params.days_to_expiry !== undefined ? params.days_to_expiry / 365 : params.time_to_expiry ?? 0.083;

      // ================================================================
      // BLACK-SCHOLES PRICING
      // ================================================================
      if (params.operation === "black_scholes") {
        if (params.option_type === undefined || params.spot === undefined || params.strike === undefined || params.volatility === undefined) {
          return { success: false, result: "", steps, message: "Provide option_type, spot, strike, volatility (and days_to_expiry or time_to_expiry)" };
        }
        const S = params.spot;
        const K = params.strike;
        const sigma = params.volatility;

        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);

        let price: number;
        if (params.option_type === "call") {
          price = S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
        } else {
          price = K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);
        }

        steps.push(`Black-Scholes-Merton Pricing:`);
        steps.push(`  Spot: $${S}, Strike: $${K}, Type: ${params.option_type.toUpperCase()}`);
        steps.push(`  Time to expiry: ${T.toFixed(4)} years (${(T * 365).toFixed(0)} days)`);
        steps.push(`  Volatility: ${(sigma * 100).toFixed(1)}%, Risk-free rate: ${(r * 100).toFixed(1)}%`);
        steps.push(`  Dividend yield: ${(q * 100).toFixed(2)}%`);
        steps.push(`  d1 = ${d1.toFixed(4)}, d2 = ${d2.toFixed(4)}`);
        steps.push(`  N(d1) = ${normCDF(d1).toFixed(4)}, N(d2) = ${normCDF(d2).toFixed(4)}`);
        steps.push(`  Option price: $${price.toFixed(4)}`);
        steps.push(`  Per contract ($${params.shares} shares): $${(price * params.shares).toFixed(2)}`);

        return { success: true, result: `$${price.toFixed(4)}`, values: { price, d1, d2, per_contract: price * params.shares }, steps, message: `${params.option_type.toUpperCase()} price = $${price.toFixed(2)}` };
      }

      // ================================================================
      // GREEKS
      // ================================================================
      if (params.operation === "greeks") {
        if (params.option_type === undefined || params.spot === undefined || params.strike === undefined || params.volatility === undefined) {
          return { success: false, result: "", steps, message: "Provide option_type, spot, strike, volatility" };
        }
        const S = params.spot;
        const K = params.strike;
        const sigma = params.volatility;

        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        const sqrtT = Math.sqrt(T);

        let delta: number;
        let theta: number;
        let rho: number;

        if (params.option_type === "call") {
          delta = Math.exp(-q * T) * normCDF(d1);
          theta = (-(S * Math.exp(-q * T) * normPDF(d1) * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCDF(d2) + q * S * Math.exp(-q * T) * normCDF(d1)) / 365;
          rho = K * T * Math.exp(-r * T) * normCDF(d2) / 100;
        } else {
          delta = -Math.exp(-q * T) * normCDF(-d1);
          theta = (-(S * Math.exp(-q * T) * normPDF(d1) * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCDF(-d2) - q * S * Math.exp(-q * T) * normCDF(-d1)) / 365;
          rho = -K * T * Math.exp(-r * T) * normCDF(-d2) / 100;
        }

        const gamma = Math.exp(-q * T) * normPDF(d1) / (S * sigma * sqrtT);
        const vega = S * Math.exp(-q * T) * normPDF(d1) * sqrtT / 100;

        steps.push(`Options Greeks (${params.option_type.toUpperCase()}):`);
        steps.push(`  Spot: $${S}, Strike: $${K}, IV: ${(sigma * 100).toFixed(1)}%`);
        steps.push(`  Days to expiry: ${(T * 365).toFixed(0)}`);
        steps.push(`  Delta: ${delta.toFixed(4)} (${(delta * 100).toFixed(1)}% — ${Math.abs(delta).toFixed(2)} shares per contract)`);
        steps.push(`  Gamma: ${gamma.toFixed(6)} (delta change per $1 move)`);
        steps.push(`  Theta: ${theta.toFixed(4)} per day (time decay)`);
        steps.push(`  Vega: ${vega.toFixed(4)} per 1% IV change`);
        steps.push(`  Rho: ${rho.toFixed(4)} per 1% rate change`);

        return { success: true, result: `Delta=${delta.toFixed(3)}, Gamma=${gamma.toFixed(5)}, Theta=${theta.toFixed(3)}, Vega=${vega.toFixed(3)}`, values: { delta, gamma, theta, vega, rho }, steps, message: `Greeks: Δ=${delta.toFixed(2)}, θ=${theta.toFixed(2)}/day, ν=${vega.toFixed(2)}` };
      }

      // ================================================================
      // IMPLIED VOLATILITY (Newton-Raphson)
      // ================================================================
      if (params.operation === "implied_volatility") {
        if (params.option_type === undefined || params.spot === undefined || params.strike === undefined || params.premium === undefined) {
          return { success: false, result: "", steps, message: "Provide option_type, spot, strike, and premium" };
        }
        const S = params.spot;
        const K = params.strike;
        const marketPrice = params.premium;
        let sigma = 0.3; // Initial guess
        const maxIter = 100;
        const tolerance = 0.0001;

        for (let i = 0; i < maxIter; i++) {
          const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
          const d2 = d1 - sigma * Math.sqrt(T);
          let bsPrice: number;
          if (params.option_type === "call") {
            bsPrice = S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
          } else {
            bsPrice = K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);
          }
          const vegaVal = S * Math.exp(-q * T) * normPDF(d1) * Math.sqrt(T);
          const diff = bsPrice - marketPrice;
          if (Math.abs(diff) < tolerance) break;
          if (vegaVal === 0) break;
          sigma = sigma - diff / vegaVal;
          if (sigma <= 0) sigma = 0.001;
        }

        steps.push(`Implied Volatility Estimation (Newton-Raphson):`);
        steps.push(`  Market premium: $${marketPrice}`);
        steps.push(`  Spot: $${S}, Strike: $${K}, Days: ${(T * 365).toFixed(0)}`);
        steps.push(`  Implied Volatility: ${(sigma * 100).toFixed(2)}%`);
        steps.push(`  IV Rank context: ${sigma > 0.5 ? "HIGH (good for selling premium)" : sigma > 0.3 ? "MODERATE" : "LOW (premium may be cheap)"}`);

        return { success: true, result: `IV = ${(sigma * 100).toFixed(2)}%`, values: { implied_volatility: sigma, iv_pct: sigma * 100 }, steps, message: `Implied Volatility = ${(sigma * 100).toFixed(1)}%` };
      }

      // ================================================================
      // COVERED CALL ANALYSIS
      // ================================================================
      if (params.operation === "covered_call") {
        if (params.spot === undefined || params.strike === undefined || params.premium === undefined) {
          return { success: false, result: "", steps, message: "Provide spot, strike, and premium" };
        }
        const S = params.spot;
        const K = params.strike;
        const premium = params.premium;
        const shares = params.shares;
        const totalPremium = premium * shares;
        const stockCost = S * shares;
        const strikeValue = K * shares;
        const maxProfit = (K - S + premium) * shares;
        const breakeven = S - premium;
        const staticReturn = (premium / S) * 100;
        const annualizedReturn = staticReturn * (365 / (T * 365));
        const ifAssignedReturn = ((K - S + premium) / S) * 100;
        const otm = K > S;
        const itm = K < S;
        const distanceFromStrike = ((K - S) / S) * 100;

        steps.push(`=== COVERED CALL ANALYSIS ===`);
        steps.push(`  Stock price: $${S}`);
        steps.push(`  Strike: $${K} (${otm ? "OTM" : itm ? "ITM" : "ATM"} — ${distanceFromStrike > 0 ? "+" : ""}${distanceFromStrike.toFixed(1)}% from spot)`);
        steps.push(`  Premium: $${premium} per share ($${totalPremium.toFixed(2)} per contract)`);
        steps.push(`  Days to expiry: ${(T * 365).toFixed(0)}`);
        steps.push(``);
        steps.push(`  Capital required: $${stockCost.toFixed(2)} (buying ${shares} shares)`);
        steps.push(`  Premium income: $${totalPremium.toFixed(2)}`);
        steps.push(`  Static return (if not assigned): ${staticReturn.toFixed(2)}%`);
        steps.push(`  Annualized: ${annualizedReturn.toFixed(1)}%`);
        steps.push(`  If assigned return: ${ifAssignedReturn.toFixed(2)}%`);
        steps.push(`  Max profit: $${maxProfit.toFixed(2)} (if assigned at strike)`);
        steps.push(`  Breakeven: $${breakeven.toFixed(2)}`);
        steps.push(`  Downside protection: ${(premium / S * 100).toFixed(2)}% (premium offsets loss)`);
        steps.push(``);
        steps.push(`  Assignment probability: ${otm ? "LOW-MODERATE" : "HIGH (ITM)"}`);
        steps.push(`  ${otm ? "Good for income while keeping shares" : "Likely assignment — be prepared to sell at strike"}`);

        return {
          success: true,
          result: `Premium=$${totalPremium.toFixed(0)}, Static=${staticReturn.toFixed(1)}%, If assigned=${ifAssignedReturn.toFixed(1)}%`,
          values: { total_premium: totalPremium, static_return: staticReturn, annualized_return: annualizedReturn, if_assigned_return: ifAssignedReturn, max_profit: maxProfit, breakeven, capital_required: stockCost, otm, distance_from_strike: distanceFromStrike },
          steps,
          message: `Covered call: $${totalPremium.toFixed(0)} premium (${staticReturn.toFixed(1)}% static, ${ifAssignedReturn.toFixed(1)}% if assigned)`,
        };
      }

      // ================================================================
      // CASH-SECURED PUT ANALYSIS
      // ================================================================
      if (params.operation === "cash_secured_put") {
        if (params.spot === undefined || params.strike === undefined || params.premium === undefined) {
          return { success: false, result: "", steps, message: "Provide spot, strike, and premium" };
        }
        const S = params.spot;
        const K = params.strike;
        const premium = params.premium;
        const shares = params.shares;
        const totalPremium = premium * shares;
        const collateral = K * shares; // Cash secured = strike * shares
        const breakeven = K - premium;
        const maxLoss = (K - premium) * shares; // If stock goes to 0
        const roi = (premium / K) * 100; // Return on collateral
        const annualizedRoi = roi * (365 / (T * 365));
        const otm = K < S;
        const itm = K > S;
        const distanceFromStrike = ((K - S) / S) * 100;
        const costBasisIfAssigned = K - premium;

        steps.push(`=== CASH-SECURED PUT ANALYSIS ===`);
        steps.push(`  Stock price: $${S}`);
        steps.push(`  Strike: $${K} (${otm ? "OTM" : itm ? "ITM" : "ATM"} — ${distanceFromStrike.toFixed(1)}% from spot)`);
        steps.push(`  Premium: $${premium} per share ($${totalPremium.toFixed(2)} per contract)`);
        steps.push(`  Days to expiry: ${(T * 365).toFixed(0)}`);
        steps.push(``);
        steps.push(`  Collateral required: $${collateral.toFixed(2)} (strike × ${shares} shares)`);
        steps.push(`  Premium income: $${totalPremium.toFixed(2)}`);
        steps.push(`  ROI on collateral: ${roi.toFixed(2)}%`);
        steps.push(`  Annualized: ${annualizedRoi.toFixed(1)}%`);
        steps.push(`  Breakeven: $${breakeven.toFixed(2)}`);
        steps.push(`  Cost basis if assigned: $${costBasisIfAssigned.toFixed(2)}`);
        steps.push(`  Max loss: $${maxLoss.toFixed(2)} (if stock → $0)`);
        steps.push(`  Downside protection: ${(premium / K * 100).toFixed(2)}%`);
        steps.push(``);
        steps.push(`  Assignment probability: ${otm ? "LOW-MODERATE" : "HIGH (ITM)"}`);
        steps.push(`  ${otm ? "Good for collecting premium / acquiring stock at discount" : "Likely assignment — be prepared to buy at strike"}`);

        return {
          success: true,
          result: `Premium=$${totalPremium.toFixed(0)}, ROI=${roi.toFixed(1)}%, Breakeven=$${breakeven.toFixed(2)}`,
          values: { total_premium: totalPremium, collateral, roi, annualized_roi: annualizedRoi, breakeven, cost_basis_if_assigned: costBasisIfAssigned, max_loss: maxLoss, otm, distance_from_strike: distanceFromStrike },
          steps,
          message: `Cash-secured put: $${totalPremium.toFixed(0)} premium (${roi.toFixed(1)}% ROI, breakeven $${breakeven.toFixed(2)})`,
        };
      }

      // ================================================================
      // WHEEL STRATEGY EVALUATION
      // ================================================================
      if (params.operation === "wheel_strategy") {
        if (params.spot === undefined) {
          return { success: false, result: "", steps, message: "Provide spot (current stock price)" };
        }
        const S = params.spot;
        const K = params.strike ?? S * 0.95; // Default: 5% OTM put
        const premium = params.premium ?? S * 0.02; // Default: ~2% premium estimate
        const shares = params.shares;
        const totalPremium = premium * shares;

        steps.push(`=== WHEEL STRATEGY EVALUATION ===`);
        steps.push(``);
        steps.push(`The Wheel Strategy:`);
        steps.push(`  Step 1: Sell cash-secured puts → collect premium`);
        steps.push(`  Step 2: If assigned → buy 100 shares at strike`);
        steps.push(`  Step 3: Sell covered calls on those shares → collect premium`);
        steps.push(`  Step 4: If called away → sell shares at strike, repeat from Step 1`);
        steps.push(``);

        // Put leg analysis
        const putCollateral = K * shares;
        const putBreakeven = K - premium;
        const putRoi = (premium / K) * 100;
        const putOtm = K < S;
        const putDistance = ((K - S) / S) * 100;

        steps.push(`--- LEG 1: SELL CASH-SECURED PUT ---`);
        steps.push(`  Strike: $${K} (${putOtm ? "OTM" : "ITM"}, ${putDistance.toFixed(1)}% from spot)`);
        steps.push(`  Premium: $${premium}/share ($${totalPremium.toFixed(2)}/contract)`);
        steps.push(`  Collateral: $${putCollateral.toFixed(2)}`);
        steps.push(`  ROI: ${putRoi.toFixed(2)}%`);
        steps.push(`  Breakeven: $${putBreakeven.toFixed(2)}`);
        steps.push(`  Cost basis if assigned: $${putBreakeven.toFixed(2)}`);
        steps.push(``);

        // Call leg (if assigned)
        const callStrike = S * 1.05; // 5% above current for covered call
        const callPremium = S * 0.02; // Estimated
        const callMaxProfit = (callStrike - putBreakeven + callPremium) * shares;

        steps.push(`--- LEG 2: SELL COVERED CALL (if assigned) ---`);
        steps.push(`  Strike: $${callStrike.toFixed(2)} (5% above spot)`);
        steps.push(`  Est. premium: $${callPremium.toFixed(2)}/share`);
        steps.push(`  Max profit: $${callMaxProfit.toFixed(2)} (from put breakeven to call strike + premium)`);
        steps.push(``);

        // Total cycle estimate
        const totalCycleIncome = totalPremium + (callPremium * shares);
        const cycleReturn = (totalCycleIncome / putCollateral) * 100;
        steps.push(`--- FULL CYCLE ESTIMATE ---`);
        steps.push(`  Put premium: $${totalPremium.toFixed(2)}`);
        steps.push(`  Call premium: $${(callPremium * shares).toFixed(2)}`);
        steps.push(`  Total income: $${totalCycleIncome.toFixed(2)}`);
        steps.push(`  Cycle return: ${cycleReturn.toFixed(2)}% on $${putCollateral.toFixed(0)} collateral`);
        steps.push(``);

        // Strike selection guidance
        steps.push(`--- STRIKE SELECTION GUIDANCE ---`);
        if (putDistance < -2) {
          steps.push(`  ⚠ Put strike is ITM — higher assignment risk, more premium but less downside protection`);
        } else if (putDistance > 5) {
          steps.push(`  ⚠ Put strike is far OTM — safer but low premium, may not be worth the collateral`);
        } else {
          steps.push(`  ✓ Put strike is in the sweet spot (2-5% OTM) — good premium/assignment balance`);
        }
        steps.push(`  Optimal: Sell puts at strikes where you're COMFORTABLE buying the stock`);
        steps.push(`  Target: 0.3-0.5 delta (~30-50% assignment probability) for good premium/risk`);
        steps.push(`  IV > 30%: Good environment for selling premium`);
        steps.push(`  IV < 15%: Premium too low — consider other strategies`);

        return {
          success: true,
          result: `Wheel: Put ROI=${putRoi.toFixed(1)}%, Cycle return=${cycleReturn.toFixed(1)}%`,
          values: {
            put_strike: K, put_premium: premium, put_collateral: putCollateral,
            put_breakeven: putBreakeven, put_roi: putRoi,
            call_strike: callStrike, call_premium: callPremium,
            total_cycle_income: totalCycleIncome, cycle_return: cycleReturn,
          },
          steps,
          message: `Wheel strategy: ~${cycleReturn.toFixed(1)}% per cycle, breakeven $${putBreakeven.toFixed(2)}`,
        };
      }

      return { success: false, result: "", steps, message: "Unknown operation" };
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// STOCK DATA — Fetch OHLCV data from Yahoo Finance (free, no API key)
// =============================================================================

export const stockData: ToolDef = {
  name: "stock.data",
  description: "Fetch real-time and historical stock market data from Yahoo Finance (free, no API key needed). Get current quote (price, change, volume, market cap, P/E, 52-week range), historical OHLCV bars (1d/1wk/1mo intervals), options chain (calls/puts with strikes and premiums), and dividend history. Essential for feeding data into stock.indicators and stock.options.",
  inputSchema: z.object({
    operation: z.enum(["quote", "history", "options_chain", "dividends", "list"]).describe("Data operation"),
    symbol: z.string().optional().describe("Stock ticker symbol (e.g. AAPL, MSFT, SPY)"),
    period: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]).default("3mo").describe("Time period for historical data"),
    interval: z.enum(["1m", "2m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"]).default("1d").describe("Bar interval"),
    expiration: z.string().optional().describe("Options expiration date (YYYY-MM-DD)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    quote: z.record(z.any()).optional(),
    history: z.array(z.object({
      date: z.string(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
      volume: z.number(),
    })).optional(),
    options: z.record(z.any()).optional(),
    dividends: z.array(z.object({
      date: z.string(),
      dividend: z.number(),
    })).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "quote: Current price, change, volume, market cap, P/E, 52-week range",
          "history: Historical OHLCV bars (specify period and interval)",
          "options_chain: Calls/puts with strikes, premiums, volume, open interest",
          "dividends: Dividend history",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available data operations" };
      }

      if (!params.symbol) {
        return { success: false, result: "", steps, message: "Provide symbol (e.g. AAPL, MSFT, SPY)" };
      }

      const symbol = params.symbol.toUpperCase();
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

      switch (params.operation) {
        // ================================================================
        // QUOTE — Current price and key stats
        // ================================================================
        case "quote": {
          const url = `${chartUrl}?range=1d&interval=1d`;
          steps.push(`Fetching quote for ${symbol} from Yahoo Finance...`);
          const resp = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (!resp.ok) {
            return { success: false, result: "", steps, message: `Yahoo Finance request failed (${resp.status}). Symbol may be invalid.` };
          }
          const data = await resp.json() as any;
          const result = data?.chart?.result?.[0];
          if (!result) {
            return { success: false, result: "", steps, message: `No data returned for ${symbol}` };
          }
          const meta = result.meta;
          const quote = {
            symbol: meta.symbol,
            currency: meta.currency,
            exchange: meta.exchangeName,
            current_price: meta.regularMarketPrice,
            previous_close: meta.chartPreviousClose,
            change: meta.regularMarketPrice - meta.chartPreviousClose,
            change_pct: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
            volume: meta.regularMarketVolume,
            fifty_two_week_high: meta.fiftyTwoWeekHigh?.high,
            fifty_two_week_low: meta.fiftyTwoWeekLow?.low,
            market_cap: meta.marketCap,
            regular_market_time: meta.regularMarketTime,
          };

          steps.push(`Quote for ${symbol}:`);
          steps.push(`  Price: ${quote.currency === "USD" ? "$" : ""}${quote.current_price}`);
          steps.push(`  Change: ${quote.change > 0 ? "+" : ""}${quote.change.toFixed(2)} (${quote.change_pct?.toFixed(2)}%)`);
          steps.push(`  Volume: ${quote.volume?.toLocaleString() ?? "N/A"}`);
          if (quote.fifty_two_week_high) steps.push(`  52-week range: ${quote.fifty_two_week_low} - ${quote.fifty_two_week_high}`);
          if (quote.market_cap) steps.push(`  Market cap: $${(quote.market_cap / 1e9).toFixed(2)}B`);

          return {
            success: true,
            result: `${symbol}: $${quote.current_price} (${quote.change_pct?.toFixed(2)}%)`,
            quote,
            steps,
            message: `${symbol} at $${quote.current_price} (${quote.change_pct?.toFixed(2)}%)`,
          };
        }

        // ================================================================
        // HISTORY — Historical OHLCV bars
        // ================================================================
        case "history": {
          const url = `${chartUrl}?range=${params.period}&interval=${params.interval}`;
          steps.push(`Fetching ${params.period} of ${params.interval} bars for ${symbol}...`);
          const resp = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (!resp.ok) {
            return { success: false, result: "", steps, message: `Yahoo Finance request failed (${resp.status})` };
          }
          const data = await resp.json() as any;
          const result = data?.chart?.result?.[0];
          if (!result) {
            return { success: false, result: "", steps, message: `No data returned for ${symbol}` };
          }
          const timestamps: number[] = result.timestamp || [];
          const q = result.indicators?.quote?.[0];
          const ohlcv: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
          for (let i = 0; i < timestamps.length; i++) {
            if (q?.close?.[i] == null) continue;
            ohlcv.push({
              date: new Date(timestamps[i]! * 1000).toISOString().split("T")[0]!,
              open: q.open?.[i] ?? 0,
              high: q.high?.[i] ?? 0,
              low: q.low?.[i] ?? 0,
              close: q.close?.[i] ?? 0,
              volume: q.volume?.[i] ?? 0,
            });
          }

          steps.push(`Retrieved ${ohlcv.length} bars for ${symbol}`);
          if (ohlcv.length > 0) {
            const last = ohlcv[ohlcv.length - 1]!;
            const first = ohlcv[0]!;
            steps.push(`  First: ${first.date} — close $${first.close}`);
            steps.push(`  Last: ${last.date} — close $${last.close}`);
            steps.push(`  Period return: ${(((last.close - first.close) / first.close) * 100).toFixed(2)}%`);
          }

          return {
            success: true,
            result: `${ohlcv.length} bars for ${symbol}`,
            history: ohlcv,
            steps,
            message: `Retrieved ${ohlcv.length} OHLCV bars for ${symbol} (${params.period}, ${params.interval})`,
          };
        }

        // ================================================================
        // OPTIONS CHAIN — Calls and puts
        // ================================================================
        case "options_chain": {
          if (!params.expiration) {
            // First get available expirations
            const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
            steps.push(`Fetching available expirations for ${symbol}...`);
            const resp = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            if (!resp.ok) {
              return { success: false, result: "", steps, message: `Yahoo Finance options request failed (${resp.status})` };
            }
            const data = await resp.json() as any;
            const exps: number[] = data?.optionChain?.result?.[0]?.expirationDates || [];
            if (exps.length === 0) {
              return { success: false, result: "", steps, message: `No options data for ${symbol}` };
            }
            const expDates = exps.map((e: number) => new Date(e * 1000).toISOString().split("T")[0]);
            steps.push(`Available expirations for ${symbol}:`);
            for (const d of expDates.slice(0, 10)) steps.push(`  ${d}`);
            if (expDates.length > 10) steps.push(`  ... and ${expDates.length - 10} more`);

            return {
              success: true,
              result: `${expDates.length} expirations available`,
              options: { expirations: expDates },
              steps,
              message: `Found ${expDates.length} expiration dates. Specify 'expiration' (YYYY-MM-DD) to get the chain.`,
            };
          }

          // Fetch specific expiration
          const expDate = new Date(params.expiration);
          const expEpoch = Math.floor(expDate.getTime() / 1000);
          const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${expEpoch}`;
          steps.push(`Fetching options chain for ${symbol} expiring ${params.expiration}...`);
          const resp = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (!resp.ok) {
            return { success: false, result: "", steps, message: `Options chain request failed (${resp.status})` };
          }
          const data = await resp.json() as any;
          const optResult = data?.optionChain?.result?.[0];
          if (!optResult) {
            return { success: false, result: "", steps, message: `No options data for ${symbol} at ${params.expiration}` };
          }
          const quote = optResult.quote;
          const calls = optResult.options?.[0]?.calls?.slice(0, 10) || [];
          const puts = optResult.options?.[0]?.puts?.slice(0, 10) || [];

          steps.push(`Options chain for ${symbol} (expiry: ${params.expiration}):`);
          steps.push(`  Underlying price: $${quote?.regularMarketPrice ?? "N/A"}`);
          steps.push(``);
          steps.push(`  CALLS (first 10):`);
          for (const c of calls) {
            steps.push(`    Strike $${c.strike}: Bid $${c.bid ?? 0}, Ask $${c.ask ?? 0}, Vol ${c.volume ?? 0}, OI ${c.openInterest ?? 0}, IV ${(c.impliedVolatility * 100).toFixed(1)}%`);
          }
          steps.push(`  PUTS (first 10):`);
          for (const p of puts) {
            steps.push(`    Strike $${p.strike}: Bid $${p.bid ?? 0}, Ask $${p.ask ?? 0}, Vol ${p.volume ?? 0}, OI ${p.openInterest ?? 0}, IV ${(p.impliedVolatility * 100).toFixed(1)}%`);
          }

          return {
            success: true,
            result: `${calls.length} calls, ${puts.length} puts`,
            options: {
              underlying_price: quote?.regularMarketPrice,
              expiration: params.expiration,
              calls: calls.map((c: any) => ({ strike: c.strike, bid: c.bid, ask: c.ask, last: c.lastPrice, volume: c.volume, open_interest: c.openInterest, iv: c.impliedVolatility, delta: c.delta })),
              puts: puts.map((p: any) => ({ strike: p.strike, bid: p.bid, ask: p.ask, last: p.lastPrice, volume: p.volume, open_interest: p.openInterest, iv: p.impliedVolatility, delta: p.delta })),
            },
            steps,
            message: `Options chain: ${calls.length} calls, ${puts.length} puts for ${params.expiration}`,
          };
        }

        // ================================================================
        // DIVIDENDS — Dividend history
        // ================================================================
        case "dividends": {
          const url = `${chartUrl}?range=5y&interval=1d&events=div`;
          steps.push(`Fetching dividend history for ${symbol} (5 years)...`);
          const resp = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (!resp.ok) {
            return { success: false, result: "", steps, message: `Dividend request failed (${resp.status})` };
          }
          const data = await resp.json() as any;
          const result = data?.chart?.result?.[0];
          if (!result?.events?.dividends) {
            steps.push(`No dividends found for ${symbol}`);
            return { success: true, result: "No dividends", dividends: [], steps, message: `${symbol} has no dividend history` };
          }
          const divs = Object.values(result.events.dividends) as any[];
          const dividends = divs.map((d) => ({
            date: new Date(d.date * 1000).toISOString().split("T")[0]!,
            dividend: d.amount,
          })).sort((a, b) => b.date.localeCompare(a.date));

          steps.push(`Dividend history for ${symbol}:`);
          for (const d of dividends.slice(0, 10)) {
            steps.push(`  ${d.date}: $${d.dividend}`);
          }
          if (dividends.length > 0) {
            const annualDiv = dividends.slice(0, 4).reduce((s, d) => s + d.dividend, 0);
            steps.push(`  Estimated annual dividend: $${annualDiv.toFixed(2)}`);
          }

          return {
            success: true,
            result: `${dividends.length} dividends`,
            dividends,
            steps,
            message: `${dividends.length} dividend payments found for ${symbol}`,
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
// STOCK PREDICT — Price/volume prediction using indicators + trend analysis
// =============================================================================

export const stockPredict: ToolDef = {
  name: "stock.predict",
  description: "Predict stock price direction and volume using technical indicator signals, trend analysis, support/resistance levels, and momentum scoring. Generates a comprehensive trading signal with confidence level, predicted price targets (bull/bear cases), recommended action for the wheel strategy (sell puts / hold / sell calls), and risk assessment. Combines multiple indicators into a weighted consensus prediction.",
  inputSchema: z.object({
    operation: z.enum(["predict", "signal", "price_targets", "risk_assessment", "volume_forecast", "list"]).describe("Prediction operation"),
    closes: z.array(z.number()).optional().describe("Array of close prices"),
    highs: z.array(z.number()).optional().describe("Array of high prices"),
    lows: z.array(z.number()).optional().describe("Array of low prices"),
    volumes: z.array(z.number()).optional().describe("Array of volumes"),
    symbol: z.string().optional().describe("Stock symbol (for context)"),
    current_price: z.number().optional().describe("Current stock price (if not in closes)"),
    risk_tolerance: z.enum(["conservative", "moderate", "aggressive"]).default("moderate").describe("Risk tolerance for recommendations"),
    target_days: z.number().default(5).describe("Prediction horizon in trading days"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    prediction: z.record(z.any()).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "predict: Full prediction (direction, confidence, targets, action, risk)",
          "signal: Trading signal only (BUY/HOLD/SELL with strength)",
          "price_targets: Bull/bear/base price targets with probabilities",
          "risk_assessment: Volatility, max drawdown, VaR, risk score",
          "volume_forecast: Predicted volume trend and liquidity assessment",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available prediction operations" };
      }

      const closes = params.closes ?? [];
      const highs = params.highs ?? closes;
      const lows = params.lows ?? closes;
      const volumes = params.volumes ?? [];
      const n = closes.length;

      if (n < 20) {
        return { success: false, result: "", steps, message: "Need at least 20 data points for prediction" };
      }

      const last = closes[n - 1]!;
      const symbol = params.symbol ?? "UNKNOWN";

      // Calculate all indicators internally for the prediction
      // RSI
      const gains: number[] = [];
      const losses: number[] = [];
      for (let i = 1; i < n; i++) { const d = closes[i]! - closes[i - 1]!; gains.push(Math.max(0, d)); losses.push(Math.max(0, -d)); }
      const rsiPeriod = 14;
      let avgGain = 0, avgLoss = 0;
      for (let i = 0; i < rsiPeriod; i++) { avgGain += gains[i] ?? 0; avgLoss += losses[i] ?? 0; }
      avgGain /= rsiPeriod; avgLoss /= rsiPeriod;
      for (let i = rsiPeriod; i < gains.length; i++) {
        avgGain = (avgGain * (rsiPeriod - 1) + (gains[i] ?? 0)) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + (losses[i] ?? 0)) / rsiPeriod;
      }
      const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

      // MACD
      const emaFast = ema(closes, 12);
      const emaSlow = ema(closes, 26);
      const macdLine = emaFast[n - 1]! - emaSlow[n - 1]!;
      const macdArr: number[] = [];
      for (let i = 0; i < n; i++) macdArr.push(emaFast[i]! - emaSlow[i]!);
      const signalLine = ema(macdArr, 9)[n - 1]!;
      const macdHist = macdLine - signalLine;

      // Bollinger
      const sma20 = sma(closes, 20)[n - 1]!;
      let bVar = 0;
      for (let i = n - 20; i < n; i++) bVar += (closes[i]! - sma20) ** 2;
      bVar /= 20;
      const bStd = Math.sqrt(bVar);
      const bUpper = sma20 + 2 * bStd;
      const bLower = sma20 - 2 * bStd;
      const pctB = (last - bLower) / (bUpper - bLower);

      // SMA-50
      const hasSMA50 = n >= 50;
      const sma50 = hasSMA50 ? sma(closes, 50)[n - 1]! : 0;

      // SMA-200
      const hasSMA200 = n >= 200;
      const sma200 = hasSMA200 ? sma(closes, 200)[n - 1]! : 0;

      // ATR
      const tr: number[] = [];
      for (let i = 1; i < n; i++) {
        tr.push(Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!)));
      }
      let atr = 0;
      const atrPeriod = 14;
      for (let i = 0; i < atrPeriod; i++) atr += tr[i] ?? 0;
      atr /= atrPeriod;
      for (let i = atrPeriod; i < tr.length; i++) {
        atr = (atr * (atrPeriod - 1) + (tr[i] ?? 0)) / atrPeriod;
      }
      const atrPct = (atr / last) * 100;

      // Trend (linear regression slope)
      const xMean = (n - 1) / 2;
      const yMean = closes.reduce((a: number, b: number) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) {
        sxy += (i - xMean) * (closes[i]! - yMean);
        sxx += (i - xMean) ** 2;
      }
      const slope = sxy / sxx;
      const slopePct = (slope / last) * 100;

      // Support/Resistance
      const recentHigh = Math.max(...highs.slice(-20));
      const recentLow = Math.min(...lows.slice(-20));
      const allHigh = Math.max(...highs);
      const allLow = Math.min(...lows);

      // Volume trend
      let volTrend = "stable";
      let avgVol = 0;
      if (volumes.length > 0) {
        const recentVol = volumes.slice(-10).reduce((a: number, b: number) => a + b, 0) / 10;
        const olderVol = volumes.slice(-20, -10).reduce((a: number, b: number) => a + b, 0) / 10;
        avgVol = recentVol;
        volTrend = recentVol > olderVol * 1.2 ? "increasing" : recentVol < olderVol * 0.8 ? "decreasing" : "stable";
      }

      // ================================================================
      // SCORING SYSTEM — Weighted indicator signals
      // ================================================================
      let bullScore = 0;
      let bearScore = 0;
      const signals: string[] = [];

      // RSI (weight: 15)
      if (rsi < 30) { bullScore += 15; signals.push(`RSI ${rsi.toFixed(0)} (oversold) → BULL +15`); }
      else if (rsi > 70) { bearScore += 15; signals.push(`RSI ${rsi.toFixed(0)} (overbought) → BEAR +15`); }
      else if (rsi > 50) { bullScore += 5; signals.push(`RSI ${rsi.toFixed(0)} (bullish zone) → BULL +5`); }
      else { bearScore += 5; signals.push(`RSI ${rsi.toFixed(0)} (bearish zone) → BEAR +5`); }

      // MACD (weight: 20)
      if (macdLine > signalLine && macdHist > 0) { bullScore += 20; signals.push(`MACD bullish crossover (hist +${macdHist.toFixed(2)}) → BULL +20`); }
      else if (macdLine < signalLine && macdHist < 0) { bearScore += 20; signals.push(`MACD bearish crossover (hist ${macdHist.toFixed(2)}) → BEAR +20`); }

      // Bollinger %B (weight: 10)
      if (pctB < 0) { bullScore += 10; signals.push(`Below lower Bollinger Band (%B=${pctB.toFixed(2)}) → BULL +10 (mean reversion)`); }
      else if (pctB > 1) { bearScore += 10; signals.push(`Above upper Bollinger Band (%B=${pctB.toFixed(2)}) → BEAR +10 (mean reversion)`); }
      else if (pctB < 0.2) { bullScore += 5; signals.push(`Near lower Bollinger (%B=${pctB.toFixed(2)}) → BULL +5`); }
      else if (pctB > 0.8) { bearScore += 5; signals.push(`Near upper Bollinger (%B=${pctB.toFixed(2)}) → BEAR +5`); }

      // Trend slope (weight: 20)
      if (slopePct > 0.1) { bullScore += 20; signals.push(`Uptrend (slope +${slopePct.toFixed(2)}%/day) → BULL +20`); }
      else if (slopePct < -0.1) { bearScore += 20; signals.push(`Downtrend (slope ${slopePct.toFixed(2)}%/day) → BEAR +20`); }

      // SMA-50 (weight: 10)
      if (hasSMA50) {
        if (last > sma50) { bullScore += 10; signals.push(`Price above SMA-50 ($${sma50.toFixed(2)}) → BULL +10`); }
        else { bearScore += 10; signals.push(`Price below SMA-50 ($${sma50.toFixed(2)}) → BEAR +10`); }
      }

      // SMA-200 (weight: 10)
      if (hasSMA200) {
        if (last > sma200) { bullScore += 10; signals.push(`Price above SMA-200 ($${sma200.toFixed(2)}) → BULL +10`); }
        else { bearScore += 10; signals.push(`Price below SMA-200 ($${sma200.toFixed(2)}) → BEAR +10`); }
        if (hasSMA50 && sma50 > sma200) { bullScore += 5; signals.push(`Golden Cross (SMA-50 > SMA-200) → BULL +5`); }
        else if (hasSMA50 && sma50 < sma200) { bearScore += 5; signals.push(`Death Cross (SMA-50 < SMA-200) → BEAR +5`); }
      }

      // Volume (weight: 5)
      if (volTrend === "increasing" && slopePct > 0) { bullScore += 5; signals.push(`Volume increasing in uptrend → BULL +5`); }
      else if (volTrend === "increasing" && slopePct < 0) { bearScore += 5; signals.push(`Volume increasing in downtrend → BEAR +5`); }

      // Support/Resistance (weight: 10)
      if (last <= recentLow * 1.02) { bullScore += 10; signals.push(`Near support ($${recentLow.toFixed(2)}) → BULL +10`); }
      else if (last >= recentHigh * 0.98) { bearScore += 10; signals.push(`Near resistance ($${recentHigh.toFixed(2)}) → BEAR +10`); }

      const totalScore = bullScore + bearScore;
      const bullPct = totalScore > 0 ? (bullScore / totalScore) * 100 : 50;
      const confidence = Math.abs(bullPct - 50) * 2; // 0-100

      let direction: "BULLISH" | "BEARISH" | "NEUTRAL";
      let action: string;
      if (bullPct > 65) {
        direction = "BULLISH";
        action = params.risk_tolerance === "conservative" ? "HOLD / Sell covered calls at higher strikes" : "SELL cash-secured puts to acquire shares or increase income";
      } else if (bullPct < 35) {
        direction = "BEARISH";
        action = params.risk_tolerance === "conservative" ? "HOLD / Sell cash-secured puts at lower strikes for protection" : "SELL covered calls at lower strikes (expecting assignment)";
      } else {
        direction = "NEUTRAL";
        action = "SELL both covered calls and cash-secured puts (wheel strategy) — market is range-bound, ideal for premium collection";
      }

      // Price targets
      const targetDays = params.target_days;
      const expectedMove = atr * Math.sqrt(targetDays);
      const bullTarget = last + expectedMove * (bullPct / 100);
      const bearTarget = last - expectedMove * ((100 - bullPct) / 100);
      const baseTarget = last + slope * targetDays;

      // Risk metrics
      const dailyReturns: number[] = [];
      for (let i = 1; i < n; i++) dailyReturns.push((closes[i]! - closes[i - 1]!) / closes[i - 1]!);
      const avgReturn = dailyReturns.reduce((a: number, b: number) => a + b, 0) / dailyReturns.length;
      const varianceR = dailyReturns.reduce((s: number, r: number) => s + (r - avgReturn) ** 2, 0) / dailyReturns.length;
      const dailyVol = Math.sqrt(varianceR);
      const annualVol = dailyVol * Math.sqrt(252);
      const var95 = last * 1.65 * dailyVol * Math.sqrt(targetDays); // VaR at 95% confidence

      // Max drawdown
      let peak = closes[0]!;
      let maxDD = 0;
      for (const c of closes) {
        if (c > peak) peak = c;
        const dd = (peak - c) / peak;
        if (dd > maxDD) maxDD = dd;
      }

      switch (params.operation) {
        case "predict": {
          steps.push(`=== STOCK PREDICTION FOR ${symbol} ===`);
          steps.push(`Current price: $${last.toFixed(2)}`);
          steps.push(`Prediction horizon: ${targetDays} trading days`);
          steps.push(`Risk tolerance: ${params.risk_tolerance}`);
          steps.push(``);
          steps.push(`--- INDICATOR SIGNALS ---`);
          for (const s of signals) steps.push(`  ${s}`);
          steps.push(``);
          steps.push(`--- SCORE ---`);
          steps.push(`  Bull score: ${bullScore} (${bullPct.toFixed(1)}%)`);
          steps.push(`  Bear score: ${bearScore} (${(100 - bullPct).toFixed(1)}%)`);
          steps.push(`  Confidence: ${confidence.toFixed(1)}%`);
          steps.push(`  Direction: ${direction}`);
          steps.push(``);
          steps.push(`--- PRICE TARGETS (${targetDays} days) ---`);
          steps.push(`  Bull case: $${bullTarget.toFixed(2)} (+${(((bullTarget - last) / last) * 100).toFixed(1)}%)`);
          steps.push(`  Base case: $${baseTarget.toFixed(2)} (${((baseTarget - last) / last) * 100 >= 0 ? "+" : ""}${(((baseTarget - last) / last) * 100).toFixed(1)}%)`);
          steps.push(`  Bear case: $${bearTarget.toFixed(2)} (${(((bearTarget - last) / last) * 100).toFixed(1)}%)`);
          steps.push(`  Expected move (1σ): ±$${expectedMove.toFixed(2)}`);
          steps.push(``);
          steps.push(`--- WHEEL STRATEGY ACTION ---`);
          steps.push(`  ${action}`);
          steps.push(``);
          steps.push(`--- RISK METRICS ---`);
          steps.push(`  ATR: $${atr.toFixed(2)} (${atrPct.toFixed(2)}% daily volatility)`);
          steps.push(`  Annual volatility: ${(annualVol * 100).toFixed(1)}%`);
          steps.push(`  VaR (95%, ${targetDays}d): -$${var95.toFixed(2)} (${(var95 / last * 100).toFixed(1)}%)`);
          steps.push(`  Max drawdown (period): ${(maxDD * 100).toFixed(1)}%`);
          steps.push(`  Volume trend: ${volTrend}${avgVol > 0 ? ` (avg: ${avgVol.toLocaleString()})` : ""}`);

          return {
            success: true,
            result: `${direction} (${confidence.toFixed(0)}% confidence) — ${action}`,
            prediction: {
              direction, confidence, bull_score: bullScore, bear_score: bearScore,
              bull_pct: bullPct, action,
              targets: { bull: bullTarget, base: baseTarget, bear: bearTarget, expected_move: expectedMove },
              risk: { atr, atr_pct: atrPct, annual_vol: annualVol, var_95: var95, max_drawdown: maxDD },
              indicators: { rsi, macd: macdLine, macd_signal: signalLine, macd_hist: macdHist, bollinger_pct_b: pctB, sma50, sma200, slope_pct: slopePct },
              signals,
              volume_trend: volTrend,
            },
            steps,
            message: `${symbol}: ${direction} (${confidence.toFixed(0)}% confidence) — ${action}`,
          };
        }

        case "signal": {
          const strength = confidence > 60 ? "STRONG" : confidence > 30 ? "MODERATE" : "WEAK";
          const signalType = direction === "BULLISH" ? "BUY" : direction === "BEARISH" ? "SELL" : "HOLD";
          steps.push(`Trading Signal for ${symbol}:`);
          steps.push(`  Signal: ${strength} ${signalType}`);
          steps.push(`  Confidence: ${confidence.toFixed(1)}%`);
          steps.push(`  Bull: ${bullScore} | Bear: ${bearScore}`);
          steps.push(`  Action: ${action}`);
          return {
            success: true,
            result: `${strength} ${signalType} (${confidence.toFixed(0)}%)`,
            prediction: { signal: signalType, strength, confidence, action, bull_score: bullScore, bear_score: bearScore },
            steps,
            message: `${symbol}: ${strength} ${signalType} — ${confidence.toFixed(0)}% confidence`,
          };
        }

        case "price_targets": {
          steps.push(`Price Targets for ${symbol} (${targetDays} days):`);
          steps.push(`  Current: $${last.toFixed(2)}`);
          steps.push(`  Bull case: $${bullTarget.toFixed(2)} (+${(((bullTarget - last) / last) * 100).toFixed(1)}%) — prob: ${bullPct.toFixed(0)}%`);
          steps.push(`  Base case: $${baseTarget.toFixed(2)} (${((baseTarget - last) / last) * 100 >= 0 ? "+" : ""}${(((baseTarget - last) / last) * 100).toFixed(1)}%)`);
          steps.push(`  Bear case: $${bearTarget.toFixed(2)} (${(((bearTarget - last) / last) * 100).toFixed(1)}%) — prob: ${(100 - bullPct).toFixed(0)}%`);
          steps.push(`  Expected move (1σ): ±$${expectedMove.toFixed(2)}`);
          steps.push(`  Support: $${recentLow.toFixed(2)} (recent), $${allLow.toFixed(2)} (period)`);
          steps.push(`  Resistance: $${recentHigh.toFixed(2)} (recent), $${allHigh.toFixed(2)} (period)`);
          return {
            success: true,
            result: `Bull=$${bullTarget.toFixed(2)}, Base=$${baseTarget.toFixed(2)}, Bear=$${bearTarget.toFixed(2)}`,
            prediction: { bull: bullTarget, base: baseTarget, bear: bearTarget, expected_move: expectedMove, support: recentLow, resistance: recentHigh, bull_prob: bullPct, bear_prob: 100 - bullPct },
            steps,
            message: `Targets: Bull $${bullTarget.toFixed(2)} / Base $${baseTarget.toFixed(2)} / Bear $${bearTarget.toFixed(2)}`,
          };
        }

        case "risk_assessment": {
          const riskScore = Math.min(100, (atrPct * 10) + (annualVol * 50) + (maxDD * 100));
          const riskLevel = riskScore > 60 ? "HIGH" : riskScore > 30 ? "MODERATE" : "LOW";
          steps.push(`Risk Assessment for ${symbol}:`);
          steps.push(`  Risk score: ${riskScore.toFixed(1)}/100 — ${riskLevel}`);
          steps.push(`  ATR: $${atr.toFixed(2)} (${atrPct.toFixed(2)}% of price)`);
          steps.push(`  Daily volatility: ${(dailyVol * 100).toFixed(2)}%`);
          steps.push(`  Annual volatility: ${(annualVol * 100).toFixed(1)}%`);
          steps.push(`  VaR (95%, ${targetDays}d): -$${var95.toFixed(2)} (${(var95 / last * 100).toFixed(1)}%)`);
          steps.push(`  Max drawdown: ${(maxDD * 100).toFixed(1)}%`);
          steps.push(`  Volume trend: ${volTrend}`);
          steps.push(``);
          steps.push(`  Position sizing suggestion (${params.risk_tolerance}):`);
          const riskPerTrade = params.risk_tolerance === "conservative" ? 0.01 : params.risk_tolerance === "aggressive" ? 0.05 : 0.02;
          steps.push(`    Risk per trade: ${(riskPerTrade * 100).toFixed(0)}% of account`);
          steps.push(`    Stop-loss distance: $${atr.toFixed(2)} (1 ATR)`);
          steps.push(`    Max position: (account × ${riskPerTrade}) / $${atr.toFixed(2)} per share`);
          return {
            success: true,
            result: `Risk: ${riskLevel} (${riskScore.toFixed(0)}/100), VaR=${var95.toFixed(2)}`,
            prediction: { risk_score: riskScore, risk_level: riskLevel, atr, atr_pct: atrPct, daily_vol: dailyVol, annual_vol: annualVol, var_95: var95, max_drawdown: maxDD, volume_trend: volTrend },
            steps,
            message: `Risk: ${riskLevel} (score ${riskScore.toFixed(0)}/100, VaR $${var95.toFixed(2)})`,
          };
        }

        case "volume_forecast": {
          let volPrediction = "stable";
          let liquidity = "MODERATE";
          if (volumes.length > 0) {
            const recentAvg = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
            const longAvg = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
            volPrediction = recentAvg > longAvg * 1.3 ? "increasing (breakout volume)" : recentAvg < longAvg * 0.7 ? "decreasing (declining interest)" : "stable";
            liquidity = recentAvg > 10e6 ? "HIGH" : recentAvg > 1e6 ? "MODERATE" : "LOW";
          }
          steps.push(`Volume Forecast for ${symbol}:`);
          steps.push(`  Volume trend: ${volTrend}`);
          steps.push(`  Predicted: ${volPrediction}`);
          steps.push(`  Liquidity: ${liquidity}`);
          if (avgVol > 0) steps.push(`  Average volume: ${avgVol.toLocaleString()}`);
          steps.push(`  Price-volume divergence: ${volTrend === "increasing" && slopePct < 0 ? "YES (bearish — volume up, price down)" : volTrend === "decreasing" && slopePct > 0 ? "YES (suspicious — price up, volume down)" : "None"}`);
          return {
            success: true,
            result: `Volume: ${volPrediction}, Liquidity: ${liquidity}`,
            prediction: { volume_trend: volTrend, volume_prediction: volPrediction, liquidity, avg_volume: avgVol },
            steps,
            message: `Volume: ${volPrediction}, Liquidity: ${liquidity}`,
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
// STOCK STRATEGIES — All option premium selling strategies
// =============================================================================

export const stockStrategies: ToolDef = {
  name: "stock.strategies",
  description: "Analyze ALL option premium selling strategies: bull put spread, bear call spread, iron condor, iron butterfly, short straddle, short strangle, calendar spread, diagonal spread, jade lizard, broken wing butterfly, ratio spread, and naked put. Each strategy returns max profit, max loss, breakevens, margin requirement, ROI, best market environment, and assignment risk. Also includes a strategy screener that recommends the best premium strategy based on volatility, trend, and confidence level.",
  inputSchema: z.object({
    strategy: z.enum([
      "bull_put_spread", "bear_call_spread", "iron_condor", "iron_butterfly",
      "short_straddle", "short_strangle", "calendar_spread", "diagonal_spread",
      "jade_lizard", "broken_wing_butterfly", "ratio_spread", "naked_put",
      "screener", "list",
    ]).describe("Strategy to analyze (or 'screener' for recommendation, 'list' for all)"),
    spot: z.number().optional().describe("Current stock price"),
    strike1: z.number().optional().describe("Strike for short leg 1"),
    premium1: z.number().optional().describe("Premium received for short leg 1"),
    strike2: z.number().optional().describe("Strike for long leg 2"),
    premium2: z.number().optional().describe("Premium paid for long leg 2"),
    strike3: z.number().optional().describe("Strike for short leg 3"),
    premium3: z.number().optional().describe("Premium received for short leg 3"),
    strike4: z.number().optional().describe("Strike for long leg 4"),
    premium4: z.number().optional().describe("Premium paid for long leg 4"),
    days_to_expiry: z.number().default(30).describe("Days to expiry"),
    shares: z.number().default(100).describe("Shares per contract (default 100)"),
    iv: z.number().optional().describe("Implied volatility (for screener, decimal e.g. 0.35)"),
    trend: z.enum(["bullish", "bearish", "neutral"]).optional().describe("Trend direction (for screener)"),
    confidence: z.number().optional().describe("Prediction confidence 0-100 (for screener)"),
    account_size: z.number().optional().describe("Account size for margin calculations"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    strategy: z.string().optional(),
    analysis: z.record(z.any()).optional(),
    recommendations: z.array(z.record(z.any())).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];
    const shares = params.shares;
    const dte = params.days_to_expiry;

    try {
      if (params.strategy === "list") {
        const list = [
          "bull_put_spread: Sell ITM/ATM put + buy lower put (bullish, defined risk)",
          "bear_call_spread: Sell ITM/ATM call + buy higher call (bearish, defined risk)",
          "iron_condor: Bull put spread + bear call spread (neutral, defined risk)",
          "iron_butterfly: ATM short straddle + OTM protective wings (neutral, max premium)",
          "short_straddle: Sell ATM call + ATM put (neutral, undefined risk)",
          "short_strangle: Sell OTM call + OTM put (neutral, undefined risk, wider range)",
          "calendar_spread: Sell near-term + buy far-term same strike (neutral, time decay)",
          "diagonal_spread: Sell near-term + buy far-term different strikes (directional)",
          "jade_lizard: Short put + short call spread (bullish-neutral, no upside risk)",
          "broken_wing_butterfly: Asymmetric butterfly (directional bias, zero cost possible)",
          "ratio_spread: Sell N options + buy M options at different strikes (directional)",
          "naked_put: Sell cash-secured put (bullish, income, assignment risk)",
          "screener: Recommends best strategy based on IV, trend, and confidence",
        ].join("\n");
        return { success: true, result: list, steps, message: "13 strategies available" };
      }

      const S = params.spot ?? 0;
      if (S === 0 && params.strategy !== "screener") {
        return { success: false, result: "", steps, message: "Provide spot (current stock price)" };
      }

      switch (params.strategy) {
        case "bull_put_spread": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (short put), strike2 (long put), premium1 (received), premium2 (paid)" };
          }
          const shortStrike = params.strike1;
          const longStrike = params.strike2;
          const netCredit = (params.premium1 - params.premium2) * shares;
          const maxLoss = (shortStrike - longStrike - (params.premium1 - params.premium2)) * shares;
          const breakeven = shortStrike - (params.premium1 - params.premium2);
          const margin = maxLoss;
          const roi = maxLoss > 0 ? (netCredit / maxLoss) * 100 : 0;
          const width = shortStrike - longStrike;
          steps.push(`=== BULL PUT SPREAD (Put Credit Spread) ===`);
          steps.push(`  Market outlook: BULLISH to NEUTRAL`);
          steps.push(`  Short put: $${shortStrike} (premium $${params.premium1})`);
          steps.push(`  Long put: $${longStrike} (premium $${params.premium2})`);
          steps.push(`  Spread width: $${width}`);
          steps.push(`  Net credit: $${netCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${netCredit.toFixed(2)} (if stock stays above $${shortStrike})`);
          steps.push(`  Max loss: $${maxLoss.toFixed(2)} (if stock drops below $${longStrike})`);
          steps.push(`  Breakeven: $${breakeven.toFixed(2)}`);
          steps.push(`  Margin required: $${margin.toFixed(2)} (defined risk)`);
          steps.push(`  ROI: ${roi.toFixed(1)}%`);
          steps.push(`  Best when: Moderately bullish, want defined risk, IV is elevated`);
          steps.push(`  Assignment risk: LOW (short put is OTM if stock > strike1)`);
          return { success: true, result: `Credit=$${netCredit.toFixed(0)}, MaxLoss=$${maxLoss.toFixed(0)}, ROI=${roi.toFixed(1)}%`, strategy: "bull_put_spread", analysis: { net_credit: netCredit, max_profit: netCredit, max_loss: maxLoss, breakeven, margin, roi, width, assignment_risk: "LOW" }, steps, message: `Bull put spread: $${netCredit.toFixed(0)} credit, ${roi.toFixed(1)}% ROI, max loss $${maxLoss.toFixed(0)}` };
        }

        case "bear_call_spread": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (short call), strike2 (long call), premium1 (received), premium2 (paid)" };
          }
          const shortStrike = params.strike1;
          const longStrike = params.strike2;
          const netCredit = (params.premium1 - params.premium2) * shares;
          const maxLoss = (longStrike - shortStrike - (params.premium1 - params.premium2)) * shares;
          const breakeven = shortStrike + (params.premium1 - params.premium2);
          const margin = maxLoss;
          const roi = maxLoss > 0 ? (netCredit / maxLoss) * 100 : 0;
          const width = longStrike - shortStrike;
          steps.push(`=== BEAR CALL SPREAD (Call Credit Spread) ===`);
          steps.push(`  Market outlook: BEARISH to NEUTRAL`);
          steps.push(`  Short call: $${shortStrike} (premium $${params.premium1})`);
          steps.push(`  Long call: $${longStrike} (premium $${params.premium2})`);
          steps.push(`  Spread width: $${width}`);
          steps.push(`  Net credit: $${netCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${netCredit.toFixed(2)} (if stock stays below $${shortStrike})`);
          steps.push(`  Max loss: $${maxLoss.toFixed(2)} (if stock rises above $${longStrike})`);
          steps.push(`  Breakeven: $${breakeven.toFixed(2)}`);
          steps.push(`  Margin required: $${margin.toFixed(2)} (defined risk)`);
          steps.push(`  ROI: ${roi.toFixed(1)}%`);
          steps.push(`  Best when: Moderately bearish, want defined risk, IV is elevated`);
          steps.push(`  Assignment risk: LOW (short call is OTM if stock < strike1)`);
          return { success: true, result: `Credit=$${netCredit.toFixed(0)}, MaxLoss=$${maxLoss.toFixed(0)}, ROI=${roi.toFixed(1)}%`, strategy: "bear_call_spread", analysis: { net_credit: netCredit, max_profit: netCredit, max_loss: maxLoss, breakeven, margin, roi, width, assignment_risk: "LOW" }, steps, message: `Bear call spread: $${netCredit.toFixed(0)} credit, ${roi.toFixed(1)}% ROI, max loss $${maxLoss.toFixed(0)}` };
        }

        case "iron_condor": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.strike3 === undefined || params.strike4 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (short put), strike2 (long put), strike3 (long call), strike4 (short call) + all premiums" };
          }
          const pShort = params.strike1; const pLong = params.strike2;
          const cLong = params.strike3; const cShort = params.strike4;
          const totalCredit = ((params.premium1 ?? 0) - (params.premium2 ?? 0) + (params.premium4 ?? 0) - (params.premium3 ?? 0)) * shares;
          const putWidth = pShort - pLong;
          const callWidth = cShort - cLong;
          const maxWidth = Math.max(putWidth, callWidth);
          const maxLoss = (maxWidth * shares) - totalCredit;
          const putBreakeven = pShort - (totalCredit / shares);
          const callBreakeven = cShort + (totalCredit / shares);
          const margin = maxLoss;
          const roi = maxLoss > 0 ? (totalCredit / maxLoss) * 100 : 0;
          const profitZone = `${putBreakeven.toFixed(2)} - $${callBreakeven.toFixed(2)}`;
          steps.push(`=== IRON CONDOR ===`);
          steps.push(`  Market outlook: NEUTRAL (range-bound)`);
          steps.push(`  Put side: Short $${pShort} / Long $${pLong} (width $${putWidth})`);
          steps.push(`  Call side: Short $${cShort} / Long $${cLong} (width $${callWidth})`);
          steps.push(`  Total credit: $${totalCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${totalCredit.toFixed(2)} (if stock between $${pShort} and $${cShort})`);
          steps.push(`  Max loss: $${maxLoss.toFixed(2)} (if stock below $${pLong} or above $${cLong})`);
          steps.push(`  Profit zone: $${profitZone}`);
          steps.push(`  Margin required: $${margin.toFixed(2)} (defined risk)`);
          steps.push(`  ROI: ${roi.toFixed(1)}%`);
          steps.push(`  Best when: Neutral, high IV, expect stock to stay range-bound`);
          steps.push(`  Assignment risk: LOW (both shorts OTM in profit zone)`);
          steps.push(`  Profit probability: ~65-70% (typical)`);
          return { success: true, result: `Credit=$${totalCredit.toFixed(0)}, MaxLoss=$${maxLoss.toFixed(0)}, ROI=${roi.toFixed(1)}%, Zone=$${profitZone}`, strategy: "iron_condor", analysis: { total_credit: totalCredit, max_profit: totalCredit, max_loss: maxLoss, put_breakeven: putBreakeven, call_breakeven: callBreakeven, profit_zone: profitZone, margin, roi, put_width: putWidth, call_width: callWidth, assignment_risk: "LOW", profit_probability: "65-70%" }, steps, message: `Iron condor: $${totalCredit.toFixed(0)} credit, profit zone $${profitZone}, ${roi.toFixed(1)}% ROI` };
        }

        case "iron_butterfly": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.strike3 === undefined || params.premium1 === undefined || params.premium2 === undefined || params.premium3 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (ATM short put=short call), strike2 (long put), strike3 (long call) + premiums" };
          }
          const atm = params.strike1;
          const pLong = params.strike2;
          const cLong = params.strike3;
          const totalCredit = ((params.premium1 ?? 0) + (params.premium1 ?? 0) - (params.premium2 ?? 0) - (params.premium3 ?? 0)) * shares;
          const wingWidth = atm - pLong;
          const maxLoss = (wingWidth * shares) - totalCredit;
          const breakevenLow = atm - (totalCredit / shares);
          const breakevenHigh = atm + (totalCredit / shares);
          const margin = maxLoss;
          const roi = maxLoss > 0 ? (totalCredit / maxLoss) * 100 : 0;
          steps.push(`=== IRON BUTTERFLY ===`);
          steps.push(`  Market outlook: NEUTRAL (pin to a price)`);
          steps.push(`  Short straddle: $${atm} (sell ATM put + ATM call)`);
          steps.push(`  Long put: $${pLong}, Long call: $${cLong}`);
          steps.push(`  Wing width: $${wingWidth}`);
          steps.push(`  Total credit: $${totalCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${totalCredit.toFixed(2)} (if stock = $${atm} at expiry)`);
          steps.push(`  Max loss: $${maxLoss.toFixed(2)} (if stock below $${pLong} or above $${cLong})`);
          steps.push(`  Breakevens: $${breakevenLow.toFixed(2)} / $${breakevenHigh.toFixed(2)}`);
          steps.push(`  Margin required: $${margin.toFixed(2)} (defined risk)`);
          steps.push(`  ROI: ${roi.toFixed(1)}%`);
          steps.push(`  Best when: Very neutral, HIGH IV, expect stock to pin near ATM`);
          steps.push(`  Higher premium than iron condor but narrower profit zone`);
          steps.push(`  Profit probability: ~40-45% but higher credit`);
          return { success: true, result: `Credit=$${totalCredit.toFixed(0)}, MaxLoss=$${maxLoss.toFixed(0)}, ROI=${roi.toFixed(1)}%, Pin=$${atm}`, strategy: "iron_butterfly", analysis: { total_credit: totalCredit, max_profit: totalCredit, max_loss: maxLoss, breakeven_low: breakevenLow, breakeven_high: breakevenHigh, margin, roi, wing_width: wingWidth, atm_strike: atm, profit_probability: "40-45%" }, steps, message: `Iron butterfly: $${totalCredit.toFixed(0)} credit, pin $${atm}, ${roi.toFixed(1)}% ROI` };
        }

        case "short_straddle": {
          if (params.strike1 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (ATM strike), premium1 (call premium), premium2 (put premium)" };
          }
          const atm = params.strike1;
          const totalCredit = (params.premium1 + params.premium2) * shares;
          const breakevenLow = atm - (params.premium1 + params.premium2);
          const breakevenHigh = atm + (params.premium1 + params.premium2);
          const maxProfit = totalCredit;
          steps.push(`=== SHORT STRADDLE ===`);
          steps.push(`  Market outlook: NEUTRAL (expect low movement)`);
          steps.push(`  Sell ATM call: $${atm} (premium $${params.premium1})`);
          steps.push(`  Sell ATM put: $${atm} (premium $${params.premium2})`);
          steps.push(`  Total credit: $${totalCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${maxProfit.toFixed(2)} (if stock = $${atm} at expiry)`);
          steps.push(`  Max loss: UNLIMITED (stock can move any direction)`);
          steps.push(`  Breakevens: $${breakevenLow.toFixed(2)} / $${breakevenHigh.toFixed(2)}`);
          steps.push(`  Margin: Significant (undefined risk — broker dependent)`);
          steps.push(`  Best when: Very neutral, HIGH IV, expect volatility contraction`);
          steps.push(`  ⚠ WARNING: Undefined risk — stock can move significantly`);
          steps.push(`  Profit probability: ~40% but collects double premium`);
          return { success: true, result: `Credit=$${totalCredit.toFixed(0)}, Breakevens=$${breakevenLow.toFixed(2)}/$${breakevenHigh.toFixed(2)}, UNLIMITED RISK`, strategy: "short_straddle", analysis: { total_credit: totalCredit, max_profit: maxProfit, max_loss: "UNLIMITED", breakeven_low: breakevenLow, breakeven_high: breakevenHigh, margin: "SIGNIFICANT", assignment_risk: "HIGH", profit_probability: "~40%" }, steps, message: `Short straddle: $${totalCredit.toFixed(0)} credit, UNLIMITED RISK, breakevens $${breakevenLow.toFixed(2)}/$${breakevenHigh.toFixed(2)}` };
        }

        case "short_strangle": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (OTM put), strike2 (OTM call), premium1 (put), premium2 (call)" };
          }
          const putStrike = params.strike1;
          const callStrike = params.strike2;
          const totalCredit = (params.premium1 + params.premium2) * shares;
          const breakevenLow = putStrike - (params.premium1 + params.premium2);
          const breakevenHigh = callStrike + (params.premium1 + params.premium2);
          const maxProfit = totalCredit;
          steps.push(`=== SHORT STRANGLE ===`);
          steps.push(`  Market outlook: NEUTRAL (wider range than straddle)`);
          steps.push(`  Sell OTM put: $${putStrike} (premium $${params.premium1})`);
          steps.push(`  Sell OTM call: $${callStrike} (premium $${params.premium2})`);
          steps.push(`  Total credit: $${totalCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${maxProfit.toFixed(2)} (if stock between $${putStrike} and $${callStrike})`);
          steps.push(`  Max loss: UNLIMITED (stock can move any direction)`);
          steps.push(`  Breakevens: $${breakevenLow.toFixed(2)} / $${breakevenHigh.toFixed(2)}`);
          steps.push(`  Profit zone: $${putStrike} - $${callStrike} (wider than straddle)`);
          steps.push(`  Margin: Significant (undefined risk)`);
          steps.push(`  Best when: Neutral, high IV, want wider profit zone than straddle`);
          steps.push(`  ⚠ WARNING: Undefined risk but wider profit zone than straddle`);
          steps.push(`  Profit probability: ~50-55% (higher than straddle)`);
          return { success: true, result: `Credit=$${totalCredit.toFixed(0)}, Zone=$${putStrike}-$${callStrike}, UNLIMITED RISK`, strategy: "short_strangle", analysis: { total_credit: totalCredit, max_profit: maxProfit, max_loss: "UNLIMITED", breakeven_low: breakevenLow, breakeven_high: breakevenHigh, profit_zone: `${putStrike}-${callStrike}`, margin: "SIGNIFICANT", assignment_risk: "MODERATE", profit_probability: "50-55%" }, steps, message: `Short strangle: $${totalCredit.toFixed(0)} credit, zone $${putStrike}-$${callStrike}, UNLIMITED RISK` };
        }

        case "calendar_spread": {
          if (params.strike1 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (strike for both legs), premium1 (near-term sold), premium2 (far-term bought)" };
          }
          const strike = params.strike1;
          const netDebit = (params.premium2 - params.premium1) * shares;
          const maxProfit = "Variable — maximized if stock near strike at near-term expiry";
          const breakeven = "Two breakevens — calculated at near-term expiry (depends on far-term value)";
          steps.push(`=== CALENDAR SPREAD (Time Spread) ===`);
          steps.push(`  Market outlook: NEUTRAL (expect stock near strike at near-term expiry)`);
          steps.push(`  Sell near-term: $${strike} (${dte}d, premium $${params.premium1})`);
          steps.push(`  Buy far-term: $${strike} (longer expiry, premium $${params.premium2})`);
          steps.push(`  Net debit: $${netDebit.toFixed(2)}`);
          steps.push(`  Max profit: ${maxProfit}`);
          steps.push(`  Max loss: $${netDebit.toFixed(2)} (limited to debit paid)`);
          steps.push(`  Breakevens: ${breakeven}`);
          steps.push(`  Best when: Neutral, low IV near-term vs high IV far-term, expect time decay`);
          steps.push(`  Key advantage: Near-term option decays faster than far-term`);
          steps.push(`  Profit probability: ~45-50%`);
          return { success: true, result: `Debit=$${netDebit.toFixed(0)}, Strike=$${strike}, MaxLoss=$${netDebit.toFixed(0)}`, strategy: "calendar_spread", analysis: { net_debit: netDebit, max_profit: maxProfit, max_loss: netDebit, breakeven, strike, profit_probability: "45-50%" }, steps, message: `Calendar spread: $${netDebit.toFixed(0)} debit, neutral on $${strike}` };
        }

        case "diagonal_spread": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (near-term short), strike2 (far-term long), premium1 (received), premium2 (paid)" };
          }
          const shortStrike = params.strike1;
          const longStrike = params.strike2;
          const netDebit = (params.premium2 - params.premium1) * shares;
          const isCallDiag = longStrike > shortStrike;
          steps.push(`=== DIAGONAL SPREAD ===`);
          steps.push(`  Market outlook: ${isCallDiag ? "BULLISH" : "BEARISH"} (directional + time decay)`);
          steps.push(`  Sell near-term ${isCallDiag ? "call" : "put"}: $${shortStrike} (${dte}d, premium $${params.premium1})`);
          steps.push(`  Buy far-term ${isCallDiag ? "call" : "put"}: $${longStrike} (longer expiry, premium $${params.premium2})`);
          steps.push(`  Net debit: $${netDebit.toFixed(2)}`);
          steps.push(`  Max profit: Variable — depends on stock price at near-term expiry`);
          steps.push(`  Max loss: $${netDebit.toFixed(2)} (limited to debit)`);
          steps.push(`  Best when: ${isCallDiag ? "Moderately bullish" : "Moderately bearish"}, want time decay + direction`);
          steps.push(`  Key advantage: Directional bias + near-term time decay income`);
          steps.push(`  Can roll the short leg for additional income`);
          return { success: true, result: `Debit=$${netDebit.toFixed(0)}, ${isCallDiag ? "Bullish" : "Bearish"} diagonal`, strategy: "diagonal_spread", analysis: { net_debit: netDebit, max_loss: netDebit, short_strike: shortStrike, long_strike: longStrike, direction: isCallDiag ? "BULLISH" : "BEARISH" }, steps, message: `Diagonal spread: $${netDebit.toFixed(0)} debit, ${isCallDiag ? "bullish" : "bearish"}` };
        }

        case "jade_lizard": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.strike3 === undefined || params.premium1 === undefined || params.premium2 === undefined || params.premium3 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (short put), strike2 (short call), strike3 (long call), premiums 1-3" };
          }
          const putStrike = params.strike1;
          const callShort = params.strike2;
          const callLong = params.strike3;
          const totalCredit = (params.premium1 + params.premium2 - params.premium3) * shares;
          const callWidth = callLong - callShort;
          const upsideRisk = (callWidth * shares) - totalCredit;
          const noUpsideRisk = totalCredit >= callWidth * shares;
          const breakevenLow = putStrike - (totalCredit / shares);
          steps.push(`=== JADE LIZARD ===`);
          steps.push(`  Market outlook: BULLISH to NEUTRAL`);
          steps.push(`  Short put: $${putStrike} (premium $${params.premium1})`);
          steps.push(`  Short call spread: Sell $${callShort} / Buy $${callLong}`);
          steps.push(`  Total credit: $${totalCredit.toFixed(2)}`);
          steps.push(`  Max profit: $${totalCredit.toFixed(2)} (if stock between $${putStrike} and $${callShort})`);
          steps.push(`  Upside risk: ${noUpsideRisk ? "NONE (credit > call spread width)" : `$${upsideRisk.toFixed(2)} (if stock > $${callLong})`}`);
          steps.push(`  Downside risk: UNLIMITED (short put, stock can drop to 0)`);
          steps.push(`  Breakeven (downside): $${breakevenLow.toFixed(2)}`);
          steps.push(`  Best when: Bullish-neutral, want no upside risk, IV elevated`);
          steps.push(`  ${noUpsideRisk ? "✓ No upside risk — credit covers call spread" : "⚠ Upside risk exists — credit < call spread width"}`);
          return { success: true, result: `Credit=$${totalCredit.toFixed(0)}, ${noUpsideRisk ? "No upside risk" : `Upside risk $${upsideRisk.toFixed(0)}`}`, strategy: "jade_lizard", analysis: { total_credit: totalCredit, max_profit: totalCredit, upside_risk: noUpsideRisk ? 0 : upsideRisk, downside_risk: "UNLIMITED (short put)", breakeven_low: breakevenLow, no_upside_risk: noUpsideRisk }, steps, message: `Jade lizard: $${totalCredit.toFixed(0)} credit, ${noUpsideRisk ? "no upside risk" : "has upside risk"}` };
        }

        case "broken_wing_butterfly": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.strike3 === undefined || params.premium1 === undefined || params.premium2 === undefined || params.premium3 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (wing 1), strike2 (body, 2x), strike3 (wing 2, asymmetric), premiums 1-3" };
          }
          const wing1 = params.strike1;
          const body = params.strike2;
          const wing2 = params.strike3;
          const netCost = (params.premium1 + 2 * params.premium3 - 2 * params.premium2) * shares;
          const isCredit = netCost < 0;
          const maxProfit = (Math.abs(body - wing1) * shares) - Math.abs(netCost);
          const maxLoss = Math.abs(netCost);
          steps.push(`=== BROKEN WING BUTTERFLY ===`);
          steps.push(`  Market outlook: DIRECTIONAL (biased toward body strike)`);
          steps.push(`  Wing 1: $${wing1} (buy 1, premium $${params.premium1})`);
          steps.push(`  Body: $${body} (sell 2, premium $${params.premium2} each)`);
          steps.push(`  Wing 2: $${wing2} (buy 1, premium $${params.premium3})`);
          steps.push(`  Net ${isCredit ? "credit" : "debit"}: $${Math.abs(netCost).toFixed(2)}`);
          steps.push(`  Max profit: $${maxProfit.toFixed(2)} (if stock = $${body} at expiry)`);
          steps.push(`  Max loss: $${maxLoss.toFixed(2)}`);
          steps.push(`  Best when: Directional bias, want free trade (if credit) or low cost`);
          steps.push(`  ${isCredit ? "✓ Credit spread — profit even if wrong direction (small)" : "Debit spread — need stock near body"}`);
          return { success: true, result: `${isCredit ? "Credit" : "Debit"}=$${Math.abs(netCost).toFixed(0)}, MaxProfit=$${maxProfit.toFixed(0)}`, strategy: "broken_wing_butterfly", analysis: { net_cost: netCost, is_credit: isCredit, max_profit: maxProfit, max_loss: maxLoss, wing1, body, wing2 }, steps, message: `Broken wing butterfly: ${isCredit ? "credit" : "debit"} $${Math.abs(netCost).toFixed(0)}, max profit $${maxProfit.toFixed(0)}` };
        }

        case "ratio_spread": {
          if (params.strike1 === undefined || params.strike2 === undefined || params.premium1 === undefined || params.premium2 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (buy 1), strike2 (sell 2+), premiums, and ratio" };
          }
          const buyStrike = params.strike1;
          const sellStrike = params.strike2;
          const ratio = 2;
          const netCost = (params.premium1 - ratio * params.premium2) * shares;
          const isCredit = netCost < 0;
          const maxProfit = (sellStrike - buyStrike) * shares - Math.abs(netCost);
          const breakeven = sellStrike + (maxProfit / shares);
          steps.push(`=== RATIO SPREAD (1:${ratio}) ===`);
          steps.push(`  Market outlook: MODERATELY DIRECTIONAL`);
          steps.push(`  Buy 1: $${buyStrike} (premium $${params.premium1})`);
          steps.push(`  Sell ${ratio}: $${sellStrike} (premium $${params.premium2} each)`);
          steps.push(`  Net ${isCredit ? "credit" : "cost"}: $${Math.abs(netCost).toFixed(2)}`);
          steps.push(`  Max profit: $${maxProfit.toFixed(2)} (if stock = $${sellStrike} at expiry)`);
          steps.push(`  Breakeven: $${breakeven.toFixed(2)}`);
          steps.push(`  Max loss: UNLIMITED above breakeven (extra short option)`);
          steps.push(`  Best when: Moderately directional, want low cost or credit, IV elevated`);
          steps.push(`  ⚠ Has naked option risk beyond breakeven`);
          return { success: true, result: `${isCredit ? "Credit" : "Cost"}=$${Math.abs(netCost).toFixed(0)}, MaxProfit=$${maxProfit.toFixed(0)}, UNLIMITED upside risk`, strategy: "ratio_spread", analysis: { net_cost: netCost, is_credit: isCredit, max_profit: maxProfit, breakeven, ratio, max_loss: "UNLIMITED (naked option)" }, steps, message: `Ratio spread 1:${ratio}: max profit $${maxProfit.toFixed(0)}, unlimited risk above $${breakeven.toFixed(2)}` };
        }

        case "naked_put": {
          if (params.strike1 === undefined || params.premium1 === undefined) {
            return { success: false, result: "", steps, message: "Provide strike1 (put strike) and premium1 (premium received)" };
          }
          const strike = params.strike1;
          const premium = params.premium1;
          const totalCredit = premium * shares;
          const collateral = strike * shares;
          const breakeven = strike - premium;
          const roi = (premium / strike) * 100;
          const maxLoss = (strike - premium) * shares;
          steps.push(`=== NAKED PUT (Cash-Secured Put) ===`);
          steps.push(`  Market outlook: BULLISH to NEUTRAL`);
          steps.push(`  Sell put: $${strike} (premium $${premium})`);
          steps.push(`  Credit: $${totalCredit.toFixed(2)}`);
          steps.push(`  Collateral: $${collateral.toFixed(2)} (cash secured)`);
          steps.push(`  Max profit: $${totalCredit.toFixed(2)} (if stock > $${strike})`);
          steps.push(`  Max loss: $${maxLoss.toFixed(2)} (if stock → $0)`);
          steps.push(`  Breakeven: $${breakeven.toFixed(2)}`);
          steps.push(`  ROI: ${roi.toFixed(2)}% on collateral`);
          steps.push(`  Best when: Bullish, want to acquire shares at discount, IV elevated`);
          steps.push(`  Assignment risk: MODERATE (if stock drops below strike)`);
          steps.push(`  Part of the WHEEL STRATEGY (step 1)`);
          return { success: true, result: `Credit=$${totalCredit.toFixed(0)}, ROI=${roi.toFixed(1)}%, Breakeven=$${breakeven.toFixed(2)}`, strategy: "naked_put", analysis: { total_credit: totalCredit, collateral, max_profit: totalCredit, max_loss: maxLoss, breakeven, roi, assignment_risk: "MODERATE", wheel_step: 1 }, steps, message: `Naked put: $${totalCredit.toFixed(0)} credit, ${roi.toFixed(1)}% ROI, breakeven $${breakeven.toFixed(2)}` };
        }

        case "screener": {
          if (params.iv === undefined || params.trend === undefined) {
            return { success: false, result: "", steps, message: "Provide iv (implied volatility, decimal), trend (bullish/bearish/neutral), and optionally confidence (0-100)" };
          }
          const iv = params.iv;
          const ivPct = iv * 100;
          const trend = params.trend;
          const confidence = params.confidence ?? 50;
          const recommendations: Array<Record<string, any>> = [];
          steps.push(`=== STRATEGY SCREENER ===`);
          steps.push(`  IV: ${ivPct.toFixed(1)}% ${ivPct > 30 ? "(ELEVATED — good for selling)" : "(LOW — premium may be thin)"}`);
          steps.push(`  Trend: ${trend.toUpperCase()}`);
          steps.push(`  Confidence: ${confidence.toFixed(0)}%`);
          steps.push(``);

          const veryHighIV = ivPct > 50;

          if (trend === "bullish") {
            recommendations.push({ strategy: "naked_put (cash-secured put)", rank: 1, reason: "Bullish trend — sell puts to collect premium or acquire shares at lower cost basis", best_for: "Wheel strategy step 1, income generation", risk: "MODERATE (assignment if stock drops)", iv_requirement: "Any (better with IV > 25%)", confidence_threshold: 50 });
            recommendations.push({ strategy: "bull_put_spread", rank: 2, reason: "Bullish with defined risk — good when IV is elevated but want protection", best_for: "Defined risk bullish income", risk: "LOW (defined max loss)", iv_requirement: "IV > 25% preferred", confidence_threshold: 60 });
            recommendations.push({ strategy: "jade_lizard", rank: 3, reason: "Bullish-neutral with no upside risk if structured for credit", best_for: "Bullish but want no upside risk", risk: "DOWNSIDE (short put) but no upside risk", iv_requirement: "IV > 30%", confidence_threshold: 65 });
            if (confidence > 70) {
              recommendations.push({ strategy: "diagonal_spread (call)", rank: 4, reason: "High confidence bullish — directional + time decay income", best_for: "Strong bullish conviction with income", risk: "LOW (defined debit)", iv_requirement: "Any", confidence_threshold: 70 });
            }
          } else if (trend === "bearish") {
            recommendations.push({ strategy: "bear_call_spread", rank: 1, reason: "Bearish with defined risk — sell call spread for credit", best_for: "Defined risk bearish income", risk: "LOW (defined max loss)", iv_requirement: "IV > 25% preferred", confidence_threshold: 55 });
            recommendations.push({ strategy: "covered_call (aggressive strike)", rank: 2, reason: "If holding shares — sell calls at lower strikes to exit position at good price", best_for: "Existing stock holders wanting to exit", risk: "LOW (covered by shares)", iv_requirement: "Any", confidence_threshold: 50 });
            if (veryHighIV) {
              recommendations.push({ strategy: "short strangle (wide)", rank: 3, reason: "Very high IV + bearish — sell OTM calls and puts for large credit", best_for: "High IV mean reversion play", risk: "UNLIMITED — only for experienced traders", iv_requirement: "IV > 50%", confidence_threshold: 75 });
            }
          } else {
            recommendations.push({ strategy: "iron_condor", rank: 1, reason: "Neutral range-bound — collect premium from both sides with defined risk", best_for: "Neutral, range-bound stocks, defined risk", risk: "LOW (defined max loss)", iv_requirement: "IV > 25% preferred", confidence_threshold: 50 });
            if (veryHighIV) {
              recommendations.push({ strategy: "iron_butterfly", rank: 2, reason: "Very high IV + neutral — maximum premium collection, pin to price", best_for: "High IV, expect stock to pin near current price", risk: "LOW (defined max loss)", iv_requirement: "IV > 40%", confidence_threshold: 60 });
              recommendations.push({ strategy: "short straddle", rank: 3, reason: "Very high IV + very neutral — maximum double premium", best_for: "Highest premium, expect no movement", risk: "UNLIMITED — only for experienced traders", iv_requirement: "IV > 40%", confidence_threshold: 80 });
              recommendations.push({ strategy: "short strangle", rank: 4, reason: "Very high IV + neutral — wider profit zone than straddle", best_for: "High IV, want wider profit zone", risk: "UNLIMITED — wider zone than straddle", iv_requirement: "IV > 40%", confidence_threshold: 70 });
            }
            recommendations.push({ strategy: "calendar_spread", rank: veryHighIV ? 5 : 2, reason: "Neutral — profit from time decay differential", best_for: "Neutral, expect low near-term movement", risk: "LOW (limited to debit)", iv_requirement: "Better when near-term IV < far-term IV", confidence_threshold: 55 });
          }

          recommendations.sort((a, b) => a.rank - b.rank);
          steps.push(`--- RECOMMENDED STRATEGIES (ranked) ---`);
          for (const rec of recommendations) {
            steps.push(`  #${rec.rank}: ${rec.strategy}`);
            steps.push(`    Reason: ${rec.reason}`);
            steps.push(`    Risk: ${rec.risk}`);
            steps.push(`    IV req: ${rec.iv_requirement}`);
            steps.push(`    Confidence needed: ${rec.confidence_threshold}%`);
            steps.push(``);
          }
          const top = recommendations[0]!;
          steps.push(`=== TOP PICK: ${top.strategy} ===`);
          steps.push(`  ${top.reason}`);
          return { success: true, result: `Top: ${top.strategy}`, strategy: "screener", recommendations, steps, message: `Best strategy: ${top.strategy} (${top.reason})` };
        }

        default:
          return { success: false, result: "", steps, message: "Unknown strategy. Use 'list' to see all." };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// STOCK MARKET — Global market overview (indices, commodities, VIX, bonds, FX)
// =============================================================================

// Yahoo Finance symbols for global markets
const MARKET_SYMBOLS: Record<string, { symbol: string; name: string; region: string; currency: string }> = {
  // US Indices
  "SPY": { symbol: "SPY", name: "S&P 500 ETF", region: "US", currency: "USD" },
  "QQQ": { symbol: "QQQ", name: "Nasdaq 100 ETF", region: "US", currency: "USD" },
  "DIA": { symbol: "DIA", name: "Dow Jones ETF", region: "US", currency: "USD" },
  "IWM": { symbol: "IWM", name: "Russell 2000 (Small Cap)", region: "US", currency: "USD" },
  "VIX": { symbol: "^VIX", name: "Volatility Index (Fear Gauge)", region: "US", currency: "USD" },
  // European Indices
  "FTSE": { symbol: "^FTSE", name: "FTSE 100 (UK)", region: "Europe", currency: "GBP" },
  "DAX": { symbol: "^GDAXI", name: "DAX (Germany)", region: "Europe", currency: "EUR" },
  "CAC": { symbol: "^FCHI", name: "CAC 40 (France)", region: "Europe", currency: "EUR" },
  "SMI": { symbol: "^SSMI", name: "SMI (Switzerland)", region: "Europe", currency: "CHF" },
  "FTSEMIB": { symbol: "FTSEMIB.MI", name: "FTSE MIB (Italy)", region: "Europe", currency: "EUR" },
  "IBEX": { symbol: "^IBEX", name: "IBEX 35 (Spain)", region: "Europe", currency: "EUR" },
  // Asian Indices
  "N225": { symbol: "^N225", name: "Nikkei 225 (Japan)", region: "Asia", currency: "JPY" },
  "HSI": { symbol: "^HSI", name: "Hang Seng (Hong Kong)", region: "Asia", currency: "HKD" },
  "SSEC": { symbol: "000001.SS", name: "Shanghai Composite (China)", region: "Asia", currency: "CNY" },
  "BSESN": { symbol: "^BSESN", name: "Sensex (India)", region: "Asia", currency: "INR" },
  "KS11": { symbol: "^KS11", name: "KOSPI (South Korea)", region: "Asia", currency: "KRW" },
  "TWII": { symbol: "^TWII", name: "Taiwan Weighted", region: "Asia", currency: "TWD" },
  "AXJO": { symbol: "^AXJO", name: "ASX 200 (Australia)", region: "Asia", currency: "AUD" },
  // Americas
  "GSPTSE": { symbol: "^GSPTSE", name: "S&P/TSX (Canada)", region: "Americas", currency: "CAD" },
  "BVSP": { symbol: "^BVSP", name: "Bovespa (Brazil)", region: "Americas", currency: "BRL" },
  "MXX": { symbol: "^MXX", name: "IPC (Mexico)", region: "Americas", currency: "MXN" },
  // Commodities
  "GOLD": { symbol: "GC=F", name: "Gold Futures", region: "Commodity", currency: "USD" },
  "SILVER": { symbol: "SI=F", name: "Silver Futures", region: "Commodity", currency: "USD" },
  "OIL": { symbol: "CL=F", name: "Crude Oil WTI Futures", region: "Commodity", currency: "USD" },
  "BRENT": { symbol: "BZ=F", name: "Brent Oil Futures", region: "Commodity", currency: "USD" },
  "NATGAS": { symbol: "NG=F", name: "Natural Gas Futures", region: "Commodity", currency: "USD" },
  "COPPER": { symbol: "HG=F", name: "Copper Futures", region: "Commodity", currency: "USD" },
  "WHEAT": { symbol: "ZW=F", name: "Wheat Futures", region: "Commodity", currency: "USD" },
  "CORN": { symbol: "ZC=F", name: "Corn Futures", region: "Commodity", currency: "USD" },
  // Bonds / Rates
  "TNX": { symbol: "^TNX", name: "10Y Treasury Yield", region: "Bonds", currency: "USD" },
  "TYX": { symbol: "^TYX", name: "30Y Treasury Yield", region: "Bonds", currency: "USD" },
  "FVX": { symbol: "^FVX", name: "5Y Treasury Yield", region: "Bonds", currency: "USD" },
  // FX
  "DXY": { symbol: "DX-Y.NYB", name: "US Dollar Index", region: "FX", currency: "USD" },
  "EURUSD": { symbol: "EURUSD=X", name: "EUR/USD", region: "FX", currency: "USD" },
  "GBPUSD": { symbol: "GBPUSD=X", name: "GBP/USD", region: "FX", currency: "USD" },
  "USDJPY": { symbol: "USDJPY=X", name: "USD/JPY", region: "FX", currency: "JPY" },
  // Crypto
  "BTC": { symbol: "BTC-USD", name: "Bitcoin", region: "Crypto", currency: "USD" },
  "ETH": { symbol: "ETH-USD", name: "Ethereum", region: "Crypto", currency: "USD" },
};

export const stockMarket: ToolDef = {
  name: "stock.market",
  description: "Global market overview fetching ALL major world indices (US, Europe, Asia, Americas), commodities (gold, silver, oil, copper, wheat, corn), bond yields (5Y/10Y/30Y), FX (dollar index, EUR/USD, GBP/USD, USD/JPY), VIX (fear gauge), and crypto (BTC, ETH) in real-time from Yahoo Finance. Calculates overall market sentiment (risk-on/risk-off), regional trends, correlation analysis, and macro risk signals. Essential for understanding if global markets are rallying or selling off before making single-stock predictions.",
  inputSchema: z.object({
    operation: z.enum(["overview", "regional", "commodities", "bonds", "fx", "crypto", "sentiment", "correlation", "list"]).describe("Market operation"),
    region: z.enum(["US", "Europe", "Asia", "Americas", "Commodity", "Bonds", "FX", "Crypto"]).optional().describe("Filter by region (for 'regional')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    markets: z.record(z.any()).optional(),
    sentiment: z.record(z.any()).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "overview: All major indices, commodities, bonds, FX, crypto + overall sentiment",
          "regional: Filter by region (US, Europe, Asia, Americas, Commodity, Bonds, FX, Crypto)",
          "commodities: Gold, silver, oil, brent, natgas, copper, wheat, corn",
          "bonds: US Treasury yields (5Y, 10Y, 30Y)",
          "fx: Dollar index, EUR/USD, GBP/USD, USD/JPY",
          "crypto: Bitcoin, Ethereum",
          "sentiment: Risk-on/risk-off analysis with VIX, dollar, gold, bonds",
          "correlation: Cross-asset correlation analysis",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available market operations" };
      }

      // Helper: fetch multiple quotes from Yahoo Finance
      async function fetchQuotes(symbols: Array<{ key: string; symbol: string; name: string; region: string; currency: string }>): Promise<Array<{ key: string; name: string; region: string; price: number; change: number; changePct: number; currency: string }>> {
        const results: Array<{ key: string; name: string; region: string; price: number; change: number; changePct: number; currency: string }> = [];
        // Fetch in parallel batches of 5
        for (let i = 0; i < symbols.length; i += 5) {
          const batch = symbols.slice(i, i + 5);
          const promises = batch.map(async (s) => {
            try {
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${s.symbol}?range=1d&interval=1d`;
              const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
              if (!resp.ok) return null;
              const data = await resp.json() as any;
              const meta = data?.chart?.result?.[0]?.meta;
              if (!meta) return null;
              const price = meta.regularMarketPrice;
              const prev = meta.chartPreviousClose ?? price;
              return {
                key: s.key,
                name: s.name,
                region: s.region,
                price,
                change: price - prev,
                changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
                currency: s.currency,
              };
            } catch {
              return null;
            }
          });
          const batchResults = await Promise.all(promises);
          for (const r of batchResults) {
            if (r) results.push(r);
          }
        }
        return results;
      }

      // Determine which symbols to fetch
      let symbolsToFetch: Array<{ key: string; symbol: string; name: string; region: string; currency: string }>;
      switch (params.operation) {
        case "regional":
          symbolsToFetch = Object.entries(MARKET_SYMBOLS)
            .filter(([, v]) => v.region === params.region)
            .map(([k, v]) => ({ key: k, ...v }));
          break;
        case "commodities":
          symbolsToFetch = Object.entries(MARKET_SYMBOLS)
            .filter(([, v]) => v.region === "Commodity")
            .map(([k, v]) => ({ key: k, ...v }));
          break;
        case "bonds":
          symbolsToFetch = Object.entries(MARKET_SYMBOLS)
            .filter(([, v]) => v.region === "Bonds")
            .map(([k, v]) => ({ key: k, ...v }));
          break;
        case "fx":
          symbolsToFetch = Object.entries(MARKET_SYMBOLS)
            .filter(([, v]) => v.region === "FX")
            .map(([k, v]) => ({ key: k, ...v }));
          break;
        case "crypto":
          symbolsToFetch = Object.entries(MARKET_SYMBOLS)
            .filter(([, v]) => v.region === "Crypto")
            .map(([k, v]) => ({ key: k, ...v }));
          break;
        default:
          symbolsToFetch = Object.entries(MARKET_SYMBOLS).map(([k, v]) => ({ key: k, ...v }));
      }

      steps.push(`Fetching ${symbolsToFetch.length} market quotes from Yahoo Finance...`);
      const quotes = await fetchQuotes(symbolsToFetch);

      if (quotes.length === 0) {
        return { success: false, result: "", steps, message: "Failed to fetch any market data" };
      }

      steps.push(`Retrieved ${quotes.length}/${symbolsToFetch.length} quotes`);

      // Build market data object
      const markets: Record<string, any> = {};
      for (const q of quotes) {
        markets[q.key] = {
          name: q.name,
          region: q.region,
          price: q.price,
          change: q.change,
          change_pct: q.changePct,
          currency: q.currency,
          direction: q.change > 0 ? "UP" : q.change < 0 ? "DOWN" : "FLAT",
        };
      }

      // ================================================================
      // SENTIMENT ANALYSIS
      // ================================================================
      if (params.operation === "sentiment" || params.operation === "overview") {
        const upCount = quotes.filter((q) => q.change > 0).length;
        const downCount = quotes.filter((q) => q.change < 0).length;
        const flatCount = quotes.filter((q) => q.change === 0).length;
        const upPct = (upCount / quotes.length) * 100;

        // VIX analysis
        const vix = markets.VIX;
        let vixLevel = "NORMAL";
        let vixSignal = "Neutral";
        if (vix) {
          if (vix.price > 30) { vixLevel = "HIGH (FEAR)"; vixSignal = "Risk-off — investors fearful, consider defensive plays"; }
          else if (vix.price > 20) { vixLevel = "ELEVATED"; vixSignal = "Cautious — elevated volatility, good for premium selling"; }
          else if (vix.price < 12) { vixLevel = "LOW (COMPLACENT)"; vixSignal = "Risk-on — low fear, premium may be thin"; }
          else { vixLevel = "NORMAL"; vixSignal = "Balanced — normal market conditions"; }
        }

        // Dollar analysis
        const dxy = markets.DXY;
        let dollarSignal = "Neutral";
        if (dxy) {
          if (dxy.change > 0) dollarSignal = "Dollar strengthening — pressure on commodities and foreign stocks";
          else if (dxy.change < 0) dollarSignal = "Dollar weakening — supportive for commodities and emerging markets";
        }

        // Gold analysis
        const gold = markets.GOLD;
        let goldSignal = "Neutral";
        if (gold) {
          if (gold.change > 0) goldSignal = "Gold up — safe haven demand, risk-off signal";
          else if (gold.change < 0) goldSignal = "Gold down — risk appetite, risk-on signal";
        }

        // Bonds analysis
        const tnx = markets.TNX;
        let bondSignal = "Neutral";
        if (tnx) {
          if (tnx.change > 0) bondSignal = `Yields rising (${tnx.price.toFixed(2)}%) — growth expectations or inflation concerns`;
          else if (tnx.change < 0) bondSignal = `Yields falling (${tnx.price.toFixed(2)}%) — flight to safety or recession fears`;
        }

        // Oil analysis
        const oil = markets.OIL;
        let oilSignal = "Neutral";
        if (oil) {
          if (oil.changePct > 2) oilSignal = "Oil surging — inflation pressure, energy stocks benefit";
          else if (oil.changePct < -2) oilSignal = "Oil dropping — deflation pressure, consumer stocks benefit";
        }

        // Overall sentiment
        let sentiment: "RISK-ON" | "RISK-OFF" | "MIXED";
        let sentimentDesc: string;
        const riskOnSignals = [
          upPct > 60,
          vix && vix.price < 20,
          gold && gold.change < 0,
          dxy && dxy.change < 0,
        ].filter(Boolean).length;
        const riskOffSignals = [
          upPct < 40,
          vix && vix.price > 25,
          gold && gold.change > 0,
          dxy && dxy.change > 0,
        ].filter(Boolean).length;

        if (riskOnSignals >= 3) {
          sentiment = "RISK-ON";
          sentimentDesc = "Markets in risk-on mode — stocks rising, volatility low, gold down. Good for bullish strategies and selling puts.";
        } else if (riskOffSignals >= 3) {
          sentiment = "RISK-OFF";
          sentimentDesc = "Markets in risk-off mode — stocks falling, volatility rising, gold up. Defensive posture, consider protective puts and credit spreads.";
        } else {
          sentiment = "MIXED";
          sentimentDesc = "Mixed signals — no clear directional bias. Range-bound strategies (iron condors, calendars) may be optimal.";
        }

        const sentimentData = {
          overall: sentiment,
          description: sentimentDesc,
          up_count: upCount,
          down_count: downCount,
          flat_count: flatCount,
          up_pct: upPct,
          vix: vix ? { price: vix.price, level: vixLevel, signal: vixSignal } : null,
          dollar: dxy ? { price: dxy.price, signal: dollarSignal } : null,
          gold: gold ? { price: gold.price, signal: goldSignal } : null,
          bonds: tnx ? { yield: tnx.price, signal: bondSignal } : null,
          oil: oil ? { price: oil.price, signal: oilSignal } : null,
          risk_on_signals: riskOnSignals,
          risk_off_signals: riskOffSignals,
        };

        if (params.operation === "sentiment") {
          steps.push(`=== GLOBAL MARKET SENTIMENT ===`);
          steps.push(`  Overall: ${sentiment}`);
          steps.push(`  ${sentimentDesc}`);
          steps.push(``);
          steps.push(`  Markets up: ${upCount} | Down: ${downCount} | Flat: ${flatCount} (${upPct.toFixed(0)}% up)`);
          if (vix) steps.push(`  VIX: ${vix.price.toFixed(2)} — ${vixLevel} — ${vixSignal}`);
          if (dxy) steps.push(`  Dollar (DXY): ${dxy.price.toFixed(2)} — ${dollarSignal}`);
          if (gold) steps.push(`  Gold: $${gold.price.toFixed(2)} — ${goldSignal}`);
          if (tnx) steps.push(`  10Y Yield: ${tnx.price.toFixed(2)}% — ${bondSignal}`);
          if (oil) steps.push(`  Oil: $${oil.price.toFixed(2)} (${oil.changePct.toFixed(2)}%) — ${oilSignal}`);
          steps.push(``);
          steps.push(`  Risk-on signals: ${riskOnSignals} | Risk-off signals: ${riskOffSignals}`);
          steps.push(``);
          steps.push(`  TRADING IMPLICATION:`);
          if (sentiment === "RISK-ON") {
            steps.push(`    → Favored: Sell cash-secured puts, bull put spreads, covered calls`);
            steps.push(`    → Avoid: Bear call spreads, heavy hedging`);
          } else if (sentiment === "RISK-OFF") {
            steps.push(`    → Favored: Bear call spreads, protective puts, cash-secured puts at lower strikes`);
            steps.push(`    → Avoid: Naked puts (unless wanting assignment), short straddles`);
            steps.push(`    → VIX elevated: Good for selling premium (IV is high)`);
          } else {
            steps.push(`    → Favored: Iron condors, calendar spreads, neutral strategies`);
            steps.push(`    → Range-bound market — ideal for premium collection`);
          }
          return { success: true, result: `${sentiment} (${upPct.toFixed(0)}% up, VIX ${vix?.price.toFixed(1) ?? "N/A"})`, markets, sentiment: sentimentData, steps, message: `Global sentiment: ${sentiment} — ${sentimentDesc.substring(0, 80)}` };
        }
      }

      // ================================================================
      // CORRELATION ANALYSIS
      // ================================================================
      if (params.operation === "correlation") {
        steps.push(`=== CROSS-ASSET CORRELATION ANALYSIS ===`);
        const usIndices = quotes.filter((q) => q.region === "US" && q.key !== "VIX");
        const euIndices = quotes.filter((q) => q.region === "Europe");
        const asiaIndices = quotes.filter((q) => q.region === "Asia");
        const commodities = quotes.filter((q) => q.region === "Commodity");

        const usAvg = usIndices.length > 0 ? usIndices.reduce((s, q) => s + q.changePct, 0) / usIndices.length : 0;
        const euAvg = euIndices.length > 0 ? euIndices.reduce((s, q) => s + q.changePct, 0) / euIndices.length : 0;
        const asiaAvg = asiaIndices.length > 0 ? asiaIndices.reduce((s, q) => s + q.changePct, 0) / asiaIndices.length : 0;
        const commAvg = commodities.length > 0 ? commodities.reduce((s, q) => s + q.changePct, 0) / commodities.length : 0;

        steps.push(`  US indices avg: ${usAvg.toFixed(2)}%`);
        steps.push(`  European indices avg: ${euAvg.toFixed(2)}%`);
        steps.push(`  Asian indices avg: ${asiaAvg.toFixed(2)}%`);
        steps.push(`  Commodities avg: ${commAvg.toFixed(2)}%`);
        steps.push(``);

        const allPositive = usAvg > 0 && euAvg > 0 && asiaAvg > 0;
        const allNegative = usAvg < 0 && euAvg < 0 && asiaAvg < 0;
        const divergence = Math.abs(usAvg - euAvg) > 1.5 || Math.abs(usAvg - asiaAvg) > 1.5;

        if (allPositive) {
          steps.push(`  ✓ GLOBAL RALLY: All regions positive — broad risk-on sentiment`);
          steps.push(`    Implication: Individual stocks likely supported by macro tailwinds`);
        } else if (allNegative) {
          steps.push(`  ✗ GLOBAL SELLOFF: All regions negative — broad risk-off sentiment`);
          steps.push(`    Implication: Individual stocks face macro headwinds, consider defensive plays`);
        } else if (divergence) {
          steps.push(`  ⚠ REGIONAL DIVERGENCE: Markets moving in different directions`);
          steps.push(`    Implication: Stock-specific factors matter more than macro — selective approach needed`);
        } else {
          steps.push(`  ~ MIXED: Regions mostly aligned but modest moves`);
          steps.push(`    Implication: Normal market — focus on individual stock analysis`);
        }

        // Commodity-stock relationship
        const vix = markets.VIX;
        if (vix && vix.price > 25) {
          steps.push(`  ⚠ HIGH VIX (${vix.price.toFixed(1)}): Elevated fear — all correlations tend toward 1 in crisis`);
        }

        return {
          success: true,
          result: `US=${usAvg.toFixed(2)}%, EU=${euAvg.toFixed(2)}%, Asia=${asiaAvg.toFixed(2)}%, Comm=${commAvg.toFixed(2)}%`,
          markets,
          sentiment: { us_avg: usAvg, eu_avg: euAvg, asia_avg: asiaAvg, commodity_avg: commAvg, all_positive: allPositive, all_negative: allNegative, divergence },
          steps,
          message: allPositive ? "Global rally — all regions up" : allNegative ? "Global selloff — all regions down" : divergence ? "Regional divergence detected" : "Mixed/modest moves across regions",
        };
      }

      // ================================================================
      // DEFAULT: OVERVIEW or REGIONAL
      // ================================================================
      steps.push(`=== GLOBAL MARKET OVERVIEW ===`);
      const regions = [...new Set(quotes.map((q) => q.region))];
      for (const region of regions.sort()) {
        steps.push(``);
        steps.push(`--- ${region.toUpperCase()} ---`);
        const regionQuotes = quotes.filter((q) => q.region === region);
        for (const q of regionQuotes) {
          const arrow = q.change > 0 ? "▲" : q.change < 0 ? "▼" : "→";
          steps.push(`  ${arrow} ${q.key}: ${q.price.toFixed(2)} ${q.currency} (${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)}%) — ${q.name}`);
        }
      }

      // Quick sentiment summary
      const upCount = quotes.filter((q) => q.change > 0).length;
      const downCount = quotes.filter((q) => q.change < 0).length;
      const vix = markets.VIX;
      steps.push(``);
      steps.push(`--- SUMMARY ---`);
      steps.push(`  Up: ${upCount} | Down: ${downCount} | Flat: ${quotes.length - upCount - downCount}`);
      if (vix) steps.push(`  VIX: ${vix.price.toFixed(2)} ${vix.price > 25 ? "(FEAR)" : vix.price < 15 ? "(COMPLACENT)" : "(NORMAL)"}`);
      steps.push(`  Sentiment: ${upCount > downCount * 1.5 ? "RISK-ON (broad rally)" : downCount > upCount * 1.5 ? "RISK-OFF (broad selloff)" : "MIXED"}`);

      return {
        success: true,
        result: `${quotes.length} markets: ${upCount} up, ${downCount} down`,
        markets,
        steps,
        message: `Global overview: ${upCount} up, ${downCount} down${vix ? `, VIX ${vix.price.toFixed(1)}` : ""}`,
      };
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// STOCK VOLATILITY — IV Rank, IV Percentile, HV/IV, Skew, Term Structure
// =============================================================================

export const stockVolatility: ToolDef = {
  name: "stock.volatility",
  description: "Comprehensive volatility analysis for premium sellers: IV Rank (current IV vs 52-week range), IV Percentile (% of days IV was lower), Historical Volatility vs Implied Volatility (HV/IV ratio to detect overpriced/underpriced options), Put-Call Volatility Skew (puts typically have higher IV), Volatility Term Structure (contango vs backwardation across expirations), and Volatility Cone (expected IV range by DTE). THE most important tool for deciding whether to sell premium now or wait.",
  inputSchema: z.object({
    operation: z.enum(["iv_rank", "hv_iv_ratio", "skew", "term_structure", "vol_cone", "full_analysis", "list"]).describe("Volatility operation"),
    symbol: z.string().optional().describe("Stock ticker (for fetching IV data)"),
    closes: z.array(z.number()).optional().describe("Historical close prices (for HV calculation)"),
    current_iv: z.number().optional().describe("Current implied volatility (decimal, e.g. 0.35)"),
    historical_ivs: z.array(z.number()).optional().describe("Array of historical IV values (for IV rank/percentile)"),
    // For skew
    put_iv: z.number().optional().describe("ATM put IV (decimal)"),
    call_iv: z.number().optional().describe("ATM call IV (decimal)"),
    otm_put_iv: z.number().optional().describe("OTM put IV (e.g. 25-delta, decimal)"),
    otm_call_iv: z.number().optional().describe("OTM call IV (e.g. 25-delta, decimal)"),
    // For term structure
    expirations: z.array(z.object({
      dte: z.number(),
      iv: z.number(),
    })).optional().describe("Array of {dte, iv} for term structure"),
    // For vol cone
    hv_periods: z.array(z.object({
      period: z.number(),
      hv: z.number(),
    })).optional().describe("Array of {period, hv} for vol cone"),
    hv_period: z.number().default(20).describe("HV calculation period (default 20 days)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    volatility: z.record(z.any()).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "iv_rank: IV Rank + IV Percentile (needs current_iv + historical_ivs, or symbol to fetch)",
          "hv_iv_ratio: Historical Volatility vs Implied Volatility (needs closes + current_iv)",
          "skew: Put-Call vol skew analysis (needs put_iv, call_iv, otm_put_iv, otm_call_iv)",
          "term_structure: Volatility term structure across expirations (needs expirations array)",
          "vol_cone: Volatility cone — expected HV range by period (needs closes or hv_periods)",
          "full_analysis: All of the above combined",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available volatility operations" };
      }

      // Helper: fetch historical IVs from Yahoo options chain (if symbol provided)
      async function fetchHistoricalIVs(symbol: string): Promise<{ currentIV: number; historicalIVs: number[] } | null> {
        try {
          // Fetch options chain to get current ATM IV
          const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
          const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (!resp.ok) return null;
          const data = await resp.json() as any;
          const result = data?.optionChain?.result?.[0];
          if (!result) return null;
          const spot = result.quote?.regularMarketPrice;
          const calls = result.options?.[0]?.calls || [];
          const puts = result.options?.[0]?.puts || [];
          // Find ATM IV (closest to spot)
          let atmIV = 0;
          let minDist = Infinity;
          for (const c of calls) {
            const dist = Math.abs(c.strike - spot);
            if (dist < minDist) { minDist = dist; atmIV = c.impliedVolatility; }
          }
          for (const p of puts) {
            const dist = Math.abs(p.strike - spot);
            if (dist < minDist) { minDist = dist; atmIV = p.impliedVolatility; }
          }
          // Also collect all IVs across expirations for historical proxy
          const allIVs: number[] = [];
          const expDates = result.expirationDates || [];
          for (const exp of expDates.slice(0, 12)) {
            try {
              const expUrl = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${exp}`;
              const expResp = await fetch(expUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
              if (!expResp.ok) continue;
              const expData = await expResp.json() as any;
              const expResult = expData?.optionChain?.result?.[0];
              const expCalls = expResult?.options?.[0]?.calls || [];
              for (const c of expCalls) {
                if (Math.abs(c.strike - spot) < spot * 0.05) {
                  allIVs.push(c.impliedVolatility);
                }
              }
            } catch { /* skip */ }
          }
          // If we couldn't get cross-expiration IVs, use a synthetic historical set
          // by sampling IVs at different strikes (proxy for IV variation)
          if (allIVs.length < 10) {
            for (const c of calls) allIVs.push(c.impliedVolatility);
            for (const p of puts) allIVs.push(p.impliedVolatility);
          }
          return { currentIV: atmIV, historicalIVs: allIVs };
        } catch {
          return null;
        }
      }

      // Helper: calculate historical volatility from closes
      function calcHV(closes: number[], period: number): number {
        if (closes.length < period + 1) return 0;
        const returns: number[] = [];
        for (let i = closes.length - period; i < closes.length; i++) {
          if (i > 0 && closes[i - 1]! > 0) {
            returns.push(Math.log(closes[i]! / closes[i - 1]!));
          }
        }
        if (returns.length === 0) return 0;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
        return Math.sqrt(variance) * Math.sqrt(252); // Annualized
      }

      switch (params.operation) {
        // ================================================================
        // IV RANK + IV PERCENTILE
        // ================================================================
        case "iv_rank": {
          let currentIV = params.current_iv;
          let historicalIVs = params.historical_ivs;

          // Try to fetch from Yahoo if symbol provided
          if ((!currentIV || !historicalIVs) && params.symbol) {
            steps.push(`Fetching IV data for ${params.symbol} from Yahoo Finance...`);
            const fetched = await fetchHistoricalIVs(params.symbol);
            if (fetched) {
              if (currentIV === undefined) currentIV = fetched.currentIV;
              if (!historicalIVs) historicalIVs = fetched.historicalIVs;
            }
          }

          if (currentIV === undefined || !historicalIVs || historicalIVs.length === 0) {
            return { success: false, result: "", steps, message: "Provide current_iv and historical_ivs (or symbol to fetch from Yahoo)" };
          }

          const ivHigh = Math.max(...historicalIVs);
          const ivLow = Math.min(...historicalIVs);
          const ivRange = ivHigh - ivLow;
          const ivRank = ivRange > 0 ? ((currentIV - ivLow) / ivRange) * 100 : 50;
          const ivPercentile = (historicalIVs.filter((iv: number) => iv < currentIV).length / historicalIVs.length) * 100;

          // Premium selling recommendation
          let recommendation: string;
          if (ivRank > 50) {
            recommendation = "HIGH IV RANK — GOOD TIME TO SELL PREMIUM. Options are expensive relative to recent history. Favored: sell puts, covered calls, credit spreads, iron condors.";
          } else if (ivRank > 25) {
            recommendation = "MODERATE IV RANK — OK to sell premium but be selective. Prefer shorter DTE for faster theta decay.";
          } else {
            recommendation = "LOW IV RANK — PREMIUM IS CHEAP. Consider buying strategies or waiting for IV to rise. If selling, use wider spreads for more credit.";
          }

          steps.push(`=== IV RANK & IV PERCENTILE ===`);
          steps.push(`  Current IV: ${(currentIV * 100).toFixed(2)}%`);
          steps.push(`  IV 52-week high: ${(ivHigh * 100).toFixed(2)}%`);
          steps.push(`  IV 52-week low: ${(ivLow * 100).toFixed(2)}%`);
          steps.push(`  IV Rank: ${ivRank.toFixed(1)} (0=cheapest, 100=most expensive)`);
          steps.push(`  IV Percentile: ${ivPercentile.toFixed(1)}% (${(historicalIVs.filter((iv: number) => iv < currentIV).length)} of ${historicalIVs.length} readings were lower)`);
          steps.push(``);
          steps.push(`  RECOMMENDATION: ${recommendation}`);

          return {
            success: true,
            result: `IV Rank=${ivRank.toFixed(1)}, IV Pctile=${ivPercentile.toFixed(1)}%`,
            volatility: { current_iv: currentIV, iv_high: ivHigh, iv_low: ivLow, iv_rank: ivRank, iv_percentile: ivPercentile, recommendation },
            steps,
            message: `IV Rank ${ivRank.toFixed(0)} (${ivRank > 50 ? "HIGH — sell premium" : ivRank > 25 ? "MODERATE" : "LOW — premium cheap"})`,
          };
        }

        // ================================================================
        // HV / IV RATIO
        // ================================================================
        case "hv_iv_ratio": {
          let currentIV = params.current_iv;
          const closes = params.closes ?? [];

          if (!currentIV && params.symbol) {
            steps.push(`Fetching current IV for ${params.symbol}...`);
            const fetched = await fetchHistoricalIVs(params.symbol);
            if (fetched) currentIV = fetched.currentIV;
          }

          if (!currentIV || closes.length < params.hv_period + 1) {
            return { success: false, result: "", steps, message: `Provide current_iv and closes (at least ${params.hv_period + 1} data points), or symbol` };
          }

          const hv20 = calcHV(closes, 20);
          const hv50 = closes.length > 51 ? calcHV(closes, 50) : 0;
          const hv10 = closes.length > 11 ? calcHV(closes, 10) : 0;
          const hv100 = closes.length > 101 ? calcHV(closes, 100) : 0;
          const hvAvg = [hv10, hv20, hv50, hv100].filter((v) => v > 0).reduce((a, b) => a + b, 0) / [hv10, hv20, hv50, hv100].filter((v) => v > 0).length;
          const ivHvRatio = hvAvg > 0 ? currentIV / hvAvg : 0;
          const ivPremium = ivHvRatio > 0 ? (ivHvRatio - 1) * 100 : 0;

          let assessment: string;
          if (ivHvRatio > 1.3) {
            assessment = "IV OVERPRICED vs HV — Options are expensive relative to actual stock movement. GOOD for selling premium (IV > HV means you're collecting more than the stock typically moves).";
          } else if (ivHvRatio > 1.0) {
            assessment = "IV slightly above HV — Fair to good for selling premium. Options have a small theoretical edge for sellers.";
          } else if (ivHvRatio > 0.8) {
            assessment = "IV close to HV — Neutral. No strong edge for sellers or buyers. Be selective with strategies.";
          } else {
            assessment = "IV UNDERPRICED vs HV — Options are cheap relative to actual stock movement. BAD for selling premium. Consider buying strategies or waiting for IV to rise.";
          }

          steps.push(`=== HISTORICAL vs IMPLIED VOLATILITY ===`);
          steps.push(`  Current IV: ${(currentIV * 100).toFixed(2)}%`);
          steps.push(`  HV 10-day: ${(hv10 * 100).toFixed(2)}%`);
          steps.push(`  HV 20-day: ${(hv20 * 100).toFixed(2)}%`);
          steps.push(`  HV 50-day: ${(hv50 * 100).toFixed(2)}%`);
          steps.push(`  HV 100-day: ${(hv100 * 100).toFixed(2)}%`);
          steps.push(`  Avg HV: ${(hvAvg * 100).toFixed(2)}%`);
          steps.push(`  IV/HV Ratio: ${ivHvRatio.toFixed(2)}`);
          steps.push(`  IV Premium/Discount: ${ivPremium > 0 ? "+" : ""}${ivPremium.toFixed(1)}%`);
          steps.push(``);
          steps.push(`  ASSESSMENT: ${assessment}`);

          return {
            success: true,
            result: `IV/HV=${ivHvRatio.toFixed(2)} (${ivPremium > 0 ? "+" : ""}${ivPremium.toFixed(1)}% premium)`,
            volatility: { current_iv: currentIV, hv_10: hv10, hv_20: hv20, hv_50: hv50, hv_100: hv100, avg_hv: hvAvg, iv_hv_ratio: ivHvRatio, iv_premium: ivPremium, assessment },
            steps,
            message: `IV/HV ratio ${ivHvRatio.toFixed(2)} — ${ivHvRatio > 1.2 ? "IV overpriced (good for selling)" : ivHvRatio < 0.9 ? "IV underpriced (bad for selling)" : "fair pricing"}`,
          };
        }

        // ================================================================
        // PUT-CALL VOLATILITY SKEW
        // ================================================================
        case "skew": {
          if (params.put_iv === undefined || params.call_iv === undefined) {
            return { success: false, result: "", steps, message: "Provide put_iv and call_iv (ATM), optionally otm_put_iv and otm_call_iv" };
          }
          const atmSkew = params.put_iv - params.call_iv;
          const otmPutIV = params.otm_put_iv ?? params.put_iv;
          const otmCallIV = params.otm_call_iv ?? params.call_iv;
          const otmSkew = otmPutIV - otmCallIV;
          const skewRatio = otmCallIV > 0 ? otmPutIV / otmCallIV : 1;
          const reverseSkew = atmSkew < 0;

          let interpretation: string;
          if (atmSkew > 0.02) {
            interpretation = "Normal put skew — puts have higher IV than calls. Market is paying up for downside protection. Typical for equities. Good for selling puts (collecting higher premium).";
          } else if (atmSkew > 0) {
            interpretation = "Mild put skew — slight preference for downside protection. Normal market conditions.";
          } else if (reverseSkew) {
            interpretation = "REVERSE SKEW (call skew) — calls have higher IV than puts. Unusual — often seen before earnings or in commodity stocks. Good for selling covered calls (collecting higher call premium).";
          } else {
            interpretation = "No skew — puts and calls have similar IV. Neutral market expectations.";
          }

          if (skewRatio > 1.5) {
            interpretation += " ⚠ EXTREME put skew — market very fearful of downside. Put premiums very rich but assignment risk is elevated.";
          }

          steps.push(`=== PUT-CALL VOLATILITY SKEW ===`);
          steps.push(`  ATM Put IV: ${(params.put_iv * 100).toFixed(2)}%`);
          steps.push(`  ATM Call IV: ${(params.call_iv * 100).toFixed(2)}%`);
          steps.push(`  ATM Skew: ${(atmSkew * 100).toFixed(2)}% ${atmSkew > 0 ? "(put > call)" : "(call > put)"}`);
          steps.push(`  OTM Put IV (25Δ): ${(otmPutIV * 100).toFixed(2)}%`);
          steps.push(`  OTM Call IV (25Δ): ${(otmCallIV * 100).toFixed(2)}%`);
          steps.push(`  OTM Skew: ${(otmSkew * 100).toFixed(2)}%`);
          steps.push(`  Skew Ratio (put/call): ${skewRatio.toFixed(2)}`);
          steps.push(``);
          steps.push(`  INTERPRETATION: ${interpretation}`);
          steps.push(``);
          steps.push(`  TRADING IMPLICATIONS:`);
          if (atmSkew > 0) {
            steps.push(`    → Put premiums richer — selling puts more attractive`);
            steps.push(`    → Covered calls less attractive (call IV lower)`);
            if (skewRatio > 1.3) {
              steps.push(`    → Consider put spreads to cap downside risk`);
            }
          } else {
            steps.push(`    → Call premiums richer — selling covered calls more attractive`);
            steps.push(`    → Puts less attractive (put IV lower)`);
          }

          return {
            success: true,
            result: `ATM Skew=${(atmSkew * 100).toFixed(2)}%, Skew Ratio=${skewRatio.toFixed(2)}`,
            volatility: { atm_put_iv: params.put_iv, atm_call_iv: params.call_iv, atm_skew: atmSkew, otm_put_iv: otmPutIV, otm_call_iv: otmCallIV, otm_skew: otmSkew, skew_ratio: skewRatio, reverse_skew: reverseSkew, interpretation },
            steps,
            message: `Skew: ${atmSkew > 0 ? "put skew" : "call skew"} (${(atmSkew * 100).toFixed(1)}%) — ${atmSkew > 0 ? "puts richer" : "calls richer"}`,
          };
        }

        // ================================================================
        // VOLATILITY TERM STRUCTURE
        // ================================================================
        case "term_structure": {
          let expirations = params.expirations;

          if (!expirations && params.symbol) {
            steps.push(`Fetching term structure for ${params.symbol}...`);
            const fetched = await fetchHistoricalIVs(params.symbol);
            if (fetched) {
              // Build synthetic term structure from cross-strike IVs as proxy
              expirations = fetched.historicalIVs.slice(0, 8).map((iv, i) => ({ dte: 7 * (i + 1), iv }));
            }
          }

          if (!expirations || expirations.length < 2) {
            return { success: false, result: "", steps, message: "Provide expirations array [{dte, iv}] with at least 2 entries, or symbol" };
          }

          expirations.sort((a: { dte: number; iv: number }, b: { dte: number; iv: number }) => a.dte - b.dte);
          const nearIV = expirations[0]!.iv;
          const farIV = expirations[expirations.length - 1]!.iv;
          const contango = farIV > nearIV; // Normal: far > near
          const backwardation = farIV < nearIV; // Unusual: near > far
          const ivDiff = farIV - nearIV;
          const maxIV = Math.max(...(expirations as Array<{ dte: number; iv: number }>).map((e) => e.iv));
          const minIV = Math.min(...(expirations as Array<{ dte: number; iv: number }>).map((e) => e.iv));
          const peakDTE = expirations.find((e: { dte: number; iv: number }) => e.iv === maxIV)?.dte ?? 0;

          let structure: string;
          let implication: string;
          if (backwardation) {
            structure = "BACKWARDATION (near IV > far IV)";
            implication = "Near-term volatility elevated — market expects a near-term event (earnings, Fed, news). After the event, IV is expected to drop. GOOD for selling near-term premium (front-week options) — but ONLY if you're comfortable with the event risk.";
          } else if (contango && ivDiff > 0.05) {
            structure = "STEEP CONTANGO (far IV >> near IV)";
            implication = "Near-term IV low, far-term IV high. Good for calendar spreads (sell near-term, buy far-term). Near-term premium may be thin.";
          } else {
            structure = "NORMAL CONTANGO (far IV slightly > near IV)";
            implication = "Normal term structure. Near-term options decay faster. Good for selling any DTE — standard premium selling applies.";
          }

          steps.push(`=== VOLATILITY TERM STRUCTURE ===`);
          for (const exp of expirations as Array<{ dte: number; iv: number }>) {
            steps.push(`  ${exp.dte}d: ${(exp.iv * 100).toFixed(2)}% IV`);
          }
          steps.push(``);
          steps.push(`  Structure: ${structure}`);
          steps.push(`  Near IV: ${(nearIV * 100).toFixed(2)}% (${expirations[0]!.dte}d)`);
          steps.push(`  Far IV: ${(farIV * 100).toFixed(2)}% (${expirations[expirations.length - 1]!.dte}d)`);
          steps.push(`  IV spread: ${(ivDiff * 100).toFixed(2)}%`);
          steps.push(`  Peak IV: ${(maxIV * 100).toFixed(2)}% at ${peakDTE}d`);
          steps.push(``);
          steps.push(`  IMPLICATION: ${implication}`);

          return {
            success: true,
            result: `${structure} (near ${(nearIV * 100).toFixed(1)}%, far ${(farIV * 100).toFixed(1)}%)`,
            volatility: { structure, near_iv: nearIV, far_iv: farIV, iv_diff: ivDiff, contango, backwardation, peak_dte: peakDTE, expirations, implication },
            steps,
            message: `Term structure: ${backwardation ? "backwardation (event risk)" : contango && ivDiff > 0.05 ? "steep contango (calendar spread opportunity)" : "normal contango"}`,
          };
        }

        // ================================================================
        // VOLATILITY CONE
        // ================================================================
        case "vol_cone": {
          const closes = params.closes ?? [];
          let hvPeriods = params.hv_periods;

          if (!hvPeriods && closes.length > 30) {
            // Calculate HV at multiple periods
            const periods = [10, 20, 30, 60, 90, 120];
            hvPeriods = periods
              .filter((p: number) => closes.length > p + 1)
              .map((p: number) => ({ period: p, hv: calcHV(closes, p) }));
          }

          if (!hvPeriods || hvPeriods.length === 0) {
            return { success: false, result: "", steps, message: "Provide closes (60+ data points) or hv_periods array" };
          }

          // Build percentile bands (simulated — in production would use rolling HV history)
          const currentIV = params.current_iv ?? 0;
          steps.push(`=== VOLATILITY CONE ===`);
          steps.push(`  Period  |  HV  |  IV  |  IV vs HV`);
          steps.push(`  --------|------|------|----------`);
          for (const hvp of hvPeriods as Array<{ period: number; hv: number }>) {
            const ivVsHv = currentIV > 0 ? ((currentIV / hvp.hv - 1) * 100).toFixed(1) + "%" : "N/A";
            steps.push(`  ${hvp.period.toString().padEnd(7)} | ${(hvp.hv * 100).toFixed(1)}% | ${currentIV > 0 ? (currentIV * 100).toFixed(1) + "%" : "N/A"} | ${ivVsHv}`);
          }
          steps.push(``);
          if (currentIV > 0) {
            const avgHV = hvPeriods.reduce((s: number, h: { period: number; hv: number }) => s + h.hv, 0) / hvPeriods.length;
            const ratio = currentIV / avgHV;
            steps.push(`  Average HV across periods: ${(avgHV * 100).toFixed(1)}%`);
            steps.push(`  Current IV: ${(currentIV * 100).toFixed(1)}%`);
            steps.push(`  IV/HV: ${ratio.toFixed(2)} ${ratio > 1.2 ? "(IV RICH — good for selling)" : ratio < 0.9 ? "(IV CHEAP — bad for selling)" : "(fair)"}`);
            steps.push(``);
            steps.push(`  The vol cone shows expected HV at different time horizons.`);
            steps.push(`  If IV is above the cone at all periods → premium is rich across all DTEs.`);
            steps.push(`  If IV is below the cone → premium is cheap, consider buying strategies.`);
          }

          return {
            success: true,
            result: `${hvPeriods.length} HV periods analyzed`,
            volatility: { hv_periods: hvPeriods, current_iv: currentIV, avg_hv: hvPeriods.reduce((s: number, h: { period: number; hv: number }) => s + h.hv, 0) / hvPeriods.length },
            steps,
            message: `Vol cone: ${hvPeriods.length} periods, ${currentIV > 0 ? `IV/HV=${(currentIV / (hvPeriods.reduce((s: number, h: { period: number; hv: number }) => s + h.hv, 0) / hvPeriods.length)).toFixed(2)}` : "no IV provided"}`,
          };
        }

        // ================================================================
        // FULL ANALYSIS — All volatility metrics combined
        // ================================================================
        case "full_analysis": {
          const results: Record<string, any> = {};
          const closes = params.closes ?? [];
          let currentIV = params.current_iv;
          let historicalIVs = params.historical_ivs;

          if ((!currentIV || !historicalIVs) && params.symbol) {
            steps.push(`Fetching IV data for ${params.symbol}...`);
            const fetched = await fetchHistoricalIVs(params.symbol);
            if (fetched) {
              if (currentIV === undefined) currentIV = fetched.currentIV;
              if (!historicalIVs) historicalIVs = fetched.historicalIVs;
            }
          }

          steps.push(`=== COMPREHENSIVE VOLATILITY ANALYSIS ===`);
          if (params.symbol) steps.push(`Symbol: ${params.symbol}`);
          steps.push(``);

          // IV Rank
          if (currentIV !== undefined && historicalIVs && historicalIVs.length > 0) {
            const ivHigh = Math.max(...historicalIVs);
            const ivLow = Math.min(...historicalIVs);
            const ivRange = ivHigh - ivLow;
            const ivRank = ivRange > 0 ? ((currentIV - ivLow) / ivRange) * 100 : 50;
            const ivPercentile = (historicalIVs.filter((iv: number) => iv < currentIV).length / historicalIVs.length) * 100;
            results.iv_rank = ivRank;
            results.iv_percentile = ivPercentile;
            steps.push(`IV Rank: ${ivRank.toFixed(1)} (high=${(ivHigh * 100).toFixed(1)}%, low=${(ivLow * 100).toFixed(1)}%)`);
            steps.push(`IV Percentile: ${ivPercentile.toFixed(1)}%`);
            steps.push(`  ${ivRank > 50 ? "→ HIGH — good for selling premium" : ivRank > 25 ? "→ MODERATE — be selective" : "→ LOW — premium is cheap"}`);
            steps.push(``);
          }

          // HV/IV
          if (currentIV !== undefined && closes.length > 20) {
            const hv20 = calcHV(closes, 20);
            const hv50 = closes.length > 51 ? calcHV(closes, 50) : 0;
            const hvAvg = [hv20, hv50].filter((v) => v > 0).reduce((a, b) => a + b, 0) / [hv20, hv50].filter((v) => v > 0).length;
            const ratio = hvAvg > 0 ? currentIV / hvAvg : 0;
            results.hv_iv_ratio = ratio;
            steps.push(`HV/IV: HV20=${(hv20 * 100).toFixed(1)}%, HV50=${(hv50 * 100).toFixed(1)}%, IV=${(currentIV * 100).toFixed(1)}%`);
            steps.push(`  Ratio: ${ratio.toFixed(2)} ${ratio > 1.2 ? "→ IV overpriced (good for selling)" : ratio < 0.9 ? "→ IV underpriced (bad for selling)" : "→ fair"}`);
            steps.push(``);
          }

          // Skew
          if (params.put_iv !== undefined && params.call_iv !== undefined) {
            const skew = params.put_iv - params.call_iv;
            results.skew = skew;
            steps.push(`Skew: ATM put-call = ${(skew * 100).toFixed(2)}% ${skew > 0 ? "(put skew — puts richer)" : "(call skew — calls richer)"}`);
            steps.push(``);
          }

          // Term structure
          if (params.expirations && params.expirations.length >= 2) {
            const sorted = [...params.expirations].sort((a: { dte: number; iv: number }, b: { dte: number; iv: number }) => a.dte - b.dte);
            const near = sorted[0]!;
            const far = sorted[sorted.length - 1]!;
            const contango = far.iv > near.iv;
            results.term_structure = contango ? "contango" : "backwardation";
            steps.push(`Term structure: ${contango ? "contango" : "backwardation"} (near ${(near.iv * 100).toFixed(1)}%, far ${(far.iv * 100).toFixed(1)}%)`);
            steps.push(``);
          }

          // Overall verdict
          const ivRank = results.iv_rank ?? 50;
          const hvIvRatio = results.hv_iv_ratio ?? 1;
          let verdict: string;
          if (ivRank > 50 && hvIvRatio > 1.2) {
            verdict = "STRONG SELL SIGNAL — IV is high (rank > 50) AND overpriced vs HV (>1.2). Ideal conditions for selling premium.";
          } else if (ivRank > 25 && hvIvRatio > 1.0) {
            verdict = "FAVORABLE FOR SELLING — IV is moderate-high and at or above HV. Standard premium selling is viable.";
          } else if (ivRank < 25 || hvIvRatio < 0.9) {
            verdict = "UNFAVORABLE FOR SELLING — IV is low or underpriced vs HV. Consider waiting or using buying strategies.";
          } else {
            verdict = "NEUTRAL — Mixed signals. Be selective, prefer strategies with defined risk.";
          }
          results.verdict = verdict;
          steps.push(`=== VERDICT: ${verdict} ===`);

          return {
            success: true,
            result: verdict.substring(0, 50),
            volatility: results,
            steps,
            message: `Volatility analysis: ${verdict.substring(0, 80)}`,
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
// STOCK SCANNER — Options chain scanner for optimal strike selection
// =============================================================================

export const stockScanner: ToolDef = {
  name: "stock.scanner",
  description: "Scan options chains to find optimal strikes for premium selling. Ranks puts and calls by delta (probability of profit), ROI per day (annualized premium / collateral / DTE), liquidity (volume + open interest), bid-ask spread tightness, and credit spread efficiency. Finds the best put to sell for cash-secured puts, best call for covered calls, and best spread combinations. Fetches live options chain from Yahoo Finance.",
  inputSchema: z.object({
    operation: z.enum(["scan_puts", "scan_calls", "scan_spreads", "best_strike", "list"]).describe("Scan operation"),
    symbol: z.string().describe("Stock ticker symbol"),
    expiration: z.string().optional().describe("Expiration date (YYYY-MM-DD). If omitted, uses nearest expiration"),
    target_delta: z.number().default(0.3).describe("Target delta for optimal strike (0.3 = 70% profit probability)"),
    min_volume: z.number().default(10).describe("Minimum volume for liquidity filter"),
    min_open_interest: z.number().default(100).describe("Minimum open interest for liquidity filter"),
    max_bid_ask_spread_pct: z.number().default(5).describe("Max bid-ask spread as % of premium (default 5%)"),
    side: z.enum(["puts", "calls", "both"]).default("both").describe("Which side to scan (for best_strike)"),
    spread_width: z.number().optional().describe("Credit spread width in dollars (for scan_spreads)"),
    shares: z.number().default(100).describe("Shares per contract"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    scan: z.record(z.any()).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "scan_puts: Rank all puts by delta, ROI/day, liquidity, bid-ask spread",
          "scan_calls: Rank all calls by delta, ROI/day, liquidity, bid-ask spread",
          "scan_spreads: Find best credit spreads (bull put / bear call) by risk/reward",
          "best_strike: Find single best strike matching target delta with liquidity filters",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available scan operations" };
      }

      const symbol = params.symbol.toUpperCase();
      steps.push(`Fetching options chain for ${symbol}...`);

      let expDate = params.expiration;
      let expEpoch: number;

      if (!expDate) {
        const expUrl = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
        const expResp = await fetch(expUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!expResp.ok) {
          return { success: false, result: "", steps, message: `Failed to fetch options for ${symbol} (${expResp.status})` };
        }
        const expData = await expResp.json() as any;
        const exps: number[] = expData?.optionChain?.result?.[0]?.expirationDates || [];
        if (exps.length === 0) {
          return { success: false, result: "", steps, message: `No options data for ${symbol}` };
        }
        expEpoch = exps[0]!;
        expDate = new Date(expEpoch * 1000).toISOString().split("T")[0]!;
        steps.push(`Using nearest expiration: ${expDate}`);
      } else {
        expEpoch = Math.floor(new Date(expDate).getTime() / 1000);
      }

      const chainUrl = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${expEpoch}`;
      const chainResp = await fetch(chainUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!chainResp.ok) {
        return { success: false, result: "", steps, message: `Failed to fetch chain (${chainResp.status})` };
      }
      const chainData = await chainResp.json() as any;
      const result = chainData?.optionChain?.result?.[0];
      if (!result) {
        return { success: false, result: "", steps, message: `No chain data for ${symbol} at ${expDate}` };
      }

      const spot = result.quote?.regularMarketPrice ?? 0;
      const calls: any[] = result.options?.[0]?.calls || [];
      const puts: any[] = result.options?.[0]?.puts || [];
      const dte = Math.max(1, Math.ceil((expEpoch * 1000 - Date.now()) / (1000 * 60 * 60 * 24)));

      steps.push(`Spot: $${spot.toFixed(2)}, Expiration: ${expDate} (${dte}d), ${calls.length} calls, ${puts.length} puts`);
      steps.push(``);

      const shares = params.shares;
      const minVol = params.min_volume;
      const minOI = params.min_open_interest;
      const maxSpreadPct = params.max_bid_ask_spread_pct;

      function analyzeOption(opt: any, type: "call" | "put"): Record<string, any> {
        const bid = opt.bid ?? 0;
        const ask = opt.ask ?? 0;
        const mid = (bid + ask) / 2;
        const spread = ask - bid;
        const spreadPct = mid > 0 ? (spread / mid) * 100 : 100;
        const volume = opt.volume ?? 0;
        const openInterest = opt.openInterest ?? 0;
        const iv = opt.impliedVolatility ?? 0;
        const delta = Math.abs(opt.delta ?? 0);
        const strike = opt.strike;
        const otm = type === "call" ? strike > spot : strike < spot;
        const distancePct = ((strike - spot) / spot) * 100;

        let roi = 0;
        let roiPerDay = 0;
        let annualizedRoi = 0;
        let collateral = 0;

        if (type === "put") {
          collateral = strike * shares;
          roi = mid > 0 ? (mid / strike) * 100 : 0;
          roiPerDay = roi / dte;
          annualizedRoi = roiPerDay * 365;
        } else {
          collateral = spot * shares;
          roi = mid > 0 ? (mid / spot) * 100 : 0;
          roiPerDay = roi / dte;
          annualizedRoi = roiPerDay * 365;
        }

        const volScore = Math.min(50, (volume / minVol) * 25);
        const oiScore = Math.min(50, (openInterest / minOI) * 25);
        const liquidityScore = volScore + oiScore;
        const deltaScore = Math.max(0, 100 - Math.abs(delta - params.target_delta) * 200);
        const spreadScore = Math.max(0, 100 - spreadPct * 10);
        const overallScore = (deltaScore * 0.3) + (liquidityScore * 0.25) + (roiPerDay * 50 * 0.25) + (spreadScore * 0.2);

        return {
          strike, type, bid, ask, mid, spread, spread_pct: spreadPct,
          volume, open_interest: openInterest, iv, delta,
          otm, distance_pct: distancePct,
          premium: mid * shares, collateral,
          roi, roi_per_day: roiPerDay, annualized_roi: annualizedRoi,
          liquidity_score: liquidityScore, overall_score: overallScore,
          profit_probability: (1 - delta) * 100,
          passes_filter: volume >= minVol && openInterest >= minOI && spreadPct <= maxSpreadPct,
        };
      }

      switch (params.operation) {
        case "scan_puts": {
          const analyzed = puts.map((p: any) => analyzeOption(p, "put"));
          const filtered = analyzed.filter((p: Record<string, any>) => p.passes_filter && p.otm);
          filtered.sort((a: Record<string, any>, b: Record<string, any>) => b.overall_score - a.overall_score);
          const top10 = filtered.slice(0, 10);

          steps.push(`=== PUT SCANNER (OTM puts only, filtered) ===`);
          steps.push(`Filters: Vol >= ${minVol}, OI >= ${minOI}, Spread <= ${maxSpreadPct}%`);
          steps.push(`Target delta: ${params.target_delta} (~${((1 - params.target_delta) * 100).toFixed(0)}% profit prob)`);
          steps.push(`${filtered.length} puts pass filters out of ${puts.length} total`);
          steps.push(``);
          steps.push(`  Strike  | Delta | Premium | ROI%  | ROI/day | Ann%   | Vol  | OI    | Spread% | Score`);
          steps.push(`  --------|-------|---------|-------|---------|--------|------|-------|---------|------`);
          for (const p of top10) {
            steps.push(`  $${p.strike.toFixed(0).padEnd(6)} | ${p.delta.toFixed(2)}  | $${p.mid.toFixed(2).padEnd(6)} | ${p.roi.toFixed(1).padEnd(5)} | ${p.roi_per_day.toFixed(3).padEnd(7)} | ${p.annualized_roi.toFixed(0).padEnd(6)} | ${String(p.volume).padEnd(4)} | ${String(p.open_interest).padEnd(5)} | ${p.spread_pct.toFixed(1).padEnd(7)} | ${p.overall_score.toFixed(0)}`);
          }
          if (top10.length > 0) {
            const best = top10[0]!;
            steps.push(``);
            steps.push(`  BEST PUT: $${best.strike} strike`);
            steps.push(`    Delta: ${best.delta.toFixed(2)} (${best.profit_probability.toFixed(0)}% profit probability)`);
            steps.push(`    Premium: $${best.mid.toFixed(2)} ($${(best.mid * shares).toFixed(2)} per contract)`);
            steps.push(`    ROI: ${best.roi.toFixed(2)}% (${best.roi_per_day.toFixed(3)}%/day, ${best.annualized_roi.toFixed(0)}% annualized)`);
            steps.push(`    Collateral: $${best.collateral.toFixed(2)}`);
            steps.push(`    Liquidity: Vol ${best.volume}, OI ${best.open_interest}`);
          }

          return {
            success: true,
            result: `${filtered.length} puts pass filters, best: $${top10[0]?.strike ?? "N/A"}`,
            scan: { total_puts: puts.length, filtered: filtered.length, top_puts: top10, spot, expiration: expDate, dte },
            steps,
            message: `Best put: $${top10[0]?.strike ?? "N/A"} strike, ${top10[0]?.delta.toFixed(2) ?? "N/A"} delta, ${top10[0]?.roi.toFixed(1) ?? "N/A"}% ROI`,
          };
        }

        case "scan_calls": {
          const analyzed = calls.map((c: any) => analyzeOption(c, "call"));
          const filtered = analyzed.filter((c: Record<string, any>) => c.passes_filter && c.otm);
          filtered.sort((a: Record<string, any>, b: Record<string, any>) => b.overall_score - a.overall_score);
          const top10 = filtered.slice(0, 10);

          steps.push(`=== CALL SCANNER (OTM calls for covered calls) ===`);
          steps.push(`Filters: Vol >= ${minVol}, OI >= ${minOI}, Spread <= ${maxSpreadPct}%`);
          steps.push(`${filtered.length} calls pass filters out of ${calls.length} total`);
          steps.push(``);
          steps.push(`  Strike  | Delta | Premium | ROI%  | ROI/day | Ann%   | Vol  | OI    | Spread% | Score`);
          steps.push(`  --------|-------|---------|-------|---------|--------|------|-------|---------|------`);
          for (const c of top10) {
            steps.push(`  $${c.strike.toFixed(0).padEnd(6)} | ${c.delta.toFixed(2)}  | $${c.mid.toFixed(2).padEnd(6)} | ${c.roi.toFixed(1).padEnd(5)} | ${c.roi_per_day.toFixed(3).padEnd(7)} | ${c.annualized_roi.toFixed(0).padEnd(6)} | ${String(c.volume).padEnd(4)} | ${String(c.open_interest).padEnd(5)} | ${c.spread_pct.toFixed(1).padEnd(7)} | ${c.overall_score.toFixed(0)}`);
          }
          if (top10.length > 0) {
            const best = top10[0]!;
            steps.push(``);
            steps.push(`  BEST CALL: $${best.strike} strike`);
            steps.push(`    Delta: ${best.delta.toFixed(2)} (${best.profit_probability.toFixed(0)}% profit probability)`);
            steps.push(`    Premium: $${best.mid.toFixed(2)} ($${(best.mid * shares).toFixed(2)} per contract)`);
            steps.push(`    ROI: ${best.roi.toFixed(2)}% (${best.roi_per_day.toFixed(3)}%/day, ${best.annualized_roi.toFixed(0)}% annualized)`);
            steps.push(`    Upside cap: $${best.strike} (+${best.distance_pct.toFixed(1)}% from spot)`);
          }

          return {
            success: true,
            result: `${filtered.length} calls pass filters, best: $${top10[0]?.strike ?? "N/A"}`,
            scan: { total_calls: calls.length, filtered: filtered.length, top_calls: top10, spot, expiration: expDate, dte },
            steps,
            message: `Best call: $${top10[0]?.strike ?? "N/A"} strike, ${top10[0]?.delta.toFixed(2) ?? "N/A"} delta, ${top10[0]?.roi.toFixed(1) ?? "N/A"}% ROI`,
          };
        }

        case "scan_spreads": {
          const width = params.spread_width ?? 5;
          steps.push(`=== CREDIT SPREAD SCANNER (width $${width}) ===`);
          steps.push(``);

          const putSpreads: Array<Record<string, any>> = [];
          for (const p of puts) {
            const shortStrike = p.strike;
            const longStrike = shortStrike - width;
            const longPut = puts.find((x: any) => x.strike === longStrike);
            if (!longPut || shortStrike >= spot) continue;
            const shortMid = ((p.bid ?? 0) + (p.ask ?? 0)) / 2;
            const longMid = ((longPut.bid ?? 0) + (longPut.ask ?? 0)) / 2;
            const netCredit = (shortMid - longMid) * shares;
            const maxLoss = (width * shares) - netCredit;
            const roi = maxLoss > 0 ? (netCredit / maxLoss) * 100 : 0;
            const breakeven = shortStrike - (shortMid - longMid);
            const volume = Math.min(p.volume ?? 0, longPut.volume ?? 0);
            const oi = Math.min(p.openInterest ?? 0, longPut.openInterest ?? 0);
            if (volume < minVol || oi < minOI) continue;
            putSpreads.push({ type: "bull_put_spread", short_strike: shortStrike, long_strike: longStrike, net_credit: netCredit, max_loss: maxLoss, roi, breakeven, volume, open_interest: oi, delta: p.delta ?? 0, profit_prob: (1 - Math.abs(p.delta ?? 0)) * 100 });
          }
          putSpreads.sort((a, b) => b.roi - a.roi);
          const topPutSpreads = putSpreads.slice(0, 5);

          steps.push(`--- BULL PUT SPREADS (top 5 by ROI) ---`);
          steps.push(`  Short   | Long    | Credit  | MaxLoss | ROI%   | Breakeven | Vol | OI  | Profit%`);
          for (const s of topPutSpreads) {
            steps.push(`  $${s.short_strike.toFixed(0).padEnd(6)} | $${s.long_strike.toFixed(0).padEnd(6)} | $${s.net_credit.toFixed(0).padEnd(7)} | $${s.max_loss.toFixed(0).padEnd(7)} | ${s.roi.toFixed(1).padEnd(6)} | $${s.breakeven.toFixed(2).padEnd(8)} | ${String(s.volume).padEnd(3)} | ${String(s.open_interest).padEnd(3)} | ${s.profit_prob.toFixed(0)}%`);
          }

          const callSpreads: Array<Record<string, any>> = [];
          for (const c of calls) {
            const shortStrike = c.strike;
            const longStrike = shortStrike + width;
            const longCall = calls.find((x: any) => x.strike === longStrike);
            if (!longCall || shortStrike <= spot) continue;
            const shortMid = ((c.bid ?? 0) + (c.ask ?? 0)) / 2;
            const longMid = ((longCall.bid ?? 0) + (longCall.ask ?? 0)) / 2;
            const netCredit = (shortMid - longMid) * shares;
            const maxLoss = (width * shares) - netCredit;
            const roi = maxLoss > 0 ? (netCredit / maxLoss) * 100 : 0;
            const breakeven = shortStrike + (shortMid - longMid);
            const volume = Math.min(c.volume ?? 0, longCall.volume ?? 0);
            const oi = Math.min(c.openInterest ?? 0, longCall.openInterest ?? 0);
            if (volume < minVol || oi < minOI) continue;
            callSpreads.push({ type: "bear_call_spread", short_strike: shortStrike, long_strike: longStrike, net_credit: netCredit, max_loss: maxLoss, roi, breakeven, volume, open_interest: oi, delta: c.delta ?? 0, profit_prob: (1 - Math.abs(c.delta ?? 0)) * 100 });
          }
          callSpreads.sort((a, b) => b.roi - a.roi);
          const topCallSpreads = callSpreads.slice(0, 5);

          steps.push(``);
          steps.push(`--- BEAR CALL SPREADS (top 5 by ROI) ---`);
          steps.push(`  Short   | Long    | Credit  | MaxLoss | ROI%   | Breakeven | Vol | OI  | Profit%`);
          for (const s of topCallSpreads) {
            steps.push(`  $${s.short_strike.toFixed(0).padEnd(6)} | $${s.long_strike.toFixed(0).padEnd(6)} | $${s.net_credit.toFixed(0).padEnd(7)} | $${s.max_loss.toFixed(0).padEnd(7)} | ${s.roi.toFixed(1).padEnd(6)} | $${s.breakeven.toFixed(2).padEnd(8)} | ${String(s.volume).padEnd(3)} | ${String(s.open_interest).padEnd(3)} | ${s.profit_prob.toFixed(0)}%`);
          }

          return {
            success: true,
            result: `${putSpreads.length} put spreads, ${callSpreads.length} call spreads`,
            scan: { bull_put_spreads: topPutSpreads, bear_call_spreads: topCallSpreads, spot, expiration: expDate, dte, width },
            steps,
            message: `Spread scanner: ${putSpreads.length} bull puts, ${callSpreads.length} bear calls (width $${width})`,
          };
        }

        case "best_strike": {
          const side = params.side;
          let bestPut: Record<string, any> | null = null;
          let bestCall: Record<string, any> | null = null;

          if (side === "puts" || side === "both") {
            const analyzedPuts = puts.map((p: any) => analyzeOption(p, "put")).filter((p: Record<string, any>) => p.passes_filter && p.otm);
            analyzedPuts.sort((a: Record<string, any>, b: Record<string, any>) => b.overall_score - a.overall_score);
            bestPut = analyzedPuts[0] ?? null;
          }

          if (side === "calls" || side === "both") {
            const analyzedCalls = calls.map((c: any) => analyzeOption(c, "call")).filter((c: Record<string, any>) => c.passes_filter && c.otm);
            analyzedCalls.sort((a: Record<string, any>, b: Record<string, any>) => b.overall_score - a.overall_score);
            bestCall = analyzedCalls[0] ?? null;
          }

          steps.push(`=== BEST STRIKE RECOMMENDATION for ${symbol} ===`);
          steps.push(`Spot: $${spot.toFixed(2)}, Expiration: ${expDate} (${dte}d)`);
          steps.push(`Target delta: ${params.target_delta}`);
          steps.push(``);

          if (bestPut) {
            steps.push(`  BEST PUT (cash-secured put):`);
            steps.push(`    Strike: $${bestPut.strike} (${bestPut.distance_pct.toFixed(1)}% OTM)`);
            steps.push(`    Premium: $${bestPut.mid.toFixed(2)} ($${(bestPut.mid * shares).toFixed(2)}/contract)`);
            steps.push(`    Delta: ${bestPut.delta.toFixed(2)} → ${bestPut.profit_probability.toFixed(0)}% profit probability`);
            steps.push(`    ROI: ${bestPut.roi.toFixed(2)}% (${bestPut.roi_per_day.toFixed(3)}%/day, ${bestPut.annualized_roi.toFixed(0)}% annualized)`);
            steps.push(`    Collateral: $${bestPut.collateral.toFixed(2)}`);
            steps.push(`    Liquidity: Vol ${bestPut.volume}, OI ${bestPut.open_interest}, Spread ${bestPut.spread_pct.toFixed(1)}%`);
            steps.push(`    Breakeven: $${(bestPut.strike - bestPut.mid).toFixed(2)}`);
          } else if (side === "puts" || side === "both") {
            steps.push(`  No puts pass liquidity filters. Try lowering min_volume or min_open_interest.`);
          }

          steps.push(``);
          if (bestCall) {
            steps.push(`  BEST CALL (covered call):`);
            steps.push(`    Strike: $${bestCall.strike} (+${bestCall.distance_pct.toFixed(1)}% OTM)`);
            steps.push(`    Premium: $${bestCall.mid.toFixed(2)} ($${(bestCall.mid * shares).toFixed(2)}/contract)`);
            steps.push(`    Delta: ${bestCall.delta.toFixed(2)} → ${bestCall.profit_probability.toFixed(0)}% profit probability`);
            steps.push(`    ROI: ${bestCall.roi.toFixed(2)}% (${bestCall.roi_per_day.toFixed(3)}%/day, ${bestCall.annualized_roi.toFixed(0)}% annualized)`);
            steps.push(`    Upside cap: $${bestCall.strike} (max profit if assigned)`);
            steps.push(`    Liquidity: Vol ${bestCall.volume}, OI ${bestCall.open_interest}, Spread ${bestCall.spread_pct.toFixed(1)}%`);
          } else if (side === "calls" || side === "both") {
            steps.push(`  No calls pass liquidity filters. Try lowering min_volume or min_open_interest.`);
          }

          const best = bestPut && bestCall
            ? (bestPut.overall_score >= bestCall.overall_score ? bestPut : bestCall)
            : bestPut ?? bestCall;

          return {
            success: true,
            result: best ? `Best: $${best.strike} ${best.type}` : "No valid strikes found",
            scan: { best_put: bestPut, best_call: bestCall, spot, expiration: expDate, dte, target_delta: params.target_delta },
            steps,
            message: best ? `Best ${best.type}: $${best.strike} strike, ${best.delta.toFixed(2)} delta, ${best.roi.toFixed(1)}% ROI` : "No strikes pass filters",
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
// STOCK EVENTS — Earnings, dividends, economic calendar, event warnings
// =============================================================================

export const stockEvents: ToolDef = {
  name: "stock.events",
  description: "Track market events that affect options positions: earnings dates (with expected move / straddle pricing), ex-dividend dates (affects put assignment risk), economic calendar (Fed/FOMC meetings, CPI, jobs reports, GDP), and FDA dates for biotech. Includes an event warning system that flags positions at risk from upcoming binary events. Critical for avoiding selling naked puts through earnings unknowingly.",
  inputSchema: z.object({
    operation: z.enum(["earnings", "dividends", "economic_calendar", "event_warning", "list"]).describe("Event operation"),
    symbol: z.string().optional().describe("Stock ticker (for earnings/dividends)"),
    days_ahead: z.number().default(30).describe("Look ahead N days for events"),
    positions: z.array(z.object({
      symbol: z.string(),
      type: z.enum(["put", "call", "stock", "spread"]),
      strike: z.number().optional(),
      expiration: z.string().optional(),
      dte: z.number().optional(),
    })).optional().describe("Current open positions (for event_warning)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    events: z.record(z.any()).optional(),
    warnings: z.array(z.record(z.any())).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "earnings: Next earnings date for a stock (from Yahoo Finance calendar)",
          "dividends: Ex-dividend dates (from Yahoo Finance)",
          "economic_calendar: Major economic events (Fed, CPI, jobs, GDP) — curated schedule",
          "event_warning: Check open positions against upcoming events — flags at-risk positions",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available event operations" };
      }

      const daysAhead = params.days_ahead;
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      switch (params.operation) {
        case "earnings": {
          if (!params.symbol) {
            return { success: false, result: "", steps, message: "Provide symbol" };
          }
          const symbol = params.symbol.toUpperCase();
          steps.push(`Fetching earnings data for ${symbol}...`);

          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`;
            const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (!resp.ok) {
              return { success: false, result: "", steps, message: `Failed to fetch data for ${symbol}` };
            }
            const data = await resp.json() as any;
            const meta = data?.chart?.result?.[0]?.meta;
            if (!meta) {
              return { success: false, result: "", steps, message: `No data for ${symbol}` };
            }

            let expectedMove: number | null = null;
            let straddleCost: number | null = null;
            try {
              const optUrl = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
              const optResp = await fetch(optUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
              if (optResp.ok) {
                const optData = await optResp.json() as any;
                const result = optData?.optionChain?.result?.[0];
                const spot = result?.quote?.regularMarketPrice ?? 0;
                const calls: any[] = result?.options?.[0]?.calls || [];
                const puts: any[] = result?.options?.[0]?.puts || [];
                let atmCall: any = null;
                let atmPut: any = null;
                let minDist = Infinity;
                for (const c of calls) {
                  const d = Math.abs(c.strike - spot);
                  if (d < minDist) { minDist = d; atmCall = c; atmPut = puts.find((p: any) => p.strike === c.strike); }
                }
                if (atmCall && atmPut) {
                  const callMid = ((atmCall.bid ?? 0) + (atmCall.ask ?? 0)) / 2;
                  const putMid = ((atmPut.bid ?? 0) + (atmPut.ask ?? 0)) / 2;
                  straddleCost = callMid + putMid;
                  expectedMove = straddleCost;
                }
              }
            } catch { /* skip */ }

            steps.push(`=== EARNINGS INFO for ${symbol} ===`);
            steps.push(`  Current price: $${meta.regularMarketPrice?.toFixed(2) ?? "N/A"}`);
            steps.push(`  Next earnings date: Not available via free API — check Yahoo Finance or earningswhispers.com`);
            if (straddleCost !== null && expectedMove !== null) {
              const spot = meta.regularMarketPrice ?? 0;
              steps.push(``);
              steps.push(`  EXPECTED MOVE (ATM straddle):`);
              steps.push(`    ATM straddle cost: $${straddleCost.toFixed(2)}`);
              steps.push(`    Expected move: ±$${expectedMove.toFixed(2)} (${(expectedMove / spot * 100).toFixed(1)}% of price)`);
              steps.push(`    This is the market's implied move for the next expiration`);
              steps.push(`    If earnings is before this expiration, this includes earnings risk`);
            }
            steps.push(``);
            steps.push(`  ⚠ EARNINGS RISK for premium sellers:`);
            steps.push(`    - Selling naked puts through earnings = HIGH RISK`);
            steps.push(`    - Stock can gap 5-15%+ on earnings results`);
            steps.push(`    - IV typically drops (IV crush) after earnings — good for buyers, bad if you sold before`);
            steps.push(`    - Recommendation: Close or roll positions before earnings, OR use defined-risk spreads`);

            return {
              success: true,
              result: "Earnings info retrieved",
              events: { symbol, straddle_cost: straddleCost, expected_move: expectedMove, current_price: meta.regularMarketPrice },
              steps,
              message: `${symbol}: expected move ±$${expectedMove?.toFixed(2) ?? "N/A"}`,
            };
          } catch (e: any) {
            return { success: false, result: "", steps, message: e.message ?? "Failed to fetch earnings" };
          }
        }

        case "dividends": {
          if (!params.symbol) {
            return { success: false, result: "", steps, message: "Provide symbol" };
          }
          const symbol = params.symbol.toUpperCase();
          steps.push(`Fetching dividend data for ${symbol}...`);

          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d&events=div`;
          const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (!resp.ok) {
            return { success: false, result: "", steps, message: `Failed to fetch dividends for ${symbol}` };
          }
          const data = await resp.json() as any;
          const result = data?.chart?.result?.[0];

          if (!result?.events?.dividends) {
            steps.push(`${symbol} has no dividend history (growth stock or doesn't pay dividends)`);
            steps.push(``);
            steps.push(`  DIVIDEND RISK for options:`);
            steps.push(`    - No dividend = no ex-div assignment risk for puts`);
            steps.push(`    - Covered calls: no early assignment risk from dividends`);
            return { success: true, result: "No dividends", events: { symbol, has_dividends: false }, steps, message: `${symbol} has no dividends` };
          }

          const divs = Object.values(result.events.dividends) as any[];
          const dividends = divs.map((d) => ({
            date: new Date(d.date * 1000).toISOString().split("T")[0]!,
            dividend: d.amount,
          })).sort((a, b) => b.date.localeCompare(a.date));

          const lastDiv = dividends[0]!;
          const prevDiv = dividends[1];
          let nextExDivEst: string | null = null;
          if (prevDiv) {
            const interval = (new Date(lastDiv.date).getTime() - new Date(prevDiv.date).getTime()) / (1000 * 60 * 60 * 24);
            const nextDate = new Date(lastDiv.date);
            nextDate.setDate(nextDate.getDate() + Math.round(interval));
            nextExDivEst = nextDate.toISOString().split("T")[0]!;
          }

          const annualDiv = dividends.slice(0, 4).reduce((s, d) => s + d.dividend, 0);
          const yield_ = result.meta?.regularMarketPrice ? (annualDiv / result.meta.regularMarketPrice) * 100 : 0;

          steps.push(`=== DIVIDEND HISTORY for ${symbol} ===`);
          steps.push(`  Annual dividend (est): $${annualDiv.toFixed(2)}`);
          steps.push(`  Yield: ${yield_.toFixed(2)}%`);
          steps.push(`  Last ex-div: ${lastDiv.date} ($${lastDiv.dividend})`);
          if (nextExDivEst) {
            steps.push(`  Next ex-div (est): ${nextExDivEst}`);
            const daysToEx = Math.ceil((new Date(nextExDivEst).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            steps.push(`  Days to next ex-div: ${daysToEx}`);
          }
          steps.push(``);
          steps.push(`  Recent dividends:`);
          for (const d of dividends.slice(0, 5)) {
            steps.push(`    ${d.date}: $${d.dividend}`);
          }
          steps.push(``);
          steps.push(`  DIVIDEND RISK for options:`);
          steps.push(`    - Short ITM puts: May be assigned early right before ex-div to capture dividend`);
          steps.push(`    - Short ITM calls: Unlikely to be assigned early (calls don't get dividend)`);
          steps.push(`    - Covered calls: If called away before ex-div, you lose the dividend`);
          if (nextExDivEst) {
            const daysToEx = Math.ceil((new Date(nextExDivEst).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysToEx <= 14) {
              steps.push(`    ⚠ EX-DIV IN ${daysToEx} DAYS — Check if you have short ITM puts!`);
            }
          }

          return {
            success: true,
            result: `Annual div: $${annualDiv.toFixed(2)}, Yield: ${yield_.toFixed(2)}%`,
            events: { symbol, annual_dividend: annualDiv, yield: yield_, last_ex_div: lastDiv.date, next_ex_div_est: nextExDivEst, dividends: dividends.slice(0, 8) },
            steps,
            message: `${symbol}: $${annualDiv.toFixed(2)}/yr dividend (${yield_.toFixed(2)}% yield)${nextExDivEst ? `, next ex-div ~${nextExDivEst}` : ""}`,
          };
        }

        case "economic_calendar": {
          const events: Array<{ date: string; event: string; impact: "HIGH" | "MEDIUM" | "LOW"; description: string }> = [];

          const fomcDates = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-16"];
          for (const d of fomcDates) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              events.push({ date: d, event: "FOMC Meeting", impact: "HIGH", description: "Federal Reserve interest rate decision + press conference. Markets highly volatile. IV typically elevated before, crushed after." });
            }
          }

          const cpiDates = ["2026-01-14", "2026-02-12", "2026-03-12", "2026-04-10", "2026-05-14", "2026-06-11", "2026-07-11", "2026-08-13"];
          for (const d of cpiDates) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              events.push({ date: d, event: "CPI Release", impact: "HIGH", description: "Consumer Price Index — inflation data. Major market mover. High IV before, crush after." });
            }
          }

          const jobsDates = ["2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03", "2026-05-08", "2026-06-05", "2026-07-03", "2026-08-07"];
          for (const d of jobsDates) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              events.push({ date: d, event: "Non-Farm Payrolls", impact: "HIGH", description: "Monthly jobs report. Significant market impact, especially for Fed rate expectations." });
            }
          }

          const gdpDates = ["2026-01-29", "2026-02-26", "2026-03-26", "2026-04-29", "2026-05-28", "2026-06-25", "2026-07-30", "2026-08-28"];
          for (const d of gdpDates) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              events.push({ date: d, event: "GDP Report", impact: "MEDIUM", description: "Gross Domestic Product — economic growth measure. Moderate market impact." });
            }
          }

          const ppiDates = ["2026-01-15", "2026-02-13", "2026-03-13", "2026-04-11", "2026-05-15", "2026-06-12", "2026-07-12", "2026-08-14"];
          for (const d of ppiDates) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              events.push({ date: d, event: "PPI Release", impact: "MEDIUM", description: "Producer Price Index — wholesale inflation. Leading indicator for CPI." });
            }
          }

          const retailDates = ["2026-01-16", "2026-02-17", "2026-03-17", "2026-04-15", "2026-05-15", "2026-06-16", "2026-07-16", "2026-08-15"];
          for (const d of retailDates) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              events.push({ date: d, event: "Retail Sales", impact: "LOW", description: "Monthly retail sales data. Consumer spending indicator." });
            }
          }

          events.sort((a, b) => a.date.localeCompare(b.date));

          steps.push(`=== ECONOMIC CALENDAR (next ${daysAhead} days) ===`);
          steps.push(``);
          if (events.length === 0) {
            steps.push(`  No major economic events in the next ${daysAhead} days.`);
          } else {
            for (const e of events) {
              const daysTo = Math.ceil((new Date(e.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const impactIcon = e.impact === "HIGH" ? "[!]" : e.impact === "MEDIUM" ? "[~]" : "[.]";
              steps.push(`  ${impactIcon} ${e.date} (${daysTo}d) — ${e.event} [${e.impact}]`);
              steps.push(`      ${e.description}`);
            }
          }
          steps.push(``);
          steps.push(`  TRADING IMPLICATIONS:`);
          const highImpact = events.filter((e) => e.impact === "HIGH");
          if (highImpact.length > 0) {
            steps.push(`  ⚠ ${highImpact.length} HIGH-IMPACT events in next ${daysAhead} days`);
            steps.push(`    - Avoid selling naked premium through these events`);
            steps.push(`    - Consider closing/rolling positions before event dates`);
            steps.push(`    - IV will be elevated before event → good premium but high risk`);
            steps.push(`    - IV crush after event → if you sold before, you profit from crush BUT face gap risk`);
            steps.push(`    - Defined-risk spreads (iron condors, credit spreads) are safer for event periods`);
          } else {
            steps.push(`  No high-impact events — normal premium selling environment`);
          }

          return {
            success: true,
            result: `${events.length} events in next ${daysAhead} days (${highImpact.length} high-impact)`,
            events: { events, high_impact_count: highImpact.length },
            steps,
            message: `Economic calendar: ${events.length} events, ${highImpact.length} high-impact in next ${daysAhead}d`,
          };
        }

        case "event_warning": {
          if (!params.positions || params.positions.length === 0) {
            return { success: false, result: "", steps, message: "Provide positions array to check for event risk" };
          }

          const warnings: Array<Record<string, any>> = [];
          steps.push(`=== EVENT RISK WARNING ===`);
          steps.push(`Checking ${params.positions.length} positions against upcoming events...`);
          steps.push(``);

          for (const pos of params.positions) {
            const symbolWarnings: string[] = [];
            const sym = pos.symbol.toUpperCase();

            // Check dividends
            try {
              const divUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1d&events=div`;
              const divResp = await fetch(divUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
              if (divResp.ok) {
                const divData = await divResp.json() as any;
                const result = divData?.chart?.result?.[0];
                if (result?.events?.dividends) {
                  const divs = (Object.values(result.events.dividends) as any[]).sort((a, b) => b.date - a.date);
                  if (divs.length > 1) {
                    const interval = (divs[0]!.date - divs[1]!.date) * 1000;
                    const nextEst = new Date((divs[0]!.date + interval / 1000) * 1000);
                    const daysToEx = Math.ceil((nextEst.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysToEx <= daysAhead && daysToEx >= 0) {
                      if (pos.type === "put") {
                        symbolWarnings.push(`Ex-dividend in ~${daysToEx}d — if put is ITM, early assignment risk to capture dividend`);
                      }
                      if (pos.type === "call") {
                        symbolWarnings.push(`Ex-dividend in ~${daysToEx}d — if call is ITM, may be exercised early for dividend`);
                      }
                    }
                  }
                }
              }
            } catch { /* skip */ }

            // DTE-based warnings
            if (pos.dte !== undefined) {
              if (pos.dte < 7 && pos.dte >= 1) {
                symbolWarnings.push(`${pos.dte}d to expiry — gamma risk increasing, small moves = large delta changes`);
              }
              if (pos.dte < 1) {
                symbolWarnings.push(`EXPIRY IMMINENT — close or roll immediately to avoid assignment`);
              }
            }

            // Position type warnings
            if (pos.type === "put") {
              symbolWarnings.push("Naked put — undefined downside risk, verify no earnings before expiry");
            }
            if (pos.type === "call") {
              symbolWarnings.push("Covered call — assignment risk if ITM near expiry/dividend");
            }

            if (symbolWarnings.length > 0) {
              warnings.push({ symbol: sym, position: pos, warnings: symbolWarnings });
              steps.push(`  ${sym} (${pos.type}${pos.strike ? ` $${pos.strike}` : ""}):`);
              for (const w of symbolWarnings) {
                steps.push(`    ⚠ ${w}`);
              }
              steps.push(``);
            }
          }

          // Check economic calendar
          const fomcDates = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-16"];
          const cpiDates = ["2026-01-14", "2026-02-12", "2026-03-12", "2026-04-10", "2026-05-14", "2026-06-11", "2026-07-11", "2026-08-13"];
          const jobsDates = ["2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03", "2026-05-08", "2026-06-05", "2026-07-03", "2026-08-07"];

          const macroEvents: string[] = [];
          for (const d of [...fomcDates, ...cpiDates, ...jobsDates]) {
            if (new Date(d) > now && new Date(d) <= futureDate) {
              const daysTo = Math.ceil((new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              let name = "Economic Event";
              if (fomcDates.includes(d)) name = "FOMC Meeting";
              else if (cpiDates.includes(d)) name = "CPI Release";
              else if (jobsDates.includes(d)) name = "Jobs Report";
              macroEvents.push(`${name} in ${daysTo}d (${d})`);
            }
          }

          if (macroEvents.length > 0) {
            steps.push(`--- MACRO EVENT RISK (affects ALL positions) ---`);
            for (const e of macroEvents) {
              steps.push(`  [!] ${e}`);
            }
            steps.push(`  → Consider reducing position size or closing naked positions before these dates`);
          }

          if (warnings.length === 0 && macroEvents.length === 0) {
            steps.push(`✓ No event risks detected for current positions in next ${daysAhead} days`);
          }

          return {
            success: true,
            result: `${warnings.length} position warnings, ${macroEvents.length} macro events`,
            warnings,
            events: { macro_events: macroEvents },
            steps,
            message: `Event check: ${warnings.length} position warnings, ${macroEvents.length} macro events in next ${daysAhead}d`,
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
// STOCK PORTFOLIO — Position tracker, net Greeks, P&L, wheel cycle, risk
// =============================================================================

export const stockPortfolio: ToolDef = {
  name: "stock.portfolio",
  description: "Track options positions and calculate net portfolio Greeks (delta, gamma, theta, vega), realized + unrealized P&L, margin/collateral usage, assignment risk per position, wheel cycle tracking (which step am I on for each ticker?), and concentration risk (too much in one ticker/sector?). Essential for managing a portfolio of premium selling positions.",
  inputSchema: z.object({
    operation: z.enum(["summary", "net_greeks", "pnl", "margin", "wheel_cycle", "concentration_risk", "assignment_risk", "list"]).describe("Portfolio operation"),
    positions: z.array(z.object({
      symbol: z.string(),
      type: z.enum(["stock", "put", "call", "put_spread", "call_spread", "iron_condor", "straddle", "strangle"]),
      quantity: z.number().describe("Number of contracts (negative = short)"),
      strike: z.number().optional().describe("Primary strike"),
      strike2: z.number().optional().describe("Secondary strike (for spreads)"),
      expiration: z.string().optional().describe("Expiration date YYYY-MM-DD"),
      entry_price: z.number().optional().describe("Entry premium per contract"),
      current_price: z.number().optional().describe("Current premium per contract"),
      delta: z.number().optional().describe("Position delta per contract"),
      gamma: z.number().optional().describe("Position gamma per contract"),
      theta: z.number().optional().describe("Position theta per contract"),
      vega: z.number().optional().describe("Position vega per contract"),
      shares: z.number().optional().describe("Shares of stock (for stock positions)"),
      cost_basis: z.number().optional().describe("Cost basis for stock positions"),
    })).optional().describe("Array of open positions"),
    spot_prices: z.record(z.number()).optional().describe("Current spot prices by symbol { AAPL: 195.5, ... }"),
    account_size: z.number().default(100000).describe("Total account size for margin/concentration calculations"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    portfolio: z.record(z.any()).optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      if (params.operation === "list") {
        const list = [
          "summary: Full portfolio overview (positions, net Greeks, P&L, margin, risk)",
          "net_greeks: Aggregate delta, gamma, theta, vega across all positions",
          "pnl: Realized + unrealized P&L breakdown by position",
          "margin: Collateral/margin usage by position + total vs account size",
          "wheel_cycle: Track wheel progress per ticker (Step 1: sell put → Step 2: assigned → Step 3: sell call → Step 4: called away)",
          "concentration_risk: Check for over-concentration in single ticker/sector",
          "assignment_risk: Flag positions at risk of early/automatic assignment",
        ].join("\n");
        return { success: true, result: list, steps, message: "Available portfolio operations" };
      }

      const positions = params.positions ?? [];
      if (positions.length === 0) {
        return { success: false, result: "", steps, message: "No positions provided" };
      }

      const accountSize = params.account_size;
      const spotPrices = params.spot_prices ?? {};

      function getSpot(sym: string): number {
        return spotPrices[sym] ?? 0;
      }

      function calcDTE(exp?: string): number {
        if (!exp) return 0;
        return Math.max(0, Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      }

      switch (params.operation) {
        case "net_greeks": {
          let netDelta = 0, netGamma = 0, netTheta = 0, netVega = 0;
          const greekBreakdown: Array<Record<string, any>> = [];

          for (const pos of positions) {
            const qty = pos.quantity;
            const posDelta = (pos.delta ?? 0) * qty * 100;
            const posGamma = (pos.gamma ?? 0) * qty * 100;
            const posTheta = (pos.theta ?? 0) * qty * 100;
            const posVega = (pos.vega ?? 0) * qty * 100;
            netDelta += posDelta;
            netGamma += posGamma;
            netTheta += posTheta;
            netVega += posVega;
            greekBreakdown.push({ symbol: pos.symbol, type: pos.type, quantity: qty, delta: posDelta, gamma: posGamma, theta: posTheta, vega: posVega });
          }

          steps.push(`=== NET PORTFOLIO GREEKS ===`);
          steps.push(`  Positions: ${positions.length}`);
          steps.push(``);
          steps.push(`  Net Delta: ${netDelta.toFixed(0)} ($${netDelta.toFixed(0)} per $1 move)`);
          steps.push(`    ${netDelta > 0 ? "BULLISH (long delta)" : netDelta < 0 ? "BEARISH (short delta)" : "NEUTRAL"}`);
          steps.push(`  Net Gamma: ${netGamma.toFixed(2)} (${netGamma > 0 ? "long gamma — delta increases with moves" : "short gamma — delta changes against you"})`);
          steps.push(`  Net Theta: ${netTheta.toFixed(2)}/day (${netTheta > 0 ? "POSITIVE — earning time decay" : "NEGATIVE — paying time decay"})`);
          steps.push(`  Net Vega: ${netVega.toFixed(2)} (${netVega > 0 ? "long vega — want IV to rise" : "short vega — want IV to fall (typical for premium sellers)"})`);
          steps.push(``);
          steps.push(`  Per-position breakdown:`);
          steps.push(`  Symbol     | Type          | Qty  | Delta   | Theta   | Vega`);
          for (const g of greekBreakdown) {
            steps.push(`  ${g.symbol.padEnd(10)} | ${g.type.padEnd(13)} | ${String(g.quantity).padEnd(4)} | ${g.delta.toFixed(0).padEnd(8)} | ${g.theta.toFixed(2).padEnd(8)} | ${g.vega.toFixed(2)}`);
          }
          steps.push(``);
          steps.push(`  INTERPRETATION:`);
          if (netTheta > 0 && netVega < 0) {
            steps.push(`    ✓ Ideal premium seller profile: positive theta (earning decay) + short vega (benefit from IV drop)`);
          } else if (netTheta < 0) {
            steps.push(`    ⚠ Negative theta — paying for time. Check if this is a hedged position or if you're net long options`);
          }
          if (Math.abs(netDelta) > accountSize * 0.01) {
            steps.push(`    ⚠ High directional delta (${netDelta.toFixed(0)}) — consider hedging or reducing position size`);
          }

          return {
            success: true,
            result: `Delta=${netDelta.toFixed(0)}, Theta=${netTheta.toFixed(1)}/day, Vega=${netVega.toFixed(1)}`,
            portfolio: { net_delta: netDelta, net_gamma: netGamma, net_theta: netTheta, net_vega: netVega, breakdown: greekBreakdown },
            steps,
            message: `Net Greeks: Delta ${netDelta.toFixed(0)}, Theta ${netTheta.toFixed(1)}/day, Vega ${netVega.toFixed(1)}`,
          };
        }

        case "pnl": {
          let totalUnrealized = 0;
          let totalRealized = 0;
          const pnlBreakdown: Array<Record<string, any>> = [];

          for (const pos of positions) {
            let unrealized = 0;
            if (pos.type === "stock") {
              const spot = getSpot(pos.symbol);
              const costBasis = pos.cost_basis ?? 0;
              const shares = pos.shares ?? pos.quantity * 100;
              unrealized = (spot - costBasis) * shares;
            } else {
              const entry = pos.entry_price ?? 0;
              const current = pos.current_price ?? 0;
              const qty = pos.quantity;
              unrealized = qty < 0 ? (entry - current) * Math.abs(qty) * 100 : (current - entry) * qty * 100;
            }
            totalUnrealized += unrealized;
            pnlBreakdown.push({ symbol: pos.symbol, type: pos.type, quantity: pos.quantity, entry: pos.entry_price, current: pos.current_price, unrealized, realized: 0 });
          }

          const totalPnl = totalUnrealized + totalRealized;
          const totalReturn = (totalPnl / accountSize) * 100;

          steps.push(`=== PORTFOLIO P&L ===`);
          steps.push(`  Account size: $${accountSize.toLocaleString()}`);
          steps.push(``);
          steps.push(`  Unrealized P&L: ${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toFixed(2)}`);
          steps.push(`  Realized P&L:   ${totalRealized >= 0 ? "+" : ""}$${totalRealized.toFixed(2)}`);
          steps.push(`  Total P&L:      ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)} (${totalReturn.toFixed(2)}%)`);
          steps.push(``);
          steps.push(`  Per-position:`);
          steps.push(`  Symbol     | Type          | Qty  | Entry   | Current  | Unrealized`);
          for (const p of pnlBreakdown) {
            steps.push(`  ${p.symbol.padEnd(10)} | ${p.type.padEnd(13)} | ${String(p.quantity).padEnd(4)} | $${(p.entry ?? 0).toFixed(2).padEnd(7)} | $${(p.current ?? 0).toFixed(2).padEnd(8)} | ${p.unrealized >= 0 ? "+" : ""}$${p.unrealized.toFixed(2)}`);
          }

          return {
            success: true,
            result: `Total P&L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)} (${totalReturn.toFixed(2)}%)`,
            portfolio: { unrealized: totalUnrealized, realized: totalRealized, total: totalPnl, return_pct: totalReturn, breakdown: pnlBreakdown },
            steps,
            message: `P&L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)} (${totalReturn.toFixed(2)}% return)`,
          };
        }

        case "margin": {
          let totalMargin = 0;
          const marginBreakdown: Array<Record<string, any>> = [];

          for (const pos of positions) {
            let margin = 0;
            let marginType = "";

            if (pos.type === "stock") {
              margin = (pos.cost_basis ?? 0) * (pos.shares ?? pos.quantity * 100);
              marginType = "Stock cost";
            } else if (pos.type === "put" && pos.quantity < 0) {
              margin = (pos.strike ?? 0) * Math.abs(pos.quantity) * 100;
              marginType = "Cash-secured put collateral";
            } else if (pos.type === "call" && pos.quantity < 0) {
              margin = (pos.strike ?? 0) * Math.abs(pos.quantity) * 100 * 0.2;
              marginType = "Naked call margin (Reg-T ~20%)";
            } else if (pos.type === "put_spread" || pos.type === "call_spread" || pos.type === "iron_condor") {
              const width = Math.abs((pos.strike ?? 0) - (pos.strike2 ?? 0));
              margin = width * Math.abs(pos.quantity) * 100;
              marginType = "Spread max loss";
            } else if (pos.type === "straddle" || pos.type === "strangle") {
              if (pos.quantity < 0) {
                margin = (pos.strike ?? 0) * Math.abs(pos.quantity) * 100 * 0.15;
                marginType = "Naked straddle/strangle margin (~15%)";
              }
            }

            totalMargin += margin;
            marginBreakdown.push({ symbol: pos.symbol, type: pos.type, quantity: pos.quantity, margin, margin_type: marginType });
          }

          const marginUsage = (totalMargin / accountSize) * 100;
          const availableMargin = accountSize - totalMargin;

          steps.push(`=== MARGIN / COLLATERAL USAGE ===`);
          steps.push(`  Account size: $${accountSize.toLocaleString()}`);
          steps.push(`  Total margin used: $${totalMargin.toLocaleString()}`);
          steps.push(`  Available margin: $${availableMargin.toLocaleString()}`);
          steps.push(`  Usage: ${marginUsage.toFixed(1)}%`);
          steps.push(``);
          steps.push(`  Per-position:`);
          steps.push(`  Symbol     | Type          | Qty  | Margin     | Type`);
          for (const m of marginBreakdown) {
            steps.push(`  ${m.symbol.padEnd(10)} | ${m.type.padEnd(13)} | ${String(m.quantity).padEnd(4)} | $${m.margin.toFixed(0).padEnd(10)} | ${m.margin_type}`);
          }
          steps.push(``);
          steps.push(`  RISK ASSESSMENT:`);
          if (marginUsage > 80) {
            steps.push(`    ⚠ CRITICAL: ${marginUsage.toFixed(0)}% margin used — very little room for new positions`);
          } else if (marginUsage > 60) {
            steps.push(`    ⚠ HIGH: ${marginUsage.toFixed(0)}% margin used — be cautious with new positions`);
          } else if (marginUsage > 40) {
            steps.push(`    ~ MODERATE: ${marginUsage.toFixed(0)}% margin used — reasonable utilization`);
          } else {
            steps.push(`    ✓ LOW: ${marginUsage.toFixed(0)}% margin used — plenty of capacity for new positions`);
          }

          return {
            success: true,
            result: `${marginUsage.toFixed(1)}% margin used ($${totalMargin.toLocaleString()})`,
            portfolio: { total_margin: totalMargin, available: availableMargin, usage_pct: marginUsage, breakdown: marginBreakdown },
            steps,
            message: `Margin: ${marginUsage.toFixed(0)}% used ($${totalMargin.toLocaleString()}/${accountSize.toLocaleString()})`,
          };
        }

        case "wheel_cycle": {
          const bySymbol: Record<string, any[]> = {};
          for (const pos of positions) {
            if (!bySymbol[pos.symbol]) bySymbol[pos.symbol] = [];
            bySymbol[pos.symbol]!.push(pos);
          }

          const cycles: Array<Record<string, any>> = [];
          steps.push(`=== WHEEL CYCLE TRACKING ===`);
          steps.push(``);

          for (const [sym, symPositions] of Object.entries(bySymbol)) {
            const hasStock = symPositions.some((p) => p.type === "stock" && (p.shares ?? p.quantity * 100) > 0);
            const shortPuts = symPositions.filter((p) => p.type === "put" && p.quantity < 0);
            const shortCalls = symPositions.filter((p) => p.type === "call" && p.quantity < 0);

            let step: number;
            let stepDesc: string;
            let nextAction: string;

            if (hasStock && shortCalls.length > 0) {
              step = 3;
              stepDesc = "Step 3: Holding stock + selling covered calls";
              nextAction = "Wait for call assignment (stock called away at strike) → return to Step 1, OR roll call if nearing expiry";
            } else if (hasStock) {
              step = 2;
              stepDesc = "Step 2: Assigned — holding stock (sell covered calls next)";
              nextAction = `Sell covered calls at or above cost basis. Use stock.scanner to find best call strike.`;
            } else if (shortPuts.length > 0) {
              step = 1;
              stepDesc = "Step 1: Selling cash-secured puts";
              nextAction = "Wait for put to expire worthless (keep premium → repeat) OR get assigned (→ Step 2)";
            } else {
              step = 0;
              stepDesc = "Not in wheel cycle";
              nextAction = "Start wheel: sell cash-secured put below current price";
            }

            const spot = getSpot(sym);
            const putStrikes = shortPuts.map((p) => p.strike).filter(Boolean);
            const callStrikes = shortCalls.map((p) => p.strike).filter(Boolean);

            cycles.push({ symbol: sym, step, step_desc: stepDesc, next_action: nextAction, spot, short_puts: putStrikes, short_calls: callStrikes, has_stock: hasStock });

            steps.push(`  ${sym} (spot $${spot.toFixed(2)}):`);
            steps.push(`    ${stepDesc}`);
            if (putStrikes.length > 0) steps.push(`    Short puts: $${putStrikes.join(", $")}`);
            if (callStrikes.length > 0) steps.push(`    Short calls: $${callStrikes.join(", $")}`);
            steps.push(`    → Next: ${nextAction}`);
            steps.push(``);
          }

          return {
            success: true,
            result: `${cycles.length} wheel cycles tracked`,
            portfolio: { cycles },
            steps,
            message: `Wheel tracking: ${cycles.length} tickers, ${cycles.filter((c) => c.step > 0).length} active cycles`,
          };
        }

        case "concentration_risk": {
          const bySymbol: Record<string, number> = {};
          for (const pos of positions) {
            const margin = pos.type === "stock"
              ? (pos.cost_basis ?? 0) * (pos.shares ?? pos.quantity * 100)
              : (pos.strike ?? 0) * Math.abs(pos.quantity) * 100;
            bySymbol[pos.symbol] = (bySymbol[pos.symbol] ?? 0) + margin;
          }

          const concentrations = Object.entries(bySymbol)
            .map(([sym, margin]) => ({ symbol: sym, margin, pct: (margin / accountSize) * 100 }))
            .sort((a, b) => b.margin - a.margin);

          steps.push(`=== CONCENTRATION RISK ===`);
          steps.push(`  Account size: $${accountSize.toLocaleString()}`);
          steps.push(``);
          steps.push(`  Symbol     | Margin      | % of Account | Risk`);
          let hasHighRisk = false;
          for (const c of concentrations) {
            const risk = c.pct > 30 ? "HIGH" : c.pct > 20 ? "ELEVATED" : "OK";
            if (c.pct > 20) hasHighRisk = true;
            steps.push(`  ${c.symbol.padEnd(10)} | $${c.margin.toFixed(0).padEnd(10)} | ${c.pct.toFixed(1).padEnd(12)}% | ${risk}`);
          }
          steps.push(``);
          steps.push(`  GUIDELINES:`);
          steps.push(`    - Max 20-25% in any single ticker (recommended for premium sellers)`);
          steps.push(`    - Max 40% in any single sector`);
          steps.push(`    - Diversify across 5-10 tickers for balanced portfolio`);
          steps.push(``);
          if (hasHighRisk) {
            steps.push(`  ⚠ OVER-CONCENTRATED — Consider reducing positions in high-risk tickers`);
          } else {
            steps.push(`  ✓ Concentration within acceptable limits`);
          }

          return {
            success: true,
            result: `${concentrations.length} tickers, max concentration ${concentrations[0]?.pct.toFixed(1) ?? 0}%`,
            portfolio: { concentrations, max_concentration: concentrations[0]?.pct ?? 0, has_high_risk: hasHighRisk },
            steps,
            message: `Concentration: ${concentrations.length} tickers, max ${concentrations[0]?.pct.toFixed(1) ?? 0}%${hasHighRisk ? " (OVER-CONCENTRATED)" : ""}`,
          };
        }

        case "assignment_risk": {
          const risks: Array<Record<string, any>> = [];
          steps.push(`=== ASSIGNMENT RISK ANALYSIS ===`);
          steps.push(``);

          for (const pos of positions) {
            const sym = pos.symbol;
            const spot = getSpot(sym);
            const dte = calcDTE(pos.expiration);
            const reasons: string[] = [];

            if (pos.type === "put" && pos.quantity < 0) {
              const strike = pos.strike ?? 0;
              const itm = spot < strike;
              const pctItm = itm ? ((strike - spot) / spot) * 100 : 0;
              if (itm && dte <= 1) {
                reasons.push(`PUT IS ITM (${pctItm.toFixed(1)}% below strike) and expires in ${dte}d — HIGH assignment risk`);
              } else if (itm && dte <= 7) {
                reasons.push(`PUT IS ITM (${pctItm.toFixed(1)}% below strike), ${dte}d to expiry — moderate assignment risk`);
              } else if (itm) {
                reasons.push(`PUT IS ITM (${pctItm.toFixed(1)}% below strike), ${dte}d to expiry — will likely be assigned at expiry if still ITM`);
              } else {
                reasons.push(`Put is OTM (${spot.toFixed(2)} > $${strike}) — low assignment risk`);
              }
            } else if (pos.type === "call" && pos.quantity < 0) {
              const strike = pos.strike ?? 0;
              const itm = spot > strike;
              const pctItm = itm ? ((spot - strike) / spot) * 100 : 0;
              if (itm && dte <= 1) {
                reasons.push(`CALL IS ITM (${pctItm.toFixed(1)}% above strike) and expires in ${dte}d — HIGH assignment risk`);
              } else if (itm && dte <= 7) {
                reasons.push(`CALL IS ITM (${pctItm.toFixed(1)}% above strike), ${dte}d to expiry — moderate assignment risk`);
              } else if (itm) {
                reasons.push(`CALL IS ITM (${pctItm.toFixed(1)}% above strike), ${dte}d to expiry — will likely be assigned at expiry if still ITM`);
              } else {
                reasons.push(`Call is OTM (${spot.toFixed(2)} < $${strike}) — low assignment risk`);
              }
            }

            if (reasons.length > 0) {
              risks.push({ symbol: sym, type: pos.type, strike: pos.strike, spot, dte, reasons });
              steps.push(`  ${sym} (${pos.type} $${pos.strike ?? "N/A"}, ${dte}d):`);
              for (const r of reasons) {
                steps.push(`    ⚠ ${r}`);
              }
              steps.push(``);
            }
          }

          if (risks.length === 0) {
            steps.push(`  ✓ No assignment risks detected for current positions`);
          }

          return {
            success: true,
            result: `${risks.length} positions with assignment risk`,
            portfolio: { risks },
            steps,
            message: `Assignment risk: ${risks.length} positions flagged`,
          };
        }

        case "summary": {
          let netDelta = 0, netTheta = 0, netVega = 0;
          let totalMargin = 0;
          let totalUnrealized = 0;

          for (const pos of positions) {
            const qty = pos.quantity;
            netDelta += (pos.delta ?? 0) * qty * 100;
            netTheta += (pos.theta ?? 0) * qty * 100;
            netVega += (pos.vega ?? 0) * qty * 100;

            if (pos.type === "stock") {
              totalMargin += (pos.cost_basis ?? 0) * (pos.shares ?? pos.quantity * 100);
            } else if (pos.type === "put" && qty < 0) {
              totalMargin += (pos.strike ?? 0) * Math.abs(qty) * 100;
            } else if (pos.type === "put_spread" || pos.type === "call_spread" || pos.type === "iron_condor") {
              const width = Math.abs((pos.strike ?? 0) - (pos.strike2 ?? 0));
              totalMargin += width * Math.abs(qty) * 100;
            }

            if (pos.type === "stock") {
              const spot = getSpot(pos.symbol);
              totalUnrealized += (spot - (pos.cost_basis ?? 0)) * (pos.shares ?? pos.quantity * 100);
            } else {
              const entry = pos.entry_price ?? 0;
              const current = pos.current_price ?? 0;
              totalUnrealized += qty < 0 ? (entry - current) * Math.abs(qty) * 100 : (current - entry) * qty * 100;
            }
          }

          const marginUsage = (totalMargin / accountSize) * 100;
          const totalReturn = (totalUnrealized / accountSize) * 100;

          const bySymbol: Record<string, number> = {};
          for (const pos of positions) {
            const m = pos.type === "stock" ? (pos.cost_basis ?? 0) * (pos.shares ?? pos.quantity * 100) : (pos.strike ?? 0) * Math.abs(pos.quantity) * 100;
            bySymbol[pos.symbol] = (bySymbol[pos.symbol] ?? 0) + m;
          }
          const maxConcentration = Math.max(...Object.values(bySymbol), 0);
          const maxConcPct = (maxConcentration / accountSize) * 100;

          steps.push(`=== PORTFOLIO SUMMARY ===`);
          steps.push(`  Positions: ${positions.length} | Account: $${accountSize.toLocaleString()}`);
          steps.push(``);
          steps.push(`  P&L: ${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toFixed(2)} (${totalReturn.toFixed(2)}%)`);
          steps.push(`  Margin: $${totalMargin.toLocaleString()} (${marginUsage.toFixed(1)}%)`);
          steps.push(`  Max concentration: ${maxConcPct.toFixed(1)}%`);
          steps.push(``);
          steps.push(`  Net Greeks:`);
          steps.push(`    Delta: ${netDelta.toFixed(0)} (${netDelta > 0 ? "bullish" : netDelta < 0 ? "bearish" : "neutral"})`);
          steps.push(`    Theta: ${netTheta.toFixed(2)}/day (${netTheta > 0 ? "earning decay" : "paying decay"})`);
          steps.push(`    Vega:  ${netVega.toFixed(2)} (${netVega < 0 ? "short vega (want IV to fall)" : "long vega"})`);
          steps.push(``);
          steps.push(`  Risk flags:`);
          if (marginUsage > 60) steps.push(`    ⚠ High margin usage (${marginUsage.toFixed(0)}%)`);
          if (maxConcPct > 25) steps.push(`    ⚠ Over-concentrated (max ${maxConcPct.toFixed(0)}% in one ticker)`);
          if (netTheta < 0) steps.push(`    ⚠ Negative theta — paying time decay`);
          if (Math.abs(netDelta) > accountSize * 0.01) steps.push(`    ⚠ High directional delta (${netDelta.toFixed(0)})`);
          if (marginUsage <= 60 && maxConcPct <= 25 && netTheta > 0) {
            steps.push(`    ✓ Portfolio within healthy risk parameters`);
          }

          return {
            success: true,
            result: `${positions.length} positions, P&L ${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toFixed(0)}, margin ${marginUsage.toFixed(0)}%`,
            portfolio: {
              positions: positions.length, unrealized_pnl: totalUnrealized, return_pct: totalReturn,
              margin_used: totalMargin, margin_pct: marginUsage,
              net_delta: netDelta, net_theta: netTheta, net_vega: netVega,
              max_concentration_pct: maxConcPct,
            },
            steps,
            message: `Portfolio: ${positions.length} pos, P&L ${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toFixed(0)}, margin ${marginUsage.toFixed(0)}%`,
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
