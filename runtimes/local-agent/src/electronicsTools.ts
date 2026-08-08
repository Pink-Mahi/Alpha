/**
 * Electronics & Magnetism tools — circuit analysis, electromagnetic theory,
 * semiconductor physics, and digital logic design.
 *
 * These tools give the agent the ability to solve problems in electrical
 * engineering, electronics, and electromagnetism.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// ELECTRONICS CONSTANTS
// =============================================================================

const ELECTRONICS_CONSTANTS: Record<string, { value: number; unit: string; description: string }> = {
  "electron_charge": { value: 1.602e-19, unit: "C", description: "Elementary charge (e)" },
  "electron_mass": { value: 9.109e-31, unit: "kg", description: "Electron rest mass (me)" },
  "permittivity_vacuum": { value: 8.854e-12, unit: "F/m", description: "Vacuum permittivity (epsilon_0)" },
  "permeability_vacuum": { value: 1.257e-6, unit: "H/m", description: "Vacuum permeability (mu_0)" },
  "speed_of_light": { value: 299792458, unit: "m/s", description: "Speed of light in vacuum (c)" },
  "boltzmann_constant": { value: 1.381e-23, unit: "J/K", description: "Boltzmann constant (k)" },
  "planck_constant": { value: 6.626e-34, unit: "J*s", description: "Planck constant (h)" },
  "coulomb_constant": { value: 8.99e9, unit: "N*m^2/C^2", description: "Coulomb constant (k_e)" },
  "resistance_copper": { value: 1.68e-8, unit: "ohm*m", description: "Resistivity of copper at 20C" },
  "resistance_aluminum": { value: 2.82e-8, unit: "ohm*m", description: "Resistivity of aluminum at 20C" },
  "resistance_gold": { value: 2.44e-8, unit: "ohm*m", description: "Resistivity of gold at 20C" },
  "resistance_silicon": { value: 640, unit: "ohm*m", description: "Resistivity of silicon (intrinsic)" },
  "thermal_voltage": { value: 0.0259, unit: "V", description: "Thermal voltage at room temp (kT/q)" },
};

// =============================================================================
// 1. CIRCUIT ANALYSIS — Ohm's law, power, series/parallel circuits
// =============================================================================

export const circuitAnalyze: ToolDef = {
  name: "circuit.analyze",
  description: "Analyze electrical circuits using fundamental laws. Supports: Ohm's law (V=IR), power (P=VI), series resistance, parallel resistance, voltage divider, current divider, Kirchhoff's laws, and RC/RL transient analysis. Provide known values and the tool solves for the missing one.",
  inputSchema: z.object({
    analysis_type: z.enum(["ohms_law", "power", "series_resistance", "parallel_resistance", "voltage_divider", "current_divider", "rc_time_constant", "rl_time_constant", "rc_charging", "rc_discharging", "impedance"]).describe("Type of circuit analysis to perform"),
    voltage: z.number().optional().describe("Voltage in volts (V)"),
    current: z.number().optional().describe("Current in amperes (A)"),
    resistance: z.number().optional().describe("Resistance in ohms"),
    power: z.number().optional().describe("Power in watts (W)"),
    resistances: z.array(z.number()).optional().describe("List of resistances for series/parallel calculations"),
    capacitance: z.number().optional().describe("Capacitance in farads (F)"),
    inductance: z.number().optional().describe("Inductance in henries (H)"),
    time: z.number().optional().describe("Time in seconds (for transient analysis)"),
    frequency: z.number().optional().describe("Frequency in Hz (for impedance)"),
    r1: z.number().optional().describe("First resistance for voltage/current divider"),
    r2: z.number().optional().describe("Second resistance for voltage/current divider"),
    vin: z.number().optional().describe("Input voltage for voltage divider"),
    iin: z.number().optional().describe("Input current for current divider"),
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
      switch (params.analysis_type) {
        case "ohms_law": {
          const { voltage, current, resistance } = params;
          steps.push("Ohm's Law: V = I * R");
          if (voltage === undefined && current !== undefined && resistance !== undefined) {
            const v = current * resistance;
            steps.push(`V = ${current} A * ${resistance} ohm = ${v} V`);
            return { success: true, result: `${v} V`, result_value: v, formula: "V = I * R", steps, message: `Voltage = ${v} V` };
          } else if (current === undefined && voltage !== undefined && resistance !== undefined) {
            const i = voltage / resistance;
            steps.push(`I = ${voltage} V / ${resistance} ohm = ${i} A`);
            return { success: true, result: `${i} A`, result_value: i, formula: "I = V / R", steps, message: `Current = ${i} A` };
          } else if (resistance === undefined && voltage !== undefined && current !== undefined) {
            const r = voltage / current;
            steps.push(`R = ${voltage} V / ${current} A = ${r} ohm`);
            return { success: true, result: `${r} ohm`, result_value: r, formula: "R = V / I", steps, message: `Resistance = ${r} ohm` };
          }
          return { success: false, result: "", formula: "V = I * R", steps, message: "Provide exactly two of: voltage, current, resistance" };
        }

        case "power": {
          const { voltage, current, resistance, power } = params;
          steps.push("Electric Power: P = V * I = I^2 * R = V^2 / R");
          if (power === undefined && voltage !== undefined && current !== undefined) {
            const p = voltage * current;
            steps.push(`P = ${voltage} V * ${current} A = ${p} W`);
            return { success: true, result: `${p} W`, result_value: p, formula: "P = V * I", steps, message: `Power = ${p} W` };
          } else if (power === undefined && current !== undefined && resistance !== undefined) {
            const p = current * current * resistance;
            steps.push(`P = ${current}^2 A^2 * ${resistance} ohm = ${p} W`);
            return { success: true, result: `${p} W`, result_value: p, formula: "P = I^2 * R", steps, message: `Power = ${p} W` };
          } else if (power === undefined && voltage !== undefined && resistance !== undefined) {
            const p = (voltage * voltage) / resistance;
            steps.push(`P = ${voltage}^2 V^2 / ${resistance} ohm = ${p} W`);
            return { success: true, result: `${p} W`, result_value: p, formula: "P = V^2 / R", steps, message: `Power = ${p} W` };
          } else if (voltage === undefined && power !== undefined && current !== undefined) {
            const v = power / current;
            steps.push(`V = ${power} W / ${current} A = ${v} V`);
            return { success: true, result: `${v} V`, result_value: v, formula: "V = P / I", steps, message: `Voltage = ${v} V` };
          } else if (current === undefined && power !== undefined && voltage !== undefined) {
            const i = power / voltage;
            steps.push(`I = ${power} W / ${voltage} V = ${i} A`);
            return { success: true, result: `${i} A`, result_value: i, formula: "I = P / V", steps, message: `Current = ${i} A` };
          }
          return { success: false, result: "", formula: "P = V * I", steps, message: "Provide two of: voltage, current, resistance, power" };
        }

        case "series_resistance": {
          if (!params.resistances || params.resistances.length === 0) {
            return { success: false, result: "", formula: "R_total = R1 + R2 + ... + Rn", steps, message: "Provide resistances array" };
          }
          const total = params.resistances.reduce((sum: number, r: number) => sum + r, 0);
          steps.push(`Series: R_total = ${params.resistances.join(" + ")} = ${total} ohm`);
          return { success: true, result: `${total} ohm`, result_value: total, formula: "R_total = R1 + R2 + ... + Rn", steps, message: `Total series resistance = ${total} ohm` };
        }

        case "parallel_resistance": {
          if (!params.resistances || params.resistances.length === 0) {
            return { success: false, result: "", formula: "1/R_total = 1/R1 + 1/R2 + ... + 1/Rn", steps, message: "Provide resistances array" };
          }
          const reciprocalSum = params.resistances.reduce((sum: number, r: number) => sum + 1 / r, 0);
          const total = 1 / reciprocalSum;
          steps.push(`Parallel: 1/R_total = ${params.resistances.map((r: number) => `1/${r}`).join(" + ")} = ${reciprocalSum}`);
          steps.push(`R_total = 1 / ${reciprocalSum} = ${total} ohm`);
          // Special case for 2 resistors
          if (params.resistances.length === 2) {
            const [r1, r2] = params.resistances;
            const productSum = (r1! * r2!) / (r1! + r2!);
            steps.push(`Shortcut: R = (${r1} * ${r2}) / (${r1} + ${r2}) = ${productSum} ohm`);
          }
          return { success: true, result: `${total} ohm`, result_value: total, formula: "1/R_total = 1/R1 + 1/R2 + ... + 1/Rn", steps, message: `Total parallel resistance = ${total} ohm` };
        }

        case "voltage_divider": {
          if (params.vin === undefined || params.r1 === undefined || params.r2 === undefined) {
            return { success: false, result: "", formula: "V_out = V_in * R2 / (R1 + R2)", steps, message: "Provide vin, r1, r2" };
          }
          const vout = (params.vin * params.r2) / (params.r1 + params.r2);
          steps.push(`Voltage Divider: V_out = V_in * R2 / (R1 + R2)`);
          steps.push(`V_out = ${params.vin} V * ${params.r2} / (${params.r1} + ${params.r2}) = ${vout} V`);
          return { success: true, result: `${vout} V`, result_value: vout, formula: "V_out = V_in * R2 / (R1 + R2)", steps, message: `Output voltage = ${vout} V` };
        }

        case "current_divider": {
          if (params.iin === undefined || params.r1 === undefined || params.r2 === undefined) {
            return { success: false, result: "", formula: "I1 = I_in * R2 / (R1 + R2)", steps, message: "Provide iin, r1, r2" };
          }
          const i1 = (params.iin * params.r2) / (params.r1 + params.r2);
          const i2 = (params.iin * params.r1) / (params.r1 + params.r2);
          steps.push(`Current Divider: I1 = I_in * R2 / (R1 + R2)`);
          steps.push(`I1 = ${params.iin} A * ${params.r2} / (${params.r1} + ${params.r2}) = ${i1} A`);
          steps.push(`I2 = ${params.iin} A * ${params.r1} / (${params.r1} + ${params.r2}) = ${i2} A`);
          return { success: true, result: `I1=${i1} A, I2=${i2} A`, result_value: i1, formula: "I1 = I_in * R2 / (R1 + R2)", steps, message: `Current through R1 = ${i1} A, through R2 = ${i2} A` };
        }

        case "rc_time_constant": {
          if (params.resistance === undefined || params.capacitance === undefined) {
            return { success: false, result: "", formula: "tau = R * C", steps, message: "Provide resistance and capacitance" };
          }
          const tau = params.resistance * params.capacitance;
          steps.push(`RC Time Constant: tau = R * C`);
          steps.push(`tau = ${params.resistance} ohm * ${params.capacitance} F = ${tau} s`);
          steps.push(`After 1 tau: 63.2% charged/discharged`);
          steps.push(`After 5 tau: ~99.3% charged/discharged (steady state)`);
          return { success: true, result: `${tau} s`, result_value: tau, formula: "tau = R * C", steps, message: `Time constant = ${tau} s (63.2% in ${tau}s, 99.3% in ${5 * tau}s)` };
        }

        case "rl_time_constant": {
          if (params.resistance === undefined || params.inductance === undefined) {
            return { success: false, result: "", formula: "tau = L / R", steps, message: "Provide resistance and inductance" };
          }
          const tau = params.inductance / params.resistance;
          steps.push(`RL Time Constant: tau = L / R`);
          steps.push(`tau = ${params.inductance} H / ${params.resistance} ohm = ${tau} s`);
          return { success: true, result: `${tau} s`, result_value: tau, formula: "tau = L / R", steps, message: `Time constant = ${tau} s` };
        }

        case "rc_charging": {
          if (params.voltage === undefined || params.resistance === undefined || params.capacitance === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "V(t) = V_max * (1 - e^(-t/RC))", steps, message: "Provide voltage, resistance, capacitance, time" };
          }
          const tau = params.resistance * params.capacitance;
          const vt = params.voltage * (1 - Math.exp(-params.time / tau));
          steps.push(`RC Charging: V(t) = V_max * (1 - e^(-t/RC))`);
          steps.push(`tau = ${params.resistance} * ${params.capacitance} = ${tau} s`);
          steps.push(`V(${params.time}s) = ${params.voltage} * (1 - e^(-${params.time}/${tau})) = ${vt} V`);
          return { success: true, result: `${vt} V`, result_value: vt, formula: "V(t) = V_max * (1 - e^(-t/RC))", steps, message: `Capacitor voltage at t=${params.time}s = ${vt} V` };
        }

        case "rc_discharging": {
          if (params.voltage === undefined || params.resistance === undefined || params.capacitance === undefined || params.time === undefined) {
            return { success: false, result: "", formula: "V(t) = V_0 * e^(-t/RC)", steps, message: "Provide voltage, resistance, capacitance, time" };
          }
          const tau = params.resistance * params.capacitance;
          const vt = params.voltage * Math.exp(-params.time / tau);
          steps.push(`RC Discharging: V(t) = V_0 * e^(-t/RC)`);
          steps.push(`tau = ${params.resistance} * ${params.capacitance} = ${tau} s`);
          steps.push(`V(${params.time}s) = ${params.voltage} * e^(-${params.time}/${tau}) = ${vt} V`);
          return { success: true, result: `${vt} V`, result_value: vt, formula: "V(t) = V_0 * e^(-t/RC)", steps, message: `Capacitor voltage at t=${params.time}s = ${vt} V` };
        }

        case "impedance": {
          if (params.resistance === undefined || params.frequency === undefined) {
            return { success: false, result: "", formula: "Z = sqrt(R^2 + X^2)", steps, message: "Provide resistance and frequency (and capacitance or inductance)" };
          }
          const omega = 2 * Math.PI * params.frequency;
          steps.push(`Angular frequency: omega = 2*pi*f = ${omega} rad/s`);
          if (params.capacitance !== undefined) {
            const xc = 1 / (omega * params.capacitance);
            const z = Math.sqrt(params.resistance ** 2 + xc ** 2);
            const phase = Math.atan(-xc / params.resistance) * (180 / Math.PI);
            steps.push(`Capacitive reactance: Xc = 1/(omega*C) = 1/(${omega}*${params.capacitance}) = ${xc} ohm`);
            steps.push(`Impedance: |Z| = sqrt(R^2 + Xc^2) = sqrt(${params.resistance}^2 + ${xc}^2) = ${z} ohm`);
            steps.push(`Phase angle: phi = atan(-Xc/R) = ${phase} degrees`);
            return { success: true, result: `|Z|=${z} ohm, phi=${phase} deg`, result_value: z, formula: "Z = sqrt(R^2 + Xc^2), Xc = 1/(2*pi*f*C)", steps, message: `Impedance = ${z} ohm, phase = ${phase} degrees` };
          } else if (params.inductance !== undefined) {
            const xl = omega * params.inductance;
            const z = Math.sqrt(params.resistance ** 2 + xl ** 2);
            const phase = Math.atan(xl / params.resistance) * (180 / Math.PI);
            steps.push(`Inductive reactance: Xl = omega*L = ${omega}*${params.inductance} = ${xl} ohm`);
            steps.push(`Impedance: |Z| = sqrt(R^2 + Xl^2) = sqrt(${params.resistance}^2 + ${xl}^2) = ${z} ohm`);
            steps.push(`Phase angle: phi = atan(Xl/R) = ${phase} degrees`);
            return { success: true, result: `|Z|=${z} ohm, phi=${phase} deg`, result_value: z, formula: "Z = sqrt(R^2 + Xl^2), Xl = 2*pi*f*L", steps, message: `Impedance = ${z} ohm, phase = ${phase} degrees` };
          }
          return { success: false, result: "", formula: "Z = sqrt(R^2 + X^2)", steps, message: "Provide capacitance or inductance" };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown analysis type" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 2. MAGNETISM — magnetic fields, forces, induction, transformers
// =============================================================================

export const magnetismSolve: ToolDef = {
  name: "magnetism.solve",
  description: "Solve electromagnetism and magnetism problems. Supports: magnetic force on moving charge (F=qvB sin theta), magnetic force on current-carrying wire (F=BIL sin theta), magnetic field from straight wire (B = mu_0*I/(2*pi*r)), magnetic field from solenoid (B = mu_0*n*I), Faraday's law of induction (EMF = -N*dPhi/dt), transformer equations (Vp/Vs = Np/Ns), Lenz's law, magnetic flux (Phi = B*A*cos theta), and Ampere's law.",
  inputSchema: z.object({
    formula: z.enum(["force_on_charge", "force_on_wire", "field_straight_wire", "field_solenoid", "field_loop", "faraday_law", "magnetic_flux", "transformer", "lenz_law", "ampere_law", "list"]).describe("Formula to use (or 'list' to see all)"),
    charge: z.number().optional().describe("Charge in coulombs (C)"),
    velocity: z.number().optional().describe("Velocity in m/s"),
    magnetic_field: z.number().optional().describe("Magnetic field in tesla (T)"),
    angle: z.number().optional().describe("Angle in degrees"),
    current: z.number().optional().describe("Current in amperes (A)"),
    length: z.number().optional().describe("Length in meters (m)"),
    distance: z.number().optional().describe("Distance from wire in meters (m)"),
    turns: z.number().optional().describe("Number of turns (N)"),
    turns_per_length: z.number().optional().describe("Turns per unit length (n, for solenoid)"),
    area: z.number().optional().describe("Area in m^2"),
    flux: z.number().optional().describe("Magnetic flux in webers (Wb)"),
    flux_change: z.number().optional().describe("Change in magnetic flux (Wb)"),
    time_change: z.number().optional().describe("Time interval for flux change (s)"),
    primary_voltage: z.number().optional().describe("Primary voltage (V)"),
    secondary_voltage: z.number().optional().describe("Secondary voltage (V)"),
    primary_turns: z.number().optional().describe("Primary turns (Np)"),
    secondary_turns: z.number().optional().describe("Secondary turns (Ns)"),
    primary_current: z.number().optional().describe("Primary current (A)"),
    secondary_current: z.number().optional().describe("Secondary current (A)"),
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
    const mu0 = ELECTRONICS_CONSTANTS.permeability_vacuum!.value;

    try {
      if (params.formula === "list") {
        const list = [
          "force_on_charge: F = q*v*B*sin(theta) — Force on moving charge in magnetic field",
          "force_on_wire: F = B*I*L*sin(theta) — Force on current-carrying wire in field",
          "field_straight_wire: B = mu_0*I/(2*pi*r) — Field from long straight wire",
          "field_solenoid: B = mu_0*n*I — Field inside solenoid",
          "field_loop: B = mu_0*I/(2*R) — Field at center of circular loop",
          "faraday_law: EMF = -N*dPhi/dt — Faraday's law of induction",
          "magnetic_flux: Phi = B*A*cos(theta) — Magnetic flux through area",
          "transformer: Vp/Vs = Np/Ns, Ip/Is = Ns/Np — Transformer equations",
          "lenz_law: Direction of induced current opposes change in flux",
          "ampere_law: B*dl = mu_0*I_enclosed — Ampere's circuital law",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available magnetism formulas" };
      }

      switch (params.formula) {
        case "force_on_charge": {
          const { charge, velocity: vel, magnetic_field: b, angle } = params;
          if (charge === undefined || vel === undefined || b === undefined) {
            return { success: false, result: "", formula: "F = q*v*B*sin(theta)", steps, message: "Provide charge, velocity, magnetic_field (angle optional, default 90)" };
          }
          const theta = (angle ?? 90) * Math.PI / 180;
          const f = charge * vel * b * Math.sin(theta);
          steps.push(`Magnetic Force on Charge: F = q*v*B*sin(theta)`);
          steps.push(`F = ${charge} C * ${vel} m/s * ${b} T * sin(${angle ?? 90} deg) = ${f} N`);
          return { success: true, result: `${f} N`, result_value: f, formula: "F = q*v*B*sin(theta)", steps, message: `Magnetic force = ${f} N` };
        }

        case "force_on_wire": {
          const { magnetic_field: b, current: i, length: len, angle } = params;
          if (b === undefined || i === undefined || len === undefined) {
            return { success: false, result: "", formula: "F = B*I*L*sin(theta)", steps, message: "Provide magnetic_field, current, length (angle optional)" };
          }
          const theta = (angle ?? 90) * Math.PI / 180;
          const f = b * i * len * Math.sin(theta);
          steps.push(`Magnetic Force on Wire: F = B*I*L*sin(theta)`);
          steps.push(`F = ${b} T * ${i} A * ${len} m * sin(${angle ?? 90} deg) = ${f} N`);
          return { success: true, result: `${f} N`, result_value: f, formula: "F = B*I*L*sin(theta)", steps, message: `Force on wire = ${f} N` };
        }

        case "field_straight_wire": {
          const { current: i, distance: r } = params;
          if (i === undefined || r === undefined) {
            return { success: false, result: "", formula: "B = mu_0*I/(2*pi*r)", steps, message: "Provide current and distance" };
          }
          const b = (mu0 * i) / (2 * Math.PI * r);
          steps.push(`Magnetic Field from Straight Wire: B = mu_0*I/(2*pi*r)`);
          steps.push(`mu_0 = ${mu0} H/m`);
          steps.push(`B = ${mu0} * ${i} / (2*pi*${r}) = ${b} T`);
          return { success: true, result: `${b} T`, result_value: b, formula: "B = mu_0*I/(2*pi*r)", steps, message: `Magnetic field = ${b} T` };
        }

        case "field_solenoid": {
          const { turns_per_length: n, current: i } = params;
          if (n === undefined || i === undefined) {
            return { success: false, result: "", formula: "B = mu_0*n*I", steps, message: "Provide turns_per_length and current" };
          }
          const b = mu0 * n * i;
          steps.push(`Magnetic Field in Solenoid: B = mu_0*n*I`);
          steps.push(`B = ${mu0} * ${n} * ${i} = ${b} T`);
          return { success: true, result: `${b} T`, result_value: b, formula: "B = mu_0*n*I", steps, message: `Solenoid field = ${b} T` };
        }

        case "field_loop": {
          const { current: i, distance: r } = params;
          if (i === undefined || r === undefined) {
            return { success: false, result: "", formula: "B = mu_0*I/(2*R)", steps, message: "Provide current and radius (distance)" };
          }
          const b = (mu0 * i) / (2 * r);
          steps.push(`Magnetic Field at Center of Loop: B = mu_0*I/(2*R)`);
          steps.push(`B = ${mu0} * ${i} / (2 * ${r}) = ${b} T`);
          return { success: true, result: `${b} T`, result_value: b, formula: "B = mu_0*I/(2*R)", steps, message: `Loop field = ${b} T` };
        }

        case "faraday_law": {
          const { turns: n, flux_change: dPhi, time_change: dt } = params;
          if (n === undefined || dPhi === undefined || dt === undefined) {
            return { success: false, result: "", formula: "EMF = -N*dPhi/dt", steps, message: "Provide turns, flux_change, time_change" };
          }
          const emf = -n * (dPhi / dt);
          steps.push(`Faraday's Law: EMF = -N*dPhi/dt`);
          steps.push(`EMF = -${n} * (${dPhi} / ${dt}) = ${emf} V`);
          steps.push(`Negative sign indicates induced EMF opposes change (Lenz's law)`);
          return { success: true, result: `${emf} V`, result_value: Math.abs(emf), formula: "EMF = -N*dPhi/dt", steps, message: `Induced EMF = ${Math.abs(emf)} V (magnitude)` };
        }

        case "magnetic_flux": {
          const { magnetic_field: b, area: a, angle } = params;
          if (b === undefined || a === undefined) {
            return { success: false, result: "", formula: "Phi = B*A*cos(theta)", steps, message: "Provide magnetic_field and area (angle optional)" };
          }
          const theta = (angle ?? 0) * Math.PI / 180;
          const phi = b * a * Math.cos(theta);
          steps.push(`Magnetic Flux: Phi = B*A*cos(theta)`);
          steps.push(`Phi = ${b} T * ${a} m^2 * cos(${angle ?? 0} deg) = ${phi} Wb`);
          return { success: true, result: `${phi} Wb`, result_value: phi, formula: "Phi = B*A*cos(theta)", steps, message: `Magnetic flux = ${phi} Wb` };
        }

        case "transformer": {
          const { primary_voltage: vp, secondary_voltage: vs, primary_turns: np, secondary_turns: ns, primary_current: ip, secondary_current: is } = params;
          steps.push(`Transformer Equations: Vp/Vs = Np/Ns, Ip/Is = Ns/Np (ideal transformer)`);

          // Solve for missing voltage
          if (vp === undefined && vs !== undefined && np !== undefined && ns !== undefined) {
            const result = vs * (np / ns);
            steps.push(`Vp = Vs * (Np/Ns) = ${vs} * (${np}/${ns}) = ${result} V`);
            return { success: true, result: `${result} V`, result_value: result, formula: "Vp = Vs * Np/Ns", steps, message: `Primary voltage = ${result} V` };
          }
          if (vs === undefined && vp !== undefined && np !== undefined && ns !== undefined) {
            const result = vp * (ns / np);
            steps.push(`Vs = Vp * (Ns/Np) = ${vp} * (${ns}/${np}) = ${result} V`);
            return { success: true, result: `${result} V`, result_value: result, formula: "Vs = Vp * Ns/Np", steps, message: `Secondary voltage = ${result} V` };
          }
          // Solve for missing turns
          if (np === undefined && vp !== undefined && vs !== undefined && ns !== undefined) {
            const result = ns * (vp / vs);
            steps.push(`Np = Ns * (Vp/Vs) = ${ns} * (${vp}/${vs}) = ${result}`);
            return { success: true, result: `${result}`, result_value: result, formula: "Np = Ns * Vp/Vs", steps, message: `Primary turns = ${result}` };
          }
          if (ns === undefined && vp !== undefined && vs !== undefined && np !== undefined) {
            const result = np * (vs / vp);
            steps.push(`Ns = Np * (Vs/Vp) = ${np} * (${vs}/${vp}) = ${result}`);
            return { success: true, result: `${result}`, result_value: result, formula: "Ns = Np * Vs/Vp", steps, message: `Secondary turns = ${result}` };
          }
          // Solve for current
          if (ip === undefined && is !== undefined && np !== undefined && ns !== undefined) {
            const result = is * (ns / np);
            steps.push(`Ip = Is * (Ns/Np) = ${is} * (${ns}/${np}) = ${result} A`);
            return { success: true, result: `${result} A`, result_value: result, formula: "Ip = Is * Ns/Np", steps, message: `Primary current = ${result} A` };
          }
          if (is === undefined && ip !== undefined && np !== undefined && ns !== undefined) {
            const result = ip * (np / ns);
            steps.push(`Is = Ip * (Np/Ns) = ${ip} * (${np}/${ns}) = ${result} A`);
            return { success: true, result: `${result} A`, result_value: result, formula: "Is = Ip * Np/Ns", steps, message: `Secondary current = ${result} A` };
          }
          return { success: false, result: "", formula: "Vp/Vs = Np/Ns", steps, message: "Provide enough values to solve for one unknown" };
        }

        case "lenz_law": {
          steps.push(`Lenz's Law: The direction of induced current is such that it opposes the change in magnetic flux that produced it.`);
          steps.push(``);
          steps.push(`Rules:`);
          steps.push(`1. If flux through loop is INCREASING: induced current creates field OPPOSING the increase`);
          steps.push(`2. If flux through loop is DECREASING: induced current creates field SUPPORTING the decrease`);
          steps.push(`3. Use right-hand rule: curl fingers in direction of induced current, thumb points in direction of induced B-field`);
          steps.push(``);
          steps.push(`Applications:`);
          steps.push(`- Generator: mechanical energy -> electrical energy (induced current opposes motion)`);
          steps.push(`- Motor: electrical energy -> mechanical energy (back-EMF opposes applied voltage)`);
          steps.push(`- Eddy currents: induced currents in conductors that oppose motion (magnetic braking)`);
          return { success: true, result: "Lenz's law explanation provided", formula: "EMF = -N*dPhi/dt (negative sign = Lenz's law)", steps, message: "Lenz's law determines direction of induced current" };
        }

        case "ampere_law": {
          steps.push(`Ampere's Law: B * (2*pi*r) = mu_0 * I_enclosed`);
          steps.push(`For a long straight wire: B = mu_0 * I / (2*pi*r)`);
          steps.push(`For a solenoid: B = mu_0 * n * I`);
          steps.push(`For a toroid: B = mu_0 * N * I / (2*pi*r)`);
          steps.push(``);
          steps.push(`Use this to calculate magnetic fields from symmetric current distributions.`);
          return { success: true, result: "Ampere's law explanation provided", formula: "B*dl = mu_0*I_enclosed", steps, message: "Ampere's law relates magnetic field to enclosed current" };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown formula" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 3. SEMICONDUCTOR — diode, transistor, and semiconductor physics
// =============================================================================

export const semiconductorSolve: ToolDef = {
  name: "semiconductor.solve",
  description: "Solve semiconductor and electronics problems. Supports: diode equation (Shockley), Zener diode voltage regulation, transistor biasing (BJT), MOSFET operation, LED resistor calculation, half-wave/full-wave rectifier analysis, and semiconductor physics (intrinsic carrier concentration, doping). Use 'list' to see all formulas.",
  inputSchema: z.object({
    formula: z.enum(["diode_current", "diode_voltage", "zener_regulator", "led_resistor", "transistor_beta", "transistor_bias", "mosfet_threshold", "rectifier", "intrinsic_concentration", "list"]).describe("Formula to use (or 'list')"),
    voltage: z.number().optional().describe("Voltage in volts (V)"),
    current: z.number().optional().describe("Current in amperes (A)"),
    saturation_current: z.number().optional().describe("Reverse saturation current Is (A)"),
    ideality_factor: z.number().default(1).describe("Diode ideality factor n (1 for ideal, 1-2 typical)"),
    supply_voltage: z.number().optional().describe("Supply voltage (V)"),
    zener_voltage: z.number().optional().describe("Zener breakdown voltage (V)"),
    load_current: z.number().optional().describe("Load current (A)"),
    series_resistance: z.number().optional().describe("Series resistance (ohm)"),
    led_forward_voltage: z.number().optional().describe("LED forward voltage drop (V)"),
    led_current: z.number().optional().describe("Desired LED current (A)"),
    base_current: z.number().optional().describe("Base current (A)"),
    collector_current: z.number().optional().describe("Collector current (A)"),
    beta: z.number().optional().describe("Transistor current gain (hFE)"),
    threshold_voltage: z.number().optional().describe("MOSFET threshold voltage (V)"),
    gate_voltage: z.number().optional().describe("Gate-source voltage (V)"),
    temperature: z.number().default(300).describe("Temperature in Kelvin (default 300K = room temp)"),
    doping_concentration: z.number().optional().describe("Doping concentration (cm^-3)"),
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
    const k = ELECTRONICS_CONSTANTS.boltzmann_constant!.value;
    const q = ELECTRONICS_CONSTANTS.electron_charge!.value;
    const Vt = k * params.temperature / q;

    try {
      if (params.formula === "list") {
        const list = [
          "diode_current: I = Is*(e^(V/(n*Vt)) - 1) — Shockley diode equation",
          "diode_voltage: V = n*Vt*ln(I/Is + 1) — Diode voltage from current",
          "zener_regulator: Rs = (Vin - Vz)/Iz — Zener voltage regulator series resistor",
          "led_resistor: R = (Vsupply - Vled)/Iled — LED current limiting resistor",
          "transistor_beta: Ic = beta * Ib — BJT collector current from base current",
          "transistor_bias: DC bias point analysis (Vce, Ic) for common emitter",
          "mosfet_threshold: Vgs > Vth for enhancement MOSFET to conduct",
          "rectifier: Half-wave and full-wave rectifier output analysis",
          "intrinsic_concentration: ni = sqrt(Nc*Nv)*exp(-Eg/(2*kT)) — Intrinsic carrier concentration",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available semiconductor formulas" };
      }

      switch (params.formula) {
        case "diode_current": {
          const { voltage: v, saturation_current: is, ideality_factor: n } = params;
          if (v === undefined || is === undefined) {
            return { success: false, result: "", formula: "I = Is*(e^(V/(n*Vt)) - 1)", steps, message: "Provide voltage and saturation_current" };
          }
          const i = is * (Math.exp(v / (n * Vt)) - 1);
          steps.push(`Shockley Diode Equation: I = Is*(e^(V/(n*Vt)) - 1)`);
          steps.push(`Thermal voltage Vt = kT/q = ${Vt.toFixed(4)} V at ${params.temperature}K`);
          steps.push(`I = ${is} * (e^(${v}/(${n}*${Vt.toFixed(4)})) - 1) = ${i} A`);
          return { success: true, result: `${i} A`, result_value: i, formula: "I = Is*(e^(V/(n*Vt)) - 1)", steps, message: `Diode current = ${i} A` };
        }

        case "diode_voltage": {
          const { current: i, saturation_current: is, ideality_factor: n } = params;
          if (i === undefined || is === undefined) {
            return { success: false, result: "", formula: "V = n*Vt*ln(I/Is + 1)", steps, message: "Provide current and saturation_current" };
          }
          const v = n * Vt * Math.log(i / is + 1);
          steps.push(`Diode Voltage: V = n*Vt*ln(I/Is + 1)`);
          steps.push(`Vt = ${Vt.toFixed(4)} V at ${params.temperature}K`);
          steps.push(`V = ${n} * ${Vt.toFixed(4)} * ln(${i}/${is} + 1) = ${v} V`);
          return { success: true, result: `${v} V`, result_value: v, formula: "V = n*Vt*ln(I/Is + 1)", steps, message: `Diode voltage = ${v} V` };
        }

        case "zener_regulator": {
          const { supply_voltage: vin, zener_voltage: vz, load_current: il, series_resistance: rs } = params;
          if (vin === undefined || vz === undefined) {
            return { success: false, result: "", formula: "Rs = (Vin - Vz) / (Iz + IL)", steps, message: "Provide supply_voltage and zener_voltage" };
          }
          if (rs === undefined) {
            const iz = 0.005;
            const ilVal = il ?? 0;
            const calculatedRs = (vin - vz) / (iz + ilVal);
            steps.push(`Zener Regulator: Rs = (Vin - Vz) / (Iz + IL)`);
            steps.push(`Assuming minimum zener current Iz = 5 mA`);
            steps.push(`Rs = (${vin} - ${vz}) / (${iz} + ${ilVal}) = ${calculatedRs} ohm`);
            steps.push(`Power dissipated in Rs: P = (Vin - Vz)^2 / Rs = ${((vin - vz) ** 2 / calculatedRs).toFixed(4)} W`);
            steps.push(`Zener power: Pz = Vz * Iz = ${(vz * iz).toFixed(4)} W`);
            return { success: true, result: `${calculatedRs} ohm`, result_value: calculatedRs, formula: "Rs = (Vin - Vz) / (Iz + IL)", steps, message: `Series resistance = ${calculatedRs} ohm (use next higher standard value)` };
          } else {
            const totalCurrent = (vin - vz) / rs;
            const iz = totalCurrent - (il ?? 0);
            steps.push(`Zener current: Iz = (Vin - Vz)/Rs - IL`);
            steps.push(`Iz = (${vin} - ${vz})/${rs} - ${il ?? 0} = ${iz} A`);
            return { success: true, result: `${iz} A`, result_value: iz, formula: "Iz = (Vin-Vz)/Rs - IL", steps, message: `Zener current = ${iz} A` };
          }
        }

        case "led_resistor": {
          const { supply_voltage: vs, led_forward_voltage: vf, led_current: il } = params;
          if (vs === undefined || vf === undefined || il === undefined) {
            return { success: false, result: "", formula: "R = (Vsupply - Vled) / Iled", steps, message: "Provide supply_voltage, led_forward_voltage, led_current" };
          }
          const r = (vs - vf) / il;
          const power = il * il * r;
          steps.push(`LED Current Limiting Resistor: R = (Vsupply - Vled) / Iled`);
          steps.push(`R = (${vs} - ${vf}) / ${il} = ${r} ohm`);
          steps.push(`Power dissipated: P = I^2 * R = ${il}^2 * ${r} = ${power} W`);
          steps.push(`Use a resistor with at least ${Math.ceil(power * 2 * 100) / 100} W rating (2x safety margin)`);
          return { success: true, result: `${r} ohm`, result_value: r, formula: "R = (Vsupply - Vled) / Iled", steps, message: `LED resistor = ${r} ohm, use ${Math.ceil(r)} ohm standard value` };
        }

        case "transistor_beta": {
          const { base_current: ib, collector_current: ic, beta } = params;
          steps.push(`BJT Current Gain: Ic = beta * Ib`);
          if (ic === undefined && ib !== undefined && beta !== undefined) {
            const result = beta * ib;
            steps.push(`Ic = ${beta} * ${ib} = ${result} A`);
            const ie = ib + result;
            steps.push(`Emitter current: Ie = Ib + Ic = ${ib} + ${result} = ${ie} A`);
            return { success: true, result: `Ic=${result} A, Ie=${ie} A`, result_value: result, formula: "Ic = beta * Ib", steps, message: `Collector current = ${result} A` };
          }
          if (beta === undefined && ic !== undefined && ib !== undefined) {
            const result = ic / ib;
            steps.push(`beta = Ic / Ib = ${ic} / ${ib} = ${result}`);
            return { success: true, result: `${result}`, result_value: result, formula: "beta = Ic / Ib", steps, message: `Current gain = ${result}` };
          }
          if (ib === undefined && ic !== undefined && beta !== undefined) {
            const result = ic / beta;
            steps.push(`Ib = Ic / beta = ${ic} / ${beta} = ${result} A`);
            return { success: true, result: `${result} A`, result_value: result, formula: "Ib = Ic / beta", steps, message: `Base current = ${result} A` };
          }
          return { success: false, result: "", formula: "Ic = beta * Ib", steps, message: "Provide two of: base_current, collector_current, beta" };
        }

        case "transistor_bias": {
          steps.push(`BJT Common-Emitter DC Bias Analysis:`);
          steps.push(``);
          steps.push(`Fixed Bias Circuit:`);
          steps.push(`  Ib = (Vcc - Vbe) / Rb  (Vbe ~ 0.7V for silicon)`);
          steps.push(`  Ic = beta * Ib`);
          steps.push(`  Vce = Vcc - Ic * Rc`);
          steps.push(``);
          steps.push(`Voltage Divider Bias (most stable):`);
          steps.push(`  Vb = Vcc * R2 / (R1 + R2)  (base voltage)`);
          steps.push(`  Ve = Vb - Vbe  (emitter voltage)`);
          steps.push(`  Ie = Ve / Re  (emitter current ~ Ic)`);
          steps.push(`  Vc = Vcc - Ic * Rc  (collector voltage)`);
          steps.push(`  Vce = Vc - Ve  (collector-emitter voltage)`);
          steps.push(``);
          steps.push(`Active region: Vce > 0.2V (not saturated)`);
          steps.push(`Saturation: Vce ~ 0.2V, Ic < beta * Ib`);
          steps.push(`Cutoff: Ib = 0, Ic = 0`);
          return { success: true, result: "BJT bias analysis guide", formula: "Various bias equations", steps, message: "Transistor biasing formulas provided" };
        }

        case "mosfet_threshold": {
          const { gate_voltage: vgs, threshold_voltage: vth } = params;
          if (vgs === undefined || vth === undefined) {
            return { success: false, result: "", formula: "Vgs > Vth (enhancement), Vgs < Vth (depletion)", steps, message: "Provide gate_voltage and threshold_voltage" };
          }
          steps.push(`MOSFET Operation Check:`);
          if (vgs > vth) {
            const overdrive = vgs - vth;
            steps.push(`Vgs (${vgs}V) > Vth (${vth}V): MOSFET is ON (enhancement mode)`);
            steps.push(`Overdrive voltage: Vov = Vgs - Vth = ${overdrive} V`);
            steps.push(`Saturation region (active): Vds > Vov, Id = 0.5 * k * Vov^2`);
            steps.push(`Linear/triode region: Vds < Vov, Id = k * (Vov*Vds - 0.5*Vds^2)`);
            return { success: true, result: `ON (Vov = ${overdrive} V)`, result_value: overdrive, formula: "Vgs > Vth", steps, message: `MOSFET is ON, overdrive = ${overdrive} V` };
          } else {
            steps.push(`Vgs (${vgs}V) < Vth (${vth}V): MOSFET is OFF (cutoff)`);
            steps.push(`No drain current flows (Id = 0)`);
            return { success: true, result: "OFF (cutoff)", result_value: 0, formula: "Vgs < Vth", steps, message: "MOSFET is OFF" };
          }
        }

        case "rectifier": {
          steps.push(`Rectifier Circuit Analysis:`);
          steps.push(``);
          steps.push(`Half-Wave Rectifier:`);
          steps.push(`  Vdc = Vpeak / pi = 0.318 * Vpeak`);
          steps.push(`  Vrms = Vpeak / 2`);
          steps.push(`  Ripple frequency = input frequency (50/60 Hz)`);
          steps.push(`  Efficiency = 40.6%`);
          steps.push(``);
          steps.push(`Full-Wave Bridge Rectifier:`);
          steps.push(`  Vdc = 2*Vpeak / pi = 0.637 * Vpeak`);
          steps.push(`  Vrms = Vpeak / sqrt(2)`);
          steps.push(`  Ripple frequency = 2 * input frequency (100/120 Hz)`);
          steps.push(`  Efficiency = 81.2%`);
          steps.push(``);
          steps.push(`With capacitor filter:`);
          steps.push(`  Vdc ~ Vpeak (with large capacitor)`);
          steps.push(`  Ripple voltage: Vr = I / (f * C)`);
          steps.push(`  For full-wave: Vr = I / (2*f * C)`);
          steps.push(``);
          steps.push(`PIV (Peak Inverse Voltage):`);
          steps.push(`  Half-wave: Vpeak`);
          steps.push(`  Full-wave bridge: Vpeak`);
          steps.push(`  Center-tap full-wave: 2*Vpeak`);
          return { success: true, result: "Rectifier analysis guide", formula: "Various rectifier equations", steps, message: "Rectifier formulas provided" };
        }

        case "intrinsic_concentration": {
          steps.push(`Intrinsic Carrier Concentration:`);
          steps.push(`ni = sqrt(Nc * Nv) * exp(-Eg / (2*kT))`);
          steps.push(``);
          steps.push(`Where:`);
          steps.push(`  Nc = effective density of states in conduction band`);
          steps.push(`  Nv = effective density of states in valence band`);
          steps.push(`  Eg = bandgap energy (1.12 eV for Si, 0.67 eV for Ge, 1.42 eV for GaAs)`);
          steps.push(`  kT = thermal energy = ${Vt.toFixed(4)} eV at ${params.temperature}K`);
          steps.push(``);
          steps.push(`At 300K (room temperature):`);
          steps.push(`  Silicon: ni ~ 1.5 x 10^10 cm^-3`);
          steps.push(`  Germanium: ni ~ 2.4 x 10^13 cm^-3`);
          steps.push(`  GaAs: ni ~ 1.8 x 10^6 cm^-3`);
          steps.push(``);
          steps.push(`After doping with concentration N:`);
          steps.push(`  n-type: n ~ N, p = ni^2 / N`);
          steps.push(`  p-type: p ~ N, n = ni^2 / N`);
          return { success: true, result: "Semiconductor physics guide", formula: "ni = sqrt(Nc*Nv)*exp(-Eg/(2*kT))", steps, message: "Intrinsic concentration formulas provided" };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown formula" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 4. DIGITAL LOGIC — Boolean algebra, logic gates, truth tables
// =============================================================================

export const digitalLogic: ToolDef = {
  name: "digital.logic",
  description: "Solve digital logic and Boolean algebra problems. Supports: truth tables for all gates (AND, OR, NOT, NAND, NOR, XOR, XNOR), Boolean expression evaluation, Karnaugh map simplification guide, half/full adder, flip-flop analysis, and number system conversions (binary, decimal, hex, octal).",
  inputSchema: z.object({
    operation: z.enum(["truth_table", "evaluate", "simplify", "add_subtract", "number_convert", "flip_flop", "list"]).describe("Operation to perform"),
    gate: z.enum(["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR", "BUFFER"]).optional().describe("Logic gate for truth table"),
    expression: z.string().optional().describe("Boolean expression (e.g. 'A AND B OR NOT C'). Use AND, OR, NOT, XOR, NAND, NOR operators."),
    inputs: z.record(z.boolean()).optional().describe("Input values for evaluation (e.g. {A: true, B: false, C: true})"),
    value: z.number().optional().describe("Value to convert (for number_convert)"),
    from_base: z.enum(["binary", "decimal", "hex", "octal"]).optional().describe("Source base for conversion"),
    to_base: z.enum(["binary", "decimal", "hex", "octal"]).optional().describe("Target base for conversion"),
    adder_type: z.enum(["half", "full"]).optional().describe("Adder type for add_subtract operation"),
    flip_flop_type: z.enum(["SR", "JK", "D", "T"]).optional().describe("Flip-flop type"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    truth_table: z.array(z.record(z.string())).optional(),
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
        return {
          success: true,
          result: "Operations: truth_table, evaluate, simplify, add_subtract, number_convert, flip_flop",
          steps,
          message: "Available digital logic operations",
        };
      }

      switch (params.operation) {
        case "truth_table": {
          if (!params.gate) {
            return { success: false, result: "", steps, message: "Provide gate type" };
          }
          const gate = params.gate;
          const truthTable: Array<Record<string, string>> = [];

          if (gate === "NOT") {
            steps.push(`NOT gate (inverter): output = NOT input`);
            for (const a of [true, false]) {
              truthTable.push({ A: a ? "1" : "0", "NOT A": (!a) ? "1" : "0" });
            }
          } else if (gate === "BUFFER") {
            steps.push(`BUFFER gate: output = input`);
            for (const a of [true, false]) {
              truthTable.push({ A: a ? "1" : "0", "OUT": a ? "1" : "0" });
            }
          } else {
            const gateFn: Record<string, (a: boolean, b: boolean) => boolean> = {
              AND: (a, b) => a && b,
              OR: (a, b) => a || b,
              NAND: (a, b) => !(a && b),
              NOR: (a, b) => !(a || b),
              XOR: (a, b) => a !== b,
              XNOR: (a, b) => a === b,
            };
            const fn = gateFn[gate];
            if (!fn) return { success: false, result: "", steps, message: `Unknown gate: ${gate}` };
            steps.push(`${gate} gate truth table:`);
            for (const a of [true, false]) {
              for (const b of [true, false]) {
                truthTable.push({ A: a ? "1" : "0", B: b ? "1" : "0", [`${gate}`]: fn(a, b) ? "1" : "0" });
              }
            }
          }
          return { success: true, result: `Truth table for ${gate}`, truth_table: truthTable, steps, message: `${gate} gate truth table generated` };
        }

        case "evaluate": {
          if (!params.expression || !params.inputs) {
            return { success: false, result: "", steps, message: "Provide expression and inputs" };
          }
          const expr = params.expression.toUpperCase();
          steps.push(`Expression: ${expr}`);
          steps.push(`Inputs: ${JSON.stringify(params.inputs)}`);

          let jsExpr = expr
            .replace(/\bAND\b/g, "&&")
            .replace(/\bOR\b/g, "||")
            .replace(/\bNOT\b/g, "!")
            .replace(/\bXOR\b/g, "!=")
            .replace(/\bNAND\b/g, "NAND")
            .replace(/\bNOR\b/g, "NOR")
            .replace(/\bXNOR\b/g, "==");

          const hasNand = jsExpr.includes("NAND");
          const hasNor = jsExpr.includes("NOR");
          if (hasNand || hasNor) {
            steps.push("Note: NAND/NOR need manual evaluation. Converting...");
            jsExpr = jsExpr.replace(/NAND/g, "&&").replace(/NOR/g, "||");
          }

          for (const [key, value] of Object.entries(params.inputs)) {
            jsExpr = jsExpr.replace(new RegExp(`\\b${key.toUpperCase()}\\b`, "g"), String(value));
          }

          steps.push(`Evaluated as: ${jsExpr}`);
          try {
            let result = eval(jsExpr);
            if (hasNand) result = !result;
            if (hasNor) result = !result;
            steps.push(`Result: ${result ? "1 (TRUE)" : "0 (FALSE)"}`);
            return { success: true, result: result ? "1" : "0", steps, message: `Result: ${result ? "TRUE (1)" : "FALSE (0)"}` };
          } catch (e: any) {
            return { success: false, result: "", steps, message: `Evaluation error: ${e.message}` };
          }
        }

        case "simplify": {
          steps.push(`Boolean Algebra Simplification Rules:`);
          steps.push(``);
          steps.push(`Idempotent: A AND A = A, A OR A = A`);
          steps.push(`Identity: A AND 1 = A, A OR 0 = A`);
          steps.push(`Null: A AND 0 = 0, A OR 1 = 1`);
          steps.push(`Complement: A AND NOT A = 0, A OR NOT A = 1`);
          steps.push(`Involution: NOT(NOT A) = A`);
          steps.push(`Commutative: A AND B = B AND A, A OR B = B OR A`);
          steps.push(`Associative: (A AND B) AND C = A AND (B AND C)`);
          steps.push(`Distributive: A AND (B OR C) = (A AND B) OR (A AND C)`);
          steps.push(`Absorption: A AND (A OR B) = A, A OR (A AND B) = A`);
          steps.push(`De Morgan's: NOT(A AND B) = NOT A OR NOT B`);
          steps.push(`De Morgan's: NOT(A OR B) = NOT A AND NOT B`);
          steps.push(``);
          steps.push(`Karnaugh Map (K-map) simplification:`);
          steps.push(`1. Plot truth table on K-map grid`);
          steps.push(`2. Group adjacent 1s in powers of 2 (1, 2, 4, 8...)`);
          steps.push(`3. Write simplified expression from groups`);
          steps.push(`4. Each group = one product term`);
          steps.push(`5. Larger groups = simpler terms`);
          return { success: true, result: "Boolean simplification guide", steps, message: "Simplification rules and K-map guide provided" };
        }

        case "number_convert": {
          if (params.value === undefined || !params.from_base || !params.to_base) {
            return { success: false, result: "", steps, message: "Provide value, from_base, and to_base" };
          }
          const { value, from_base, to_base } = params;
          let decimal: number;

          if (from_base === "decimal") {
            decimal = value;
          } else if (from_base === "binary") {
            decimal = parseInt(String(value), 2);
          } else if (from_base === "hex") {
            decimal = parseInt(String(value), 16);
          } else {
            decimal = parseInt(String(value), 8);
          }
          steps.push(`Convert ${value} from ${from_base} to ${to_base}`);
          steps.push(`Decimal intermediate: ${decimal}`);

          let result: string;
          if (to_base === "decimal") {
            result = String(decimal);
          } else if (to_base === "binary") {
            result = decimal.toString(2);
          } else if (to_base === "hex") {
            result = decimal.toString(16).toUpperCase();
          } else {
            result = decimal.toString(8);
          }
          steps.push(`${to_base} result: ${result}`);
          return { success: true, result, steps, message: `${value} (${from_base}) = ${result} (${to_base})` };
        }

        case "add_subtract": {
          if (!params.adder_type) {
            return { success: false, result: "", steps, message: "Provide adder_type (half or full)" };
          }
          if (params.adder_type === "half") {
            steps.push(`Half Adder:`);
            steps.push(`  Sum = A XOR B`);
            steps.push(`  Carry = A AND B`);
            steps.push(``);
            steps.push(`Truth Table:`);
            steps.push(`  A=0, B=0 -> Sum=0, Carry=0`);
            steps.push(`  A=0, B=1 -> Sum=1, Carry=0`);
            steps.push(`  A=1, B=0 -> Sum=1, Carry=0`);
            steps.push(`  A=1, B=1 -> Sum=0, Carry=1`);
            return { success: true, result: "Half adder: Sum=XOR, Carry=AND", steps, message: "Half adder analysis" };
          } else {
            steps.push(`Full Adder:`);
            steps.push(`  Sum = A XOR B XOR Cin`);
            steps.push(`  Cout = (A AND B) OR (Cin AND (A XOR B))`);
            steps.push(``);
            steps.push(`Truth Table (8 combinations):`);
            steps.push(`  0+0+0=0(0), 0+0+1=1(0), 0+1+0=1(0), 0+1+1=0(1)`);
            steps.push(`  1+0+0=1(0), 1+0+1=0(1), 1+1+0=0(1), 1+1+1=1(1)`);
            steps.push(``);
            steps.push(`n-bit adder: cascade n full adders (ripple carry)`);
            steps.push(`Faster: carry-lookahead adder (CLA) reduces delay`);
            return { success: true, result: "Full adder: Sum=XOR(XOR), Cout=OR(AND,AND)", steps, message: "Full adder analysis" };
          }
        }

        case "flip_flop": {
          if (!params.flip_flop_type) {
            return { success: false, result: "", steps, message: "Provide flip_flop_type (SR, JK, D, or T)" };
          }
          const ff = params.flip_flop_type;
          steps.push(`${ff} Flip-Flop:`);

          if (ff === "SR") {
            steps.push(`  S=0, R=0: Hold (no change)`);
            steps.push(`  S=0, R=1: Reset (Q=0)`);
            steps.push(`  S=1, R=0: Set (Q=1)`);
            steps.push(`  S=1, R=1: INVALID (forbidden state)`);
            steps.push(`  Characteristic: Q_next = S + R'*Q`);
          } else if (ff === "JK") {
            steps.push(`  J=0, K=0: Hold (no change)`);
            steps.push(`  J=0, K=1: Reset (Q=0)`);
            steps.push(`  J=1, K=0: Set (Q=1)`);
            steps.push(`  J=1, K=1: Toggle (Q = NOT Q)`);
            steps.push(`  Characteristic: Q_next = J*Q' + K'*Q`);
            steps.push(`  Unlike SR, JK has no invalid state`);
          } else if (ff === "D") {
            steps.push(`  D=0: Q_next = 0 (Reset)`);
            steps.push(`  D=1: Q_next = 1 (Set)`);
            steps.push(`  Characteristic: Q_next = D`);
            steps.push(`  Simplest flip-flop: output follows input on clock edge`);
            steps.push(`  Used for registers and data storage`);
          } else if (ff === "T") {
            steps.push(`  T=0: Hold (no change)`);
            steps.push(`  T=1: Toggle (Q = NOT Q)`);
            steps.push(`  Characteristic: Q_next = T XOR Q`);
            steps.push(`  Used for counters and frequency dividers`);
          }
          steps.push(``);
          steps.push(`Clock types: rising-edge triggered, falling-edge triggered, level-triggered`);
          return { success: true, result: `${ff} flip-flop analysis`, steps, message: `${ff} flip-flop truth table and characteristics` };
        }

        default:
          return { success: false, result: "", steps, message: "Unknown operation" };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};
