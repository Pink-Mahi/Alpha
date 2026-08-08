/**
 * Finance & Economics tools — financial calculations, investment analysis,
 * loan amortization, and economic indicators.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// FINANCE CALCULATE — compound interest, loans, NPV, IRR, annuities, bonds
// =============================================================================

export const financeCalculate: ToolDef = {
  name: "finance.calculate",
  description: "Solve financial calculations: compound interest, simple interest, loan payments (amortization), future/present value, NPV (net present value), IRR (internal rate of return), ROI (return on investment), annuities, bond pricing, mortgage payments, and inflation adjustment. Use 'list' to see all calculation types.",
  inputSchema: z.object({
    calculation: z.enum(["compound_interest", "simple_interest", "loan_payment", "future_value", "present_value", "annuity_future", "annuity_present", "npv", "irr", "roi", "bond_price", "mortgage", "inflation_adjust", "amortization_schedule", "list"]).describe("Type of financial calculation"),
    principal: z.number().optional().describe("Principal amount (initial investment or loan amount)"),
    rate: z.number().optional().describe("Interest rate as decimal (e.g. 0.05 for 5%) or percentage"),
    rate_is_percent: z.boolean().default(false).describe("If true, rate is in percent (5 = 5%); if false, rate is decimal (0.05 = 5%)"),
    time: z.number().optional().describe("Time period in years"),
    compounds_per_year: z.number().default(12).describe("Compounding frequency per year (1=annual, 2=semi-annual, 12=monthly, 365=daily)"),
    payment: z.number().optional().describe("Regular payment amount (for annuities/loans)"),
    future_value: z.number().optional().describe("Future value (for present value calculations)"),
    cash_flows: z.array(z.number()).optional().describe("Cash flows for NPV/IRR (first value is initial investment, typically negative)"),
    discount_rate: z.number().optional().describe("Discount rate for NPV (decimal)"),
    initial_investment: z.number().optional().describe("Initial investment amount (for ROI)"),
    final_value: z.number().optional().describe("Final value (for ROI)"),
    face_value: z.number().optional().describe("Bond face value (par value)"),
    coupon_rate: z.number().optional().describe("Bond coupon rate (decimal)"),
    yield_to_maturity: z.number().optional().describe("Bond yield to maturity (decimal)"),
    periods_to_maturity: z.number().optional().describe("Periods until bond maturity"),
    inflation_rate: z.number().optional().describe("Inflation rate (decimal)"),
    current_value: z.number().optional().describe("Current value (for inflation adjustment)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    result_value: z.number().optional(),
    schedule: z.array(z.record(z.string())).optional(),
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
      // Normalize rate
      const r = params.rate !== undefined ? (params.rate_is_percent ? params.rate / 100 : params.rate) : undefined;

      if (params.calculation === "list") {
        const list = [
          "compound_interest: A = P*(1 + r/n)^(n*t) — Compound interest with n compounds/year",
          "simple_interest: I = P*r*t — Simple interest",
          "loan_payment: PMT = P*r / (1 - (1+r)^(-n)) — Loan payment (amortization)",
          "future_value: FV = P*(1+r)^t — Future value of lump sum",
          "present_value: PV = FV / (1+r)^t — Present value of future amount",
          "annuity_future: FV = PMT * ((1+r)^t - 1) / r — Future value of annuity",
          "annuity_present: PV = PMT * (1 - (1+r)^(-t)) / r — Present value of annuity",
          "npv: NPV = sum(CF_t / (1+r)^t) — Net present value of cash flows",
          "irr: Rate where NPV = 0 — Internal rate of return",
          "roi: ROI = (Final - Initial) / Initial * 100% — Return on investment",
          "bond_price: Price = sum(C/(1+y)^t) + F/(1+y)^n — Bond pricing",
          "mortgage: Monthly payment for home loan (same as loan_payment)",
          "inflation_adjust: Real value = Nominal / (1 + inflation)^t — Adjust for inflation",
          "amortization_schedule: Generate full payment schedule for a loan",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available financial calculations" };
      }

      switch (params.calculation) {
        case "compound_interest": {
          if (params.principal === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "A = P*(1 + r/n)^(n*t)", steps, message: "Provide principal, rate, and time" };
          }
          const n = params.compounds_per_year;
          const amount = params.principal * Math.pow(1 + r / n, n * params.time);
          const interest = amount - params.principal;
          steps.push(`Compound Interest: A = P*(1 + r/n)^(n*t)`);
          steps.push(`A = ${params.principal} * (1 + ${r}/${n})^(${n}*${params.time}) = ${amount.toFixed(2)}`);
          steps.push(`Interest earned: ${interest.toFixed(2)}`);
          return { success: true, result: `${amount.toFixed(2)}`, result_value: amount, formula: "A = P*(1 + r/n)^(n*t)", steps, message: `Final amount = ${amount.toFixed(2)} (interest = ${interest.toFixed(2)})` };
        }

        case "simple_interest": {
          if (params.principal === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "I = P*r*t", steps, message: "Provide principal, rate, and time" };
          }
          const interest = params.principal * r * params.time;
          const total = params.principal + interest;
          steps.push(`Simple Interest: I = P*r*t`);
          steps.push(`I = ${params.principal} * ${r} * ${params.time} = ${interest.toFixed(2)}`);
          steps.push(`Total amount: ${total.toFixed(2)}`);
          return { success: true, result: `${interest.toFixed(2)}`, result_value: interest, formula: "I = P*r*t", steps, message: `Interest = ${interest.toFixed(2)}, total = ${total.toFixed(2)}` };
        }

        case "loan_payment":
        case "mortgage": {
          if (params.principal === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "PMT = P*r / (1 - (1+r)^(-n))", steps, message: "Provide principal, rate, and time" };
          }
          const n = params.compounds_per_year;
          const periodicRate = r / n;
          const totalPayments = n * params.time;
          if (periodicRate === 0) {
            const pmt = params.principal / totalPayments;
            steps.push(`Zero interest: PMT = P / n = ${params.principal} / ${totalPayments} = ${pmt.toFixed(2)}`);
            return { success: true, result: `${pmt.toFixed(2)}`, result_value: pmt, formula: "PMT = P / n", steps, message: `Payment = ${pmt.toFixed(2)} per period` };
          }
          const pmt = (params.principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -totalPayments));
          const totalPaid = pmt * totalPayments;
          const totalInterest = totalPaid - params.principal;
          steps.push(`Loan Payment: PMT = P*r / (1 - (1+r)^(-n))`);
          steps.push(`Periodic rate: ${periodicRate.toFixed(6)} (${n} periods/year)`);
          steps.push(`Total payments: ${totalPayments}`);
          steps.push(`PMT = ${params.principal} * ${periodicRate.toFixed(6)} / (1 - (1+${periodicRate.toFixed(6)})^(-${totalPayments})) = ${pmt.toFixed(2)}`);
          steps.push(`Total paid: ${totalPaid.toFixed(2)}`);
          steps.push(`Total interest: ${totalInterest.toFixed(2)}`);
          return { success: true, result: `${pmt.toFixed(2)}`, result_value: pmt, formula: "PMT = P*r / (1 - (1+r)^(-n))", steps, message: `Payment = ${pmt.toFixed(2)} per period, total interest = ${totalInterest.toFixed(2)}` };
        }

        case "future_value": {
          if (params.principal === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "FV = P*(1+r)^t", steps, message: "Provide principal, rate, and time" };
          }
          const fv = params.principal * Math.pow(1 + r, params.time);
          steps.push(`Future Value: FV = P*(1+r)^t`);
          steps.push(`FV = ${params.principal} * (1+${r})^${params.time} = ${fv.toFixed(2)}`);
          return { success: true, result: `${fv.toFixed(2)}`, result_value: fv, formula: "FV = P*(1+r)^t", steps, message: `Future value = ${fv.toFixed(2)}` };
        }

        case "present_value": {
          if (params.future_value === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "PV = FV / (1+r)^t", steps, message: "Provide future_value, rate, and time" };
          }
          const pv = params.future_value / Math.pow(1 + r, params.time);
          steps.push(`Present Value: PV = FV / (1+r)^t`);
          steps.push(`PV = ${params.future_value} / (1+${r})^${params.time} = ${pv.toFixed(2)}`);
          return { success: true, result: `${pv.toFixed(2)}`, result_value: pv, formula: "PV = FV / (1+r)^t", steps, message: `Present value = ${pv.toFixed(2)}` };
        }

        case "annuity_future": {
          if (params.payment === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "FV = PMT * ((1+r)^t - 1) / r", steps, message: "Provide payment, rate, and time" };
          }
          const fv = params.payment * (Math.pow(1 + r, params.time) - 1) / r;
          steps.push(`Future Value of Annuity: FV = PMT * ((1+r)^t - 1) / r`);
          steps.push(`FV = ${params.payment} * ((1+${r})^${params.time} - 1) / ${r} = ${fv.toFixed(2)}`);
          return { success: true, result: `${fv.toFixed(2)}`, result_value: fv, formula: "FV = PMT * ((1+r)^t - 1) / r", steps, message: `Annuity future value = ${fv.toFixed(2)}` };
        }

        case "annuity_present": {
          if (params.payment === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "PV = PMT * (1 - (1+r)^(-t)) / r", steps, message: "Provide payment, rate, and time" };
          }
          const pv = params.payment * (1 - Math.pow(1 + r, -params.time)) / r;
          steps.push(`Present Value of Annuity: PV = PMT * (1 - (1+r)^(-t)) / r`);
          steps.push(`PV = ${params.payment} * (1 - (1+${r})^(-${params.time})) / ${r} = ${pv.toFixed(2)}`);
          return { success: true, result: `${pv.toFixed(2)}`, result_value: pv, formula: "PV = PMT * (1 - (1+r)^(-t)) / r", steps, message: `Annuity present value = ${pv.toFixed(2)}` };
        }

        case "npv": {
          if (!params.cash_flows || params.cash_flows.length === 0 || params.discount_rate === undefined) {
            return { success: false, result: "", formula: "NPV = sum(CF_t / (1+r)^t)", steps, message: "Provide cash_flows array and discount_rate" };
          }
          const dr = params.rate_is_percent ? params.discount_rate / 100 : params.discount_rate;
          let npv = 0;
          steps.push(`NPV = sum(CF_t / (1+r)^t)`);
          steps.push(`Discount rate: ${dr} (${(dr * 100).toFixed(2)}%)`);
          for (let t = 0; t < params.cash_flows.length; t++) {
            const cf = params.cash_flows[t]!;
            const pv = cf / Math.pow(1 + dr, t);
            npv += pv;
            steps.push(`  Year ${t}: CF=${cf}, PV=${pv.toFixed(2)}`);
          }
          steps.push(`NPV = ${npv.toFixed(2)}`);
          const decision = npv > 0 ? "ACCEPT (NPV > 0, project adds value)" : "REJECT (NPV < 0, project destroys value)";
          steps.push(`Decision: ${decision}`);
          return { success: true, result: `${npv.toFixed(2)}`, result_value: npv, formula: "NPV = sum(CF_t / (1+r)^t)", steps, message: `NPV = ${npv.toFixed(2)} — ${decision}` };
        }

        case "irr": {
          if (!params.cash_flows || params.cash_flows.length < 2) {
            return { success: false, result: "", formula: "IRR: NPV = 0", steps, message: "Provide cash_flows array (at least 2 values, first typically negative)" };
          }
          // Newton-Raphson method to find IRR
          let irr = 0.1; // initial guess 10%
          const cashFlows = params.cash_flows;
          steps.push(`IRR: Find rate where NPV = 0`);
          steps.push(`Cash flows: [${cashFlows.join(", ")}]`);

          for (let iter = 0; iter < 100; iter++) {
            let npv = 0;
            let dnpv = 0;
            for (let t = 0; t < cashFlows.length; t++) {
              const cf = cashFlows[t]!;
              npv += cf / Math.pow(1 + irr, t);
              if (t > 0) dnpv -= t * cf / Math.pow(1 + irr, t + 1);
            }
            if (Math.abs(npv) < 0.01) break;
            if (dnpv === 0) break;
            irr = irr - npv / dnpv;
          }

          const irrPercent = irr * 100;
          steps.push(`IRR = ${irrPercent.toFixed(4)}%`);
          const decision = irrPercent > 10 ? "ACCEPT (IRR > typical hurdle rate of 10%)" : "REVIEW (compare to hurdle rate)";
          steps.push(`Decision: ${decision}`);
          return { success: true, result: `${irrPercent.toFixed(4)}%`, result_value: irr, formula: "IRR: NPV = 0", steps, message: `IRR = ${irrPercent.toFixed(2)}% — ${decision}` };
        }

        case "roi": {
          if (params.initial_investment === undefined || params.final_value === undefined) {
            return { success: false, result: "", formula: "ROI = (Final - Initial) / Initial * 100%", steps, message: "Provide initial_investment and final_value" };
          }
          const roi = ((params.final_value - params.initial_investment) / params.initial_investment) * 100;
          const gain = params.final_value - params.initial_investment;
          steps.push(`ROI = (Final - Initial) / Initial * 100%`);
          steps.push(`ROI = (${params.final_value} - ${params.initial_investment}) / ${params.initial_investment} * 100% = ${roi.toFixed(2)}%`);
          steps.push(`Absolute gain: ${gain.toFixed(2)}`);
          return { success: true, result: `${roi.toFixed(2)}%`, result_value: roi, formula: "ROI = (Final - Initial) / Initial * 100%", steps, message: `ROI = ${roi.toFixed(2)}% (gain = ${gain.toFixed(2)})` };
        }

        case "bond_price": {
          if (params.face_value === undefined || params.coupon_rate === undefined || params.yield_to_maturity === undefined || params.periods_to_maturity === undefined) {
            return { success: false, result: "", formula: "Price = sum(C/(1+y)^t) + F/(1+y)^n", steps, message: "Provide face_value, coupon_rate, yield_to_maturity, periods_to_maturity" };
          }
          const c = params.face_value * params.coupon_rate;
          const y = params.yield_to_maturity;
          let price = 0;
          steps.push(`Bond Pricing: Price = sum(C/(1+y)^t) + F/(1+y)^n`);
          steps.push(`Coupon payment: C = ${params.face_value} * ${params.coupon_rate} = ${c}`);
          steps.push(`YTM: ${y} (${(y * 100).toFixed(2)}%)`);
          for (let t = 1; t <= params.periods_to_maturity; t++) {
            price += c / Math.pow(1 + y, t);
          }
          price += params.face_value / Math.pow(1 + y, params.periods_to_maturity);
          steps.push(`Price = ${price.toFixed(2)}`);
          const status = price > params.face_value ? "Premium (trading above par)" : price < params.face_value ? "Discount (trading below par)" : "Par (trading at face value)";
          steps.push(`Status: ${status}`);
          return { success: true, result: `${price.toFixed(2)}`, result_value: price, formula: "Price = sum(C/(1+y)^t) + F/(1+y)^n", steps, message: `Bond price = ${price.toFixed(2)} (${status})` };
        }

        case "inflation_adjust": {
          if (params.current_value === undefined || params.inflation_rate === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "Real = Nominal / (1 + inflation)^t", steps, message: "Provide current_value, inflation_rate, and time" };
          }
          const realValue = params.current_value / Math.pow(1 + params.inflation_rate, params.time);
          const purchasingLoss = params.current_value - realValue;
          steps.push(`Inflation Adjustment: Real = Nominal / (1 + inflation)^t`);
          steps.push(`Real = ${params.current_value} / (1 + ${params.inflation_rate})^${params.time} = ${realValue.toFixed(2)}`);
          steps.push(`Purchasing power loss: ${purchasingLoss.toFixed(2)}`);
          return { success: true, result: `${realValue.toFixed(2)}`, result_value: realValue, formula: "Real = Nominal / (1 + inflation)^t", steps, message: `Real value = ${realValue.toFixed(2)} (lost ${purchasingLoss.toFixed(2)} to inflation)` };
        }

        case "amortization_schedule": {
          if (params.principal === undefined || r === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "Amortization schedule", steps, message: "Provide principal, rate, and time" };
          }
          const n = params.compounds_per_year;
          const periodicRate = r / n;
          const totalPayments = n * params.time;
          const pmt = periodicRate === 0
            ? params.principal / totalPayments
            : (params.principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -totalPayments));

          let balance = params.principal;
          const schedule: Array<Record<string, string>> = [];
          steps.push(`Amortization Schedule: ${totalPayments} payments of ${pmt.toFixed(2)}`);

          for (let period = 1; period <= Math.min(totalPayments, 360); period++) {
            const interestPayment = balance * periodicRate;
            const principalPayment = pmt - interestPayment;
            balance -= principalPayment;
            schedule.push({
              Period: String(period),
              Payment: pmt.toFixed(2),
              Principal: principalPayment.toFixed(2),
              Interest: interestPayment.toFixed(2),
              Balance: Math.max(0, balance).toFixed(2),
            });
          }
          steps.push(`(Showing first ${Math.min(totalPayments, 360)} payments)`);
          return { success: true, result: `${pmt.toFixed(2)} per period`, result_value: pmt, schedule, formula: "Amortization", steps, message: `Payment = ${pmt.toFixed(2)}, schedule generated with ${schedule.length} rows` };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown calculation type" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// ECONOMICS INDICATORS — CPI, GDP deflator, real vs nominal, unemployment
// =============================================================================

export const economicsIndicators: ToolDef = {
  name: "economics.indicators",
  description: "Calculate economic indicators: CPI (Consumer Price Index), inflation rate from CPI, GDP deflator, real GDP from nominal GDP, real wage, unemployment rate, labor force participation rate, and purchasing power parity. Use 'list' to see all.",
  inputSchema: z.object({
    indicator: z.enum(["cpi", "inflation_from_cpi", "gdp_deflator", "real_gdp", "real_wage", "unemployment_rate", "labor_force_participation", "purchasing_power_parity", "list"]).describe("Economic indicator to calculate"),
    cpi_current: z.number().optional().describe("CPI in current period"),
    cpi_previous: z.number().optional().describe("CPI in previous/base period"),
    cpi_base: z.number().optional().describe("CPI in base year (for real value calculations)"),
    nominal_gdp: z.number().optional().describe("Nominal GDP"),
    real_gdp: z.number().optional().describe("Real GDP"),
    gdp_deflator: z.number().optional().describe("GDP deflator"),
    nominal_wage: z.number().optional().describe("Nominal wage"),
    unemployed: z.number().optional().describe("Number of unemployed people"),
    employed: z.number().optional().describe("Number of employed people"),
    working_age_population: z.number().optional().describe("Working age population"),
    price_domestic: z.number().optional().describe("Price of goods in domestic country"),
    price_foreign: z.number().optional().describe("Price of same goods in foreign country"),
    exchange_rate: z.number().optional().describe("Exchange rate (domestic per foreign currency)"),
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
      if (params.indicator === "list") {
        const list = [
          "cpi: CPI = (cost of basket in current period / cost in base period) * 100",
          "inflation_from_cpi: Inflation = ((CPI_current - CPI_previous) / CPI_previous) * 100",
          "gdp_deflator: Deflator = (Nominal GDP / Real GDP) * 100",
          "real_gdp: Real GDP = Nominal GDP / (GDP Deflator / 100)",
          "real_wage: Real Wage = Nominal Wage / (CPI / 100)",
          "unemployment_rate: Rate = (Unemployed / Labor Force) * 100",
          "labor_force_participation: Rate = (Labor Force / Working Age Pop) * 100",
          "purchasing_power_parity: PPP = (Price_domestic / Price_foreign)",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available economic indicators" };
      }

      switch (params.indicator) {
        case "cpi": {
          if (params.cpi_current === undefined || params.cpi_base === undefined) {
            return { success: false, result: "", formula: "CPI = (cost_current / cost_base) * 100", steps, message: "Provide cpi_current and cpi_base" };
          }
          const cpi = (params.cpi_current / params.cpi_base) * 100;
          steps.push(`CPI = (cost_current / cost_base) * 100`);
          steps.push(`CPI = (${params.cpi_current} / ${params.cpi_base}) * 100 = ${cpi.toFixed(2)}`);
          return { success: true, result: `${cpi.toFixed(2)}`, result_value: cpi, formula: "CPI = (cost_current / cost_base) * 100", steps, message: `CPI = ${cpi.toFixed(2)}` };
        }

        case "inflation_from_cpi": {
          if (params.cpi_current === undefined || params.cpi_previous === undefined) {
            return { success: false, result: "", formula: "Inflation = ((CPI_current - CPI_previous) / CPI_previous) * 100", steps, message: "Provide cpi_current and cpi_previous" };
          }
          const inflation = ((params.cpi_current - params.cpi_previous) / params.cpi_previous) * 100;
          steps.push(`Inflation Rate = ((CPI_current - CPI_previous) / CPI_previous) * 100`);
          steps.push(`= ((${params.cpi_current} - ${params.cpi_previous}) / ${params.cpi_previous}) * 100 = ${inflation.toFixed(2)}%`);
          return { success: true, result: `${inflation.toFixed(2)}%`, result_value: inflation, formula: "Inflation = ((CPI_current - CPI_previous) / CPI_previous) * 100", steps, message: `Inflation rate = ${inflation.toFixed(2)}%` };
        }

        case "gdp_deflator": {
          if (params.nominal_gdp !== undefined && params.real_gdp !== undefined) {
            const deflator = (params.nominal_gdp / params.real_gdp) * 100;
            steps.push(`GDP Deflator = (Nominal GDP / Real GDP) * 100`);
            steps.push(`= (${params.nominal_gdp} / ${params.real_gdp}) * 100 = ${deflator.toFixed(2)}`);
            return { success: true, result: `${deflator.toFixed(2)}`, result_value: deflator, formula: "GDP Deflator = (Nominal/Real) * 100", steps, message: `GDP Deflator = ${deflator.toFixed(2)}` };
          }
          if (params.gdp_deflator !== undefined && params.nominal_gdp !== undefined) {
            const realGdp = params.nominal_gdp / (params.gdp_deflator / 100);
            steps.push(`Real GDP = Nominal GDP / (Deflator / 100)`);
            steps.push(`= ${params.nominal_gdp} / (${params.gdp_deflator} / 100) = ${realGdp.toFixed(2)}`);
            return { success: true, result: `${realGdp.toFixed(2)}`, result_value: realGdp, formula: "Real GDP = Nominal / (Deflator/100)", steps, message: `Real GDP = ${realGdp.toFixed(2)}` };
          }
          return { success: false, result: "", formula: "GDP Deflator = (Nominal GDP / Real GDP) * 100", steps, message: "Provide nominal_gdp and real_gdp (or gdp_deflator and nominal_gdp)" };
        }

        case "real_gdp": {
          if (params.nominal_gdp === undefined || params.gdp_deflator === undefined) {
            return { success: false, result: "", formula: "Real GDP = Nominal GDP / (Deflator / 100)", steps, message: "Provide nominal_gdp and gdp_deflator" };
          }
          const realGdp = params.nominal_gdp / (params.gdp_deflator / 100);
          steps.push(`Real GDP = Nominal GDP / (GDP Deflator / 100)`);
          steps.push(`= ${params.nominal_gdp} / (${params.gdp_deflator} / 100) = ${realGdp.toFixed(2)}`);
          return { success: true, result: `${realGdp.toFixed(2)}`, result_value: realGdp, formula: "Real GDP = Nominal / (Deflator/100)", steps, message: `Real GDP = ${realGdp.toFixed(2)}` };
        }

        case "real_wage": {
          if (params.nominal_wage === undefined || params.cpi_current === undefined) {
            return { success: false, result: "", formula: "Real Wage = Nominal Wage / (CPI / 100)", steps, message: "Provide nominal_wage and cpi_current" };
          }
          const realWage = params.nominal_wage / (params.cpi_current / 100);
          steps.push(`Real Wage = Nominal Wage / (CPI / 100)`);
          steps.push(`= ${params.nominal_wage} / (${params.cpi_current} / 100) = ${realWage.toFixed(2)}`);
          return { success: true, result: `${realWage.toFixed(2)}`, result_value: realWage, formula: "Real Wage = Nominal / (CPI/100)", steps, message: `Real wage = ${realWage.toFixed(2)}` };
        }

        case "unemployment_rate": {
          if (params.unemployed === undefined || params.employed === undefined) {
            return { success: false, result: "", formula: "Unemployment = (Unemployed / Labor Force) * 100", steps, message: "Provide unemployed and employed" };
          }
          const laborForce = params.unemployed + params.employed;
          const rate = (params.unemployed / laborForce) * 100;
          steps.push(`Unemployment Rate = (Unemployed / Labor Force) * 100`);
          steps.push(`Labor Force = ${params.unemployed} + ${params.employed} = ${laborForce}`);
          steps.push(`Rate = (${params.unemployed} / ${laborForce}) * 100 = ${rate.toFixed(2)}%`);
          return { success: true, result: `${rate.toFixed(2)}%`, result_value: rate, formula: "Unemployment = (Unemployed / Labor Force) * 100", steps, message: `Unemployment rate = ${rate.toFixed(2)}%` };
        }

        case "labor_force_participation": {
          if (params.employed === undefined || params.unemployed === undefined || params.working_age_population === undefined) {
            return { success: false, result: "", formula: "Participation = (Labor Force / Working Age Pop) * 100", steps, message: "Provide employed, unemployed, and working_age_population" };
          }
          const laborForce = params.employed + params.unemployed;
          const rate = (laborForce / params.working_age_population) * 100;
          steps.push(`Labor Force Participation Rate = (Labor Force / Working Age Population) * 100`);
          steps.push(`Labor Force = ${laborForce}`);
          steps.push(`Rate = (${laborForce} / ${params.working_age_population}) * 100 = ${rate.toFixed(2)}%`);
          return { success: true, result: `${rate.toFixed(2)}%`, result_value: rate, formula: "Participation = (Labor Force / Working Age Pop) * 100", steps, message: `Participation rate = ${rate.toFixed(2)}%` };
        }

        case "purchasing_power_parity": {
          if (params.price_domestic === undefined || params.price_foreign === undefined) {
            return { success: false, result: "", formula: "PPP = Price_domestic / Price_foreign", steps, message: "Provide price_domestic and price_foreign" };
          }
          const ppp = params.price_domestic / params.price_foreign;
          steps.push(`Purchasing Power Parity: PPP = Price_domestic / Price_foreign`);
          steps.push(`PPP = ${params.price_domestic} / ${params.price_foreign} = ${ppp.toFixed(4)}`);
          if (params.exchange_rate !== undefined) {
            const overvalued = ppp < params.exchange_rate;
            steps.push(`Exchange rate: ${params.exchange_rate}`);
            steps.push(`Currency is ${overvalued ? "OVERVALUED" : "UNDERVALUED"} relative to PPP`);
          }
          return { success: true, result: `${ppp.toFixed(4)}`, result_value: ppp, formula: "PPP = Price_domestic / Price_foreign", steps, message: `PPP exchange rate = ${ppp.toFixed(4)}` };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown indicator" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};
