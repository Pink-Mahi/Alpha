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
