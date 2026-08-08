/**
 * Mechanical Engineering tools — stress/strain analysis, beam bending,
 * fluid mechanics, heat transfer, gear systems, and thermodynamics.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// MECHANICAL SOLVE — stress, strain, beams, gears, torque
// =============================================================================

export const mechanicalSolve: ToolDef = {
  name: "mechanical.solve",
  description: "Solve mechanical engineering problems: stress/strain (Hooke's law, Young's modulus), beam bending (cantilever, simply supported), gear ratios, torque/power, shear force, bending moment, column buckling (Euler's formula), and fatigue analysis. Use 'list' to see all formulas.",
  inputSchema: z.object({
    formula: z.enum(["stress", "strain", "youngs_modulus", "poisson_ratio", "shear_stress", "beam_cantilever_end_load", "beam_cantilever_udl", "beam_simple_point_load", "beam_simple_udl", "gear_ratio", "torque_power", "column_buckling", "fatigue_soderberg", "list"]).describe("Formula to use (or 'list')"),
    force: z.number().optional().describe("Force in newtons (N)"),
    area: z.number().optional().describe("Cross-sectional area in m^2"),
    stress: z.number().optional().describe("Stress in Pa (N/m^2)"),
    strain: z.number().optional().describe("Strain (dimensionless)"),
    youngs_modulus: z.number().optional().describe("Young's modulus in Pa"),
    poisson: z.number().optional().describe("Poisson's ratio"),
    lateral_strain: z.number().optional().describe("Lateral strain"),
    axial_strain: z.number().optional().describe("Axial strain"),
    length: z.number().optional().describe("Beam length in meters"),
    load: z.number().optional().describe("Load in newtons (N)"),
    udl: z.number().optional().describe("Uniformly distributed load in N/m"),
    distance: z.number().optional().describe("Distance from support in meters"),
    modulus: z.number().optional().describe("Modulus of elasticity in Pa"),
    moment_inertia: z.number().optional().describe("Area moment of inertia in m^4"),
    teeth_driver: z.number().optional().describe("Teeth on driver gear"),
    teeth_driven: z.number().optional().describe("Teeth on driven gear"),
    speed_driver: z.number().optional().describe("Speed of driver gear (RPM)"),
    torque: z.number().optional().describe("Torque in N*m"),
    angular_speed: z.number().optional().describe("Angular speed in rad/s"),
    power: z.number().optional().describe("Power in watts"),
    radius: z.number().optional().describe("Radius in meters"),
    column_length: z.number().optional().describe("Column length in meters"),
    end_condition: z.enum(["pinned_pinned", "fixed_free", "fixed_pinned", "fixed_fixed"]).default("pinned_pinned").describe("Column end condition"),
    stress_amplitude: z.number().optional().describe("Stress amplitude for fatigue (Pa)"),
    mean_stress: z.number().optional().describe("Mean stress for fatigue (Pa)"),
    endurance_limit: z.number().optional().describe("Endurance limit (Pa)"),
    yield_strength: z.number().optional().describe("Yield strength (Pa)"),
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
      if (params.formula === "list") {
        const list = [
          "stress: sigma = F/A — Normal stress",
          "strain: epsilon = delta_L/L — Strain (needs original and change in length)",
          "youngs_modulus: E = stress/strain — Young's modulus",
          "poisson_ratio: nu = -lateral_strain/axial_strain — Poisson's ratio",
          "shear_stress: tau = F/A — Shear stress",
          "beam_cantilever_end_load: Deflection and moment for end-loaded cantilever",
          "beam_cantilever_udl: Deflection and moment for UDL cantilever",
          "beam_simple_point_load: Deflection for simply supported beam, center load",
          "beam_simple_udl: Deflection for simply supported beam, UDL",
          "gear_ratio: GR = N_driven/N_driver = speed_driver/speed_driven",
          "torque_power: P = T * omega — Power from torque and angular speed",
          "column_buckling: P_cr = pi^2*E*I/(L_e^2) — Euler buckling load",
          "fatigue_soderberg: Soderberg criterion for fatigue design",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available mechanical formulas" };
      }

      switch (params.formula) {
        case "stress": {
          if (params.force !== undefined && params.area !== undefined) {
            const sigma = params.force / params.area;
            steps.push(`Normal Stress: sigma = F/A`);
            steps.push(`sigma = ${params.force} N / ${params.area} m^2 = ${sigma} Pa`);
            steps.push(`= ${(sigma / 1e6).toFixed(4)} MPa`);
            return { success: true, result: `${sigma} Pa`, result_value: sigma, formula: "sigma = F/A", steps, message: `Stress = ${sigma} Pa (${(sigma / 1e6).toFixed(4)} MPa)` };
          }
          if (params.stress !== undefined && params.area !== undefined) {
            const f = params.stress * params.area;
            steps.push(`Force: F = sigma * A = ${params.stress} * ${params.area} = ${f} N`);
            return { success: true, result: `${f} N`, result_value: f, formula: "F = sigma * A", steps, message: `Force = ${f} N` };
          }
          return { success: false, result: "", formula: "sigma = F/A", steps, message: "Provide force and area (or stress and area)" };
        }

        case "strain": {
          if (params.length !== undefined && params.distance !== undefined) {
            const epsilon = params.distance / params.length;
            steps.push(`Strain: epsilon = delta_L / L`);
            steps.push(`epsilon = ${params.distance} / ${params.length} = ${epsilon}`);
            return { success: true, result: `${epsilon}`, result_value: epsilon, formula: "epsilon = delta_L/L", steps, message: `Strain = ${epsilon}` };
          }
          return { success: false, result: "", formula: "epsilon = delta_L/L", steps, message: "Provide length (original) and distance (change in length)" };
        }

        case "youngs_modulus": {
          if (params.stress !== undefined && params.strain !== undefined) {
            const e = params.stress / params.strain;
            steps.push(`Young's Modulus: E = stress / strain`);
            steps.push(`E = ${params.stress} Pa / ${params.strain} = ${e} Pa`);
            steps.push(`= ${(e / 1e9).toFixed(4)} GPa`);
            return { success: true, result: `${e} Pa`, result_value: e, formula: "E = stress/strain", steps, message: `Young's modulus = ${e} Pa (${(e / 1e9).toFixed(2)} GPa)` };
          }
          return { success: false, result: "", formula: "E = stress/strain", steps, message: "Provide stress and strain" };
        }

        case "poisson_ratio": {
          if (params.lateral_strain !== undefined && params.axial_strain !== undefined) {
            const nu = -params.lateral_strain / params.axial_strain;
            steps.push(`Poisson's Ratio: nu = -lateral_strain / axial_strain`);
            steps.push(`nu = -(${params.lateral_strain}) / ${params.axial_strain} = ${nu}`);
            steps.push(`Typical range: 0-0.5 (0.5 = incompressible, 0.3 typical for metals)`);
            return { success: true, result: `${nu}`, result_value: nu, formula: "nu = -lateral/axial", steps, message: `Poisson's ratio = ${nu}` };
          }
          return { success: false, result: "", formula: "nu = -lateral_strain/axial_strain", steps, message: "Provide lateral_strain and axial_strain" };
        }

        case "shear_stress": {
          if (params.force !== undefined && params.area !== undefined) {
            const tau = params.force / params.area;
            steps.push(`Shear Stress: tau = F/A`);
            steps.push(`tau = ${params.force} / ${params.area} = ${tau} Pa`);
            return { success: true, result: `${tau} Pa`, result_value: tau, formula: "tau = F/A", steps, message: `Shear stress = ${tau} Pa` };
          }
          return { success: false, result: "", formula: "tau = F/A", steps, message: "Provide force and area" };
        }

        case "beam_cantilever_end_load": {
          if (params.load === undefined || params.length === undefined || params.modulus === undefined || params.moment_inertia === undefined) {
            return { success: false, result: "", formula: "delta = PL^3/(3EI), M_max = PL", steps, message: "Provide load, length, modulus, moment_inertia" };
          }
          const { load: P, length: L, modulus: E, moment_inertia: I } = params;
          const delta = (P * L ** 3) / (3 * E * I);
          const maxMoment = P * L;
          const maxSlope = (P * L ** 2) / (2 * E * I);
          steps.push(`Cantilever Beam — End Point Load:`);
          steps.push(`  P = ${P} N, L = ${L} m, E = ${E} Pa, I = ${I} m^4`);
          steps.push(`  Max deflection: delta = PL^3/(3EI) = ${delta} m`);
          steps.push(`  Max bending moment: M = PL = ${maxMoment} N*m`);
          steps.push(`  Max slope: theta = PL^2/(2EI) = ${maxSlope} rad`);
          steps.push(`  Reaction at wall: R = ${P} N, M = ${maxMoment} N*m`);
          return { success: true, result: `delta=${delta} m, M_max=${maxMoment} N*m`, result_value: delta, formula: "delta = PL^3/(3EI)", steps, message: `Max deflection = ${delta} m, max moment = ${maxMoment} N*m` };
        }

        case "beam_cantilever_udl": {
          if (params.udl === undefined || params.length === undefined || params.modulus === undefined || params.moment_inertia === undefined) {
            return { success: false, result: "", formula: "delta = wL^4/(8EI), M_max = wL^2/2", steps, message: "Provide udl, length, modulus, moment_inertia" };
          }
          const { udl: w, length: L, modulus: E, moment_inertia: I } = params;
          const delta = (w * L ** 4) / (8 * E * I);
          const maxMoment = (w * L ** 2) / 2;
          const totalLoad = w * L;
          steps.push(`Cantilever Beam — Uniformly Distributed Load:`);
          steps.push(`  w = ${w} N/m, L = ${L} m`);
          steps.push(`  Max deflection: delta = wL^4/(8EI) = ${delta} m`);
          steps.push(`  Max bending moment: M = wL^2/2 = ${maxMoment} N*m`);
          steps.push(`  Total load: W = wL = ${totalLoad} N`);
          return { success: true, result: `delta=${delta} m, M_max=${maxMoment} N*m`, result_value: delta, formula: "delta = wL^4/(8EI)", steps, message: `Max deflection = ${delta} m, max moment = ${maxMoment} N*m` };
        }

        case "beam_simple_point_load": {
          if (params.load === undefined || params.length === undefined || params.modulus === undefined || params.moment_inertia === undefined) {
            return { success: false, result: "", formula: "delta = PL^3/(48EI), M_max = PL/4", steps, message: "Provide load, length, modulus, moment_inertia" };
          }
          const { load: P, length: L, modulus: E, moment_inertia: I } = params;
          const delta = (P * L ** 3) / (48 * E * I);
          const maxMoment = (P * L) / 4;
          const maxShear = P / 2;
          steps.push(`Simply Supported Beam — Center Point Load:`);
          steps.push(`  P = ${P} N, L = ${L} m`);
          steps.push(`  Max deflection (center): delta = PL^3/(48EI) = ${delta} m`);
          steps.push(`  Max bending moment: M = PL/4 = ${maxMoment} N*m`);
          steps.push(`  Max shear: V = P/2 = ${maxShear} N`);
          steps.push(`  Reactions: R_A = R_B = ${maxShear} N`);
          return { success: true, result: `delta=${delta} m, M_max=${maxMoment} N*m`, result_value: delta, formula: "delta = PL^3/(48EI)", steps, message: `Max deflection = ${delta} m, max moment = ${maxMoment} N*m` };
        }

        case "beam_simple_udl": {
          if (params.udl === undefined || params.length === undefined || params.modulus === undefined || params.moment_inertia === undefined) {
            return { success: false, result: "", formula: "delta = 5wL^4/(384EI), M_max = wL^2/8", steps, message: "Provide udl, length, modulus, moment_inertia" };
          }
          const { udl: w, length: L, modulus: E, moment_inertia: I } = params;
          const delta = (5 * w * L ** 4) / (384 * E * I);
          const maxMoment = (w * L ** 2) / 8;
          const maxShear = (w * L) / 2;
          steps.push(`Simply Supported Beam — Uniformly Distributed Load:`);
          steps.push(`  w = ${w} N/m, L = ${L} m`);
          steps.push(`  Max deflection: delta = 5wL^4/(384EI) = ${delta} m`);
          steps.push(`  Max bending moment: M = wL^2/8 = ${maxMoment} N*m`);
          steps.push(`  Max shear: V = wL/2 = ${maxShear} N`);
          return { success: true, result: `delta=${delta} m, M_max=${maxMoment} N*m`, result_value: delta, formula: "delta = 5wL^4/(384EI)", steps, message: `Max deflection = ${delta} m, max moment = ${maxMoment} N*m` };
        }

        case "gear_ratio": {
          if (params.teeth_driver === undefined || params.teeth_driven === undefined) {
            return { success: false, result: "", formula: "GR = N_driven/N_driver", steps, message: "Provide teeth_driver and teeth_driven" };
          }
          const gr = params.teeth_driven / params.teeth_driver;
          steps.push(`Gear Ratio: GR = N_driven / N_driver`);
          steps.push(`GR = ${params.teeth_driven} / ${params.teeth_driver} = ${gr.toFixed(4)}`);
          if (params.speed_driver !== undefined) {
            const speedDriven = params.speed_driver / gr;
            steps.push(`Output speed = ${params.speed_driver} / ${gr.toFixed(4)} = ${speedDriven.toFixed(2)} RPM`);
            steps.push(`GR > 1: speed reducer (more torque)`);
            steps.push(`GR < 1: speed increaser (less torque)`);
            return { success: true, result: `GR=${gr.toFixed(4)}, output=${speedDriven.toFixed(2)} RPM`, result_value: gr, formula: "GR = N_driven/N_driver", steps, message: `Gear ratio = ${gr.toFixed(4)}, output speed = ${speedDriven.toFixed(2)} RPM` };
          }
          return { success: true, result: `${gr.toFixed(4)}`, result_value: gr, formula: "GR = N_driven/N_driver", steps, message: `Gear ratio = ${gr.toFixed(4)}` };
        }

        case "torque_power": {
          if (params.torque !== undefined && params.angular_speed !== undefined) {
            const p = params.torque * params.angular_speed;
            steps.push(`Power: P = T * omega`);
            steps.push(`P = ${params.torque} N*m * ${params.angular_speed} rad/s = ${p} W`);
            steps.push(`= ${(p / 1000).toFixed(4)} kW = ${(p / 745.7).toFixed(4)} HP`);
            return { success: true, result: `${p} W`, result_value: p, formula: "P = T * omega", steps, message: `Power = ${p} W (${(p / 1000).toFixed(2)} kW, ${(p / 745.7).toFixed(2)} HP)` };
          }
          if (params.power !== undefined && params.angular_speed !== undefined) {
            const t = params.power / params.angular_speed;
            steps.push(`Torque: T = P / omega = ${params.power} / ${params.angular_speed} = ${t} N*m`);
            return { success: true, result: `${t} N*m`, result_value: t, formula: "T = P/omega", steps, message: `Torque = ${t} N*m` };
          }
          if (params.torque !== undefined && params.radius !== undefined && params.force !== undefined) {
            const t = params.force * params.radius;
            steps.push(`Torque: T = F * r = ${params.force} * ${params.radius} = ${t} N*m`);
            return { success: true, result: `${t} N*m`, result_value: t, formula: "T = F*r", steps, message: `Torque = ${t} N*m` };
          }
          return { success: false, result: "", formula: "P = T * omega", steps, message: "Provide torque and angular_speed (or power and angular_speed)" };
        }

        case "column_buckling": {
          if (params.modulus === undefined || params.moment_inertia === undefined || params.column_length === undefined) {
            return { success: false, result: "", formula: "P_cr = pi^2*E*I/(L_e^2)", steps, message: "Provide modulus, moment_inertia, column_length" };
          }
          const kFactors: Record<string, number> = {
            pinned_pinned: 1.0,
            fixed_free: 2.0,
            fixed_pinned: 0.7,
            fixed_fixed: 0.5,
          };
          const k = kFactors[params.end_condition] ?? 1.0;
          const Le = k * params.column_length;
          const pCr = (Math.PI ** 2 * params.modulus * params.moment_inertia) / (Le ** 2);
          steps.push(`Euler Column Buckling: P_cr = pi^2*E*I/(L_e^2)`);
          steps.push(`End condition: ${params.end_condition}, K = ${k}`);
          steps.push(`Effective length: L_e = K*L = ${k}*${params.column_length} = ${Le} m`);
          steps.push(`P_cr = pi^2 * ${params.modulus} * ${params.moment_inertia} / ${Le}^2 = ${pCr} N`);
          steps.push(`= ${(pCr / 1000).toFixed(2)} kN`);
          return { success: true, result: `${pCr} N`, result_value: pCr, formula: "P_cr = pi^2*E*I/(K*L)^2", steps, message: `Critical buckling load = ${pCr} N (${(pCr / 1000).toFixed(2)} kN)` };
        }

        case "fatigue_soderberg": {
          if (params.stress_amplitude === undefined || params.mean_stress === undefined || params.endurance_limit === undefined || params.yield_strength === undefined) {
            return { success: false, result: "", formula: "(sigma_a/S_e) + (sigma_m/S_y) = 1/n", steps, message: "Provide stress_amplitude, mean_stress, endurance_limit, yield_strength" };
          }
          const { stress_amplitude: sa, mean_stress: sm, endurance_limit: se, yield_strength: sy } = params;
          const n = 1 / (sa / se + sm / sy);
          steps.push(`Soderberg Fatigue Criterion:`);
          steps.push(`  (sigma_a/S_e) + (sigma_m/S_y) = 1/n`);
          steps.push(`  (${sa}/${se}) + (${sm}/${sy}) = ${(sa / se + sm / sy).toFixed(6)}`);
          steps.push(`  Safety factor: n = ${n.toFixed(4)}`);
          steps.push(`  ${n > 1 ? "SAFE (n > 1)" : "UNSAFE (n < 1) — redesign needed"}`);
          return { success: true, result: `n = ${n.toFixed(4)}`, result_value: n, formula: "Soderberg: (sa/Se)+(sm/Sy)=1/n", steps, message: `Safety factor = ${n.toFixed(4)} (${n > 1 ? "safe" : "unsafe"})` };
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
// FLUID MECHANICS — Bernoulli, Reynolds, pressure, flow rate
// =============================================================================

export const fluidMechanics: ToolDef = {
  name: "fluid.mechanics",
  description: "Solve fluid mechanics problems: Bernoulli's equation, Reynolds number (laminar/turbulent), continuity equation (flow rate), pressure in fluids, hydrostatic pressure, drag force, and pipe friction (Darcy-Weisbach). Use 'list' to see all.",
  inputSchema: z.object({
    formula: z.enum(["bernoulli", "reynolds", "continuity", "hydrostatic_pressure", "drag_force", "darcy_weisbach", "list"]).describe("Formula to use (or 'list')"),
    pressure1: z.number().optional().describe("Pressure at point 1 (Pa)"),
    pressure2: z.number().optional().describe("Pressure at point 2 (Pa)"),
    velocity1: z.number().optional().describe("Velocity at point 1 (m/s)"),
    velocity2: z.number().optional().describe("Velocity at point 2 (m/s)"),
    height1: z.number().optional().describe("Height at point 1 (m)"),
    height2: z.number().optional().describe("Height at point 2 (m)"),
    density: z.number().optional().describe("Fluid density (kg/m^3)"),
    viscosity: z.number().optional().describe("Dynamic viscosity (Pa*s)"),
    diameter: z.number().optional().describe("Pipe diameter (m)"),
    velocity: z.number().optional().describe("Flow velocity (m/s)"),
    area1: z.number().optional().describe("Cross-sectional area 1 (m^2)"),
    area2: z.number().optional().describe("Cross-sectional area 2 (m^2)"),
    depth: z.number().optional().describe("Depth below surface (m)"),
    drag_coefficient: z.number().optional().describe("Drag coefficient (Cd)"),
    area: z.number().optional().describe("Reference area (m^2)"),
    friction_factor: z.number().optional().describe("Darcy friction factor"),
    pipe_length: z.number().optional().describe("Pipe length (m)"),
    gravity: z.number().default(9.81).describe("Gravitational acceleration (m/s^2)"),
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
    const g = params.gravity;

    try {
      if (params.formula === "list") {
        const list = [
          "bernoulli: P1 + 0.5*rho*v1^2 + rho*g*h1 = P2 + 0.5*rho*v2^2 + rho*g*h2",
          "reynolds: Re = rho*v*D/mu — Laminar (<2300), Turbulent (>4000)",
          "continuity: A1*v1 = A2*v2 — Mass conservation",
          "hydrostatic_pressure: P = rho*g*h — Pressure at depth",
          "drag_force: F_d = 0.5*rho*v^2*Cd*A — Drag force",
          "darcy_weisbach: delta_P = f*(L/D)*0.5*rho*v^2 — Pipe friction loss",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available fluid mechanics formulas" };
      }

      switch (params.formula) {
        case "bernoulli": {
          if (params.density === undefined) return { success: false, result: "", formula: "", steps, message: "Provide density" };
          const rho = params.density;
          // Solve for missing pressure2 if all others provided
          if (params.pressure1 !== undefined && params.velocity1 !== undefined && params.height1 !== undefined &&
              params.velocity2 !== undefined && params.height2 !== undefined && params.pressure2 === undefined) {
            const p2 = params.pressure1 + 0.5 * rho * params.velocity1 ** 2 + rho * g * params.height1
              - 0.5 * rho * params.velocity2 ** 2 - rho * g * params.height2;
            steps.push(`Bernoulli's Equation: P1 + 0.5*rho*v1^2 + rho*g*h1 = P2 + 0.5*rho*v2^2 + rho*g*h2`);
            steps.push(`P2 = P1 + 0.5*rho*v1^2 + rho*g*h1 - 0.5*rho*v2^2 - rho*g*h2`);
            steps.push(`P2 = ${params.pressure1} + ${0.5 * rho * params.velocity1 ** 2} + ${rho * g * params.height1} - ${0.5 * rho * params.velocity2 ** 2} - ${rho * g * params.height2}`);
            steps.push(`P2 = ${p2} Pa`);
            return { success: true, result: `${p2} Pa`, result_value: p2, formula: "Bernoulli", steps, message: `P2 = ${p2} Pa` };
          }
          // Solve for missing velocity2
          if (params.pressure1 !== undefined && params.pressure2 !== undefined && params.velocity1 !== undefined &&
              params.height1 !== undefined && params.height2 !== undefined && params.velocity2 === undefined) {
            const term = (params.pressure1 - params.pressure2 + 0.5 * rho * params.velocity1 ** 2 + rho * g * (params.height1 - params.height2)) / (0.5 * rho);
            const v2 = Math.sqrt(Math.max(0, term));
            steps.push(`Bernoulli: solving for v2`);
            steps.push(`v2 = ${v2} m/s`);
            return { success: true, result: `${v2} m/s`, result_value: v2, formula: "Bernoulli", steps, message: `v2 = ${v2} m/s` };
          }
          return { success: false, result: "", formula: "Bernoulli", steps, message: "Provide enough values to solve for one unknown" };
        }

        case "reynolds": {
          if (params.density === undefined || params.velocity === undefined || params.diameter === undefined || params.viscosity === undefined) {
            return { success: false, result: "", formula: "Re = rho*v*D/mu", steps, message: "Provide density, velocity, diameter, viscosity" };
          }
          const re = (params.density * params.velocity * params.diameter) / params.viscosity;
          const flowType = re < 2300 ? "LAMINAR" : re > 4000 ? "TURBULENT" : "TRANSITIONAL";
          steps.push(`Reynolds Number: Re = rho*v*D/mu`);
          steps.push(`Re = ${params.density} * ${params.velocity} * ${params.diameter} / ${params.viscosity} = ${re.toFixed(2)}`);
          steps.push(`Flow regime: ${flowType}`);
          steps.push(`  Laminar: Re < 2300`);
          steps.push(`  Transitional: 2300 < Re < 4000`);
          steps.push(`  Turbulent: Re > 4000`);
          return { success: true, result: `${re.toFixed(2)} (${flowType})`, result_value: re, formula: "Re = rho*v*D/mu", steps, message: `Re = ${re.toFixed(2)} — ${flowType} flow` };
        }

        case "continuity": {
          if (params.area1 !== undefined && params.velocity1 !== undefined && params.area2 !== undefined && params.velocity2 === undefined) {
            const v2 = (params.area1 * params.velocity1) / params.area2;
            steps.push(`Continuity: A1*v1 = A2*v2`);
            steps.push(`v2 = ${params.area1} * ${params.velocity1} / ${params.area2} = ${v2} m/s`);
            steps.push(`Flow rate Q = A1*v1 = ${params.area1 * params.velocity1} m^3/s`);
            return { success: true, result: `v2 = ${v2} m/s`, result_value: v2, formula: "A1*v1 = A2*v2", steps, message: `v2 = ${v2} m/s, Q = ${params.area1 * params.velocity1} m^3/s` };
          }
          if (params.area1 !== undefined && params.velocity1 !== undefined && params.area2 === undefined && params.velocity2 !== undefined) {
            const a2 = (params.area1 * params.velocity1) / params.velocity2;
            steps.push(`A2 = A1*v1/v2 = ${params.area1}*${params.velocity1}/${params.velocity2} = ${a2} m^2`);
            return { success: true, result: `A2 = ${a2} m^2`, result_value: a2, formula: "A1*v1 = A2*v2", steps, message: `A2 = ${a2} m^2` };
          }
          return { success: false, result: "", formula: "A1*v1 = A2*v2", steps, message: "Provide three of: area1, velocity1, area2, velocity2" };
        }

        case "hydrostatic_pressure": {
          if (params.density === undefined || params.depth === undefined) {
            return { success: false, result: "", formula: "P = rho*g*h", steps, message: "Provide density and depth" };
          }
          const p = params.density * g * params.depth;
          steps.push(`Hydrostatic Pressure: P = rho*g*h`);
          steps.push(`P = ${params.density} * ${g} * ${params.depth} = ${p} Pa`);
          steps.push(`= ${(p / 1000).toFixed(4)} kPa`);
          return { success: true, result: `${p} Pa`, result_value: p, formula: "P = rho*g*h", steps, message: `Pressure = ${p} Pa (${(p / 1000).toFixed(2)} kPa)` };
        }

        case "drag_force": {
          if (params.density === undefined || params.velocity === undefined || params.drag_coefficient === undefined || params.area === undefined) {
            return { success: false, result: "", formula: "F_d = 0.5*rho*v^2*Cd*A", steps, message: "Provide density, velocity, drag_coefficient, area" };
          }
          const fd = 0.5 * params.density * params.velocity ** 2 * params.drag_coefficient * params.area;
          steps.push(`Drag Force: F_d = 0.5 * rho * v^2 * Cd * A`);
          steps.push(`F_d = 0.5 * ${params.density} * ${params.velocity}^2 * ${params.drag_coefficient} * ${params.area} = ${fd} N`);
          return { success: true, result: `${fd} N`, result_value: fd, formula: "F_d = 0.5*rho*v^2*Cd*A", steps, message: `Drag force = ${fd} N` };
        }

        case "darcy_weisbach": {
          if (params.friction_factor === undefined || params.pipe_length === undefined || params.diameter === undefined ||
              params.density === undefined || params.velocity === undefined) {
            return { success: false, result: "", formula: "dP = f*(L/D)*0.5*rho*v^2", steps, message: "Provide friction_factor, pipe_length, diameter, density, velocity" };
          }
          const dP = params.friction_factor * (params.pipe_length / params.diameter) * 0.5 * params.density * params.velocity ** 2;
          steps.push(`Darcy-Weisbach: dP = f*(L/D)*0.5*rho*v^2`);
          steps.push(`dP = ${params.friction_factor} * (${params.pipe_length}/${params.diameter}) * 0.5 * ${params.density} * ${params.velocity}^2`);
          steps.push(`dP = ${dP} Pa = ${(dP / 1000).toFixed(4)} kPa`);
          steps.push(`Head loss: h_f = dP/(rho*g) = ${(dP / (params.density * g)).toFixed(4)} m`);
          return { success: true, result: `${dP} Pa`, result_value: dP, formula: "dP = f*(L/D)*0.5*rho*v^2", steps, message: `Pressure drop = ${dP} Pa, head loss = ${(dP / (params.density * g)).toFixed(4)} m` };
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
// HEAT TRANSFER — conduction, convection, radiation
// =============================================================================

export const heatTransfer: ToolDef = {
  name: "heat.transfer",
  description: "Solve heat transfer problems: conduction (Fourier's law, plane wall, cylindrical), convection (Newton's law of cooling), radiation (Stefan-Boltzmann), heat exchanger (LMTD), and thermal resistance. Use 'list' to see all.",
  inputSchema: z.object({
    formula: z.enum(["conduction_plane", "conduction_cylindrical", "convection", "radiation", "heat_exchanger_lmtd", "thermal_resistance", "list"]).describe("Formula to use (or 'list')"),
    thermal_conductivity: z.number().optional().describe("Thermal conductivity k (W/m*K)"),
    area: z.number().optional().describe("Area (m^2)"),
    thickness: z.number().optional().describe("Wall thickness (m)"),
    temp_hot: z.number().optional().describe("Hot temperature (K or C)"),
    temp_cold: z.number().optional().describe("Cold temperature (K or C)"),
    inner_radius: z.number().optional().describe("Inner radius (m)"),
    outer_radius: z.number().optional().describe("Outer radius (m)"),
    length: z.number().optional().describe("Cylinder length (m)"),
    heat_transfer_coeff: z.number().optional().describe("Convection coefficient h (W/m^2*K)"),
    emissivity: z.number().optional().describe("Emissivity (0-1)"),
    temp1: z.number().optional().describe("Temperature 1 for heat exchanger"),
    temp2: z.number().optional().describe("Temperature 2 for heat exchanger"),
    temp3: z.number().optional().describe("Temperature 3 for heat exchanger"),
    temp4: z.number().optional().describe("Temperature 4 for heat exchanger"),
    counter_flow: z.boolean().default(false).describe("True for counter-flow heat exchanger"),
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
    const sigma = 5.67e-8; // Stefan-Boltzmann constant

    try {
      if (params.formula === "list") {
        const list = [
          "conduction_plane: Q = k*A*(T_hot - T_cold)/thickness — Fourier's law (plane wall)",
          "conduction_cylindrical: Q = 2*pi*k*L*(T_in - T_out)/ln(r_out/r_in) — Cylindrical wall",
          "convection: Q = h*A*(T_surface - T_fluid) — Newton's law of cooling",
          "radiation: Q = epsilon*sigma*A*(T_hot^4 - T_cold^4) — Stefan-Boltzmann",
          "heat_exchanger_lmtd: Q = U*A*LMTD — Log Mean Temperature Difference",
          "thermal_resistance: R = thickness/(k*A) — Thermal resistance",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available heat transfer formulas" };
      }

      switch (params.formula) {
        case "conduction_plane": {
          if (params.thermal_conductivity === undefined || params.area === undefined || params.temp_hot === undefined || params.temp_cold === undefined || params.thickness === undefined) {
            return { success: false, result: "", formula: "Q = k*A*dT/dx", steps, message: "Provide thermal_conductivity, area, temp_hot, temp_cold, thickness" };
          }
          const q = (params.thermal_conductivity * params.area * (params.temp_hot - params.temp_cold)) / params.thickness;
          steps.push(`Conduction (Plane Wall): Q = k*A*(T_hot - T_cold)/thickness`);
          steps.push(`Q = ${params.thermal_conductivity} * ${params.area} * (${params.temp_hot} - ${params.temp_cold}) / ${params.thickness}`);
          steps.push(`Q = ${q} W`);
          return { success: true, result: `${q} W`, result_value: q, formula: "Q = k*A*dT/dx", steps, message: `Heat transfer rate = ${q} W` };
        }

        case "conduction_cylindrical": {
          if (params.thermal_conductivity === undefined || params.length === undefined || params.temp_hot === undefined || params.temp_cold === undefined || params.inner_radius === undefined || params.outer_radius === undefined) {
            return { success: false, result: "", formula: "Q = 2*pi*k*L*dT/ln(r_out/r_in)", steps, message: "Provide thermal_conductivity, length, temp_hot, temp_cold, inner_radius, outer_radius" };
          }
          const q = (2 * Math.PI * params.thermal_conductivity * params.length * (params.temp_hot - params.temp_cold)) / Math.log(params.outer_radius / params.inner_radius);
          steps.push(`Conduction (Cylindrical): Q = 2*pi*k*L*(T_in - T_out)/ln(r_out/r_in)`);
          steps.push(`Q = 2*pi*${params.thermal_conductivity}*${params.length}*(${params.temp_hot}-${params.temp_cold})/ln(${params.outer_radius}/${params.inner_radius})`);
          steps.push(`Q = ${q} W`);
          return { success: true, result: `${q} W`, result_value: q, formula: "Q = 2*pi*k*L*dT/ln(r_out/r_in)", steps, message: `Heat transfer rate = ${q} W` };
        }

        case "convection": {
          if (params.heat_transfer_coeff === undefined || params.area === undefined || params.temp_hot === undefined || params.temp_cold === undefined) {
            return { success: false, result: "", formula: "Q = h*A*(T_s - T_f)", steps, message: "Provide heat_transfer_coeff, area, temp_hot (surface), temp_cold (fluid)" };
          }
          const q = params.heat_transfer_coeff * params.area * (params.temp_hot - params.temp_cold);
          steps.push(`Convection: Q = h*A*(T_surface - T_fluid)`);
          steps.push(`Q = ${params.heat_transfer_coeff} * ${params.area} * (${params.temp_hot} - ${params.temp_cold}) = ${q} W`);
          return { success: true, result: `${q} W`, result_value: q, formula: "Q = h*A*dT", steps, message: `Convective heat transfer = ${q} W` };
        }

        case "radiation": {
          if (params.emissivity === undefined || params.area === undefined || params.temp_hot === undefined || params.temp_cold === undefined) {
            return { success: false, result: "", formula: "Q = eps*sigma*A*(T_h^4 - T_c^4)", steps, message: "Provide emissivity, area, temp_hot, temp_cold (in Kelvin)" };
          }
          const q = params.emissivity * sigma * params.area * (params.temp_hot ** 4 - params.temp_cold ** 4);
          steps.push(`Radiation: Q = epsilon * sigma * A * (T_hot^4 - T_cold^4)`);
          steps.push(`sigma = 5.67e-8 W/m^2*K^4`);
          steps.push(`Q = ${params.emissivity} * 5.67e-8 * ${params.area} * (${params.temp_hot}^4 - ${params.temp_cold}^4)`);
          steps.push(`Q = ${q} W`);
          steps.push(`Note: Temperatures must be in Kelvin`);
          return { success: true, result: `${q} W`, result_value: q, formula: "Q = eps*sigma*A*(T_h^4-T_c^4)", steps, message: `Radiative heat transfer = ${q} W` };
        }

        case "heat_exchanger_lmtd": {
          if (params.temp1 === undefined || params.temp2 === undefined || params.temp3 === undefined || params.temp4 === undefined) {
            return { success: false, result: "", formula: "LMTD = (dT1 - dT2)/ln(dT1/dT2)", steps, message: "Provide temp1 (hot in), temp2 (hot out), temp3 (cold in), temp4 (cold out)" };
          }
          const dT1 = params.temp1 - params.temp4; // hot in - cold out
          const dT2 = params.temp2 - params.temp3; // hot out - cold in
          const lmtd = (dT1 - dT2) / Math.log(dT1 / dT2);
          steps.push(`LMTD Method for Heat Exchanger:`);
          steps.push(`  ${params.counter_flow ? "Counter-flow" : "Parallel-flow"}`);
          steps.push(`  dT1 = T_hot_in - T_cold_out = ${params.temp1} - ${params.temp4} = ${dT1}`);
          steps.push(`  dT2 = T_hot_out - T_cold_in = ${params.temp2} - ${params.temp3} = ${dT2}`);
          steps.push(`  LMTD = (${dT1} - ${dT2}) / ln(${dT1}/${dT2}) = ${lmtd.toFixed(4)}`);
          steps.push(`  Q = U * A * LMTD (need U and A to calculate Q)`);
          return { success: true, result: `LMTD = ${lmtd.toFixed(4)}`, result_value: lmtd, formula: "LMTD = (dT1-dT2)/ln(dT1/dT2)", steps, message: `LMTD = ${lmtd.toFixed(4)}` };
        }

        case "thermal_resistance": {
          if (params.thickness === undefined || params.thermal_conductivity === undefined || params.area === undefined) {
            return { success: false, result: "", formula: "R = L/(k*A)", steps, message: "Provide thickness, thermal_conductivity, area" };
          }
          const r = params.thickness / (params.thermal_conductivity * params.area);
          steps.push(`Thermal Resistance: R = L/(k*A)`);
          steps.push(`R = ${params.thickness} / (${params.thermal_conductivity} * ${params.area}) = ${r} K/W`);
          steps.push(`Heat transfer: Q = dT/R = (T_hot - T_cold)/R`);
          return { success: true, result: `${r} K/W`, result_value: r, formula: "R = L/(k*A)", steps, message: `Thermal resistance = ${r} K/W` };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown formula" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};
