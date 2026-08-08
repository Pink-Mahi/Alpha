/**
 * Astronomy tools — orbital mechanics, Kepler's laws, stellar properties,
 * cosmological calculations, and astronomical constants.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// Astronomical constants
const ASTRO_CONSTANTS = {
  G: 6.674e-11,           // Gravitational constant (N*m^2/kg^2)
  M_sun: 1.989e30,         // Mass of Sun (kg)
  M_earth: 5.972e24,       // Mass of Earth (kg)
  R_earth: 6.371e6,        // Radius of Earth (m)
  R_sun: 6.9634e8,         // Radius of Sun (m)
  AU: 1.496e11,            // Astronomical unit (m)
  c: 299792458,            // Speed of light (m/s)
  sigma: 5.67e-8,          // Stefan-Boltzmann constant
  L_sun: 3.828e26,         // Solar luminosity (W)
  T_sun: 5778,             // Sun surface temperature (K)
  H0: 70,                  // Hubble constant (km/s/Mpc)
  parsec: 3.086e16,        // 1 parsec in meters
  light_year: 9.461e15,    // 1 light year in meters
};

export const astronomySolve: ToolDef = {
  name: "astronomy.solve",
  description: "Solve astronomy and astrophysics problems: Kepler's three laws, orbital velocity, escape velocity, gravitational force, Schwarzschild radius (black holes), stellar luminosity (Stefan-Boltzmann), Hubble's law, redshift, orbital period, and Wien's displacement law. Use 'list' to see all.",
  inputSchema: z.object({
    formula: z.enum(["kepler_third_law", "orbital_velocity", "escape_velocity", "gravitational_force", "schwarzschild_radius", "stellar_luminosity", "hubble_law", "redshift", "orbital_period", "wiens_law", "stellar_lifetime", "list"]).describe("Formula to use (or 'list')"),
    semi_major_axis: z.number().optional().describe("Semi-major axis (m or AU)"),
    in_au: z.boolean().default(false).describe("If true, semi_major_axis is in AU"),
    mass_central: z.number().optional().describe("Mass of central body (kg)"),
    mass_orbiting: z.number().optional().describe("Mass of orbiting body (kg)"),
    mass: z.number().optional().describe("Mass (kg)"),
    radius: z.number().optional().describe("Radius (m)"),
    distance: z.number().optional().describe("Distance (m or Mpc)"),
    in_mpc: z.boolean().default(false).describe("If true, distance is in Mpc"),
    velocity: z.number().optional().describe("Velocity (m/s)"),
    temperature: z.number().optional().describe("Temperature (K)"),
    stellar_radius: z.number().optional().describe("Stellar radius (m or solar radii)"),
    in_solar_radii: z.boolean().default(false).describe("If true, stellar_radius is in solar radii"),
    observed_wavelength: z.number().optional().describe("Observed wavelength (nm)"),
    emitted_wavelength: z.number().optional().describe("Emitted wavelength (nm)"),
    mass_solar: z.number().optional().describe("Mass in solar masses"),
    luminosity_solar: z.number().optional().describe("Luminosity in solar luminosities"),
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
    const G = ASTRO_CONSTANTS.G;

    try {
      if (params.formula === "list") {
        const list = [
          "kepler_third_law: T^2 = (4*pi^2 / GM) * a^3 — Orbital period from semi-major axis",
          "orbital_velocity: v = sqrt(GM/r) — Circular orbital velocity",
          "escape_velocity: v_e = sqrt(2GM/r) — Escape velocity",
          "gravitational_force: F = G*m1*m2/r^2 — Newton's law of gravitation",
          "schwarzschild_radius: r_s = 2GM/c^2 — Black hole event horizon",
          "stellar_luminosity: L = 4*pi*R^2*sigma*T^4 — Stefan-Boltzmann luminosity",
          "hubble_law: v = H0 * d — Recession velocity from distance",
          "redshift: z = (lambda_obs - lambda_emit) / lambda_emit — Cosmological redshift",
          "orbital_period: T = 2*pi*sqrt(a^3 / GM) — Same as Kepler's third law",
          "wiens_law: lambda_max = b/T — Peak wavelength from temperature",
          "stellar_lifetime: t ~ 10^10 * (M/L) years — Main sequence lifetime",
        ].join("\n");
        return { success: true, result: list, formula: "list", steps, message: "Available astronomy formulas" };
      }

      switch (params.formula) {
        case "kepler_third_law":
        case "orbital_period": {
          if (params.semi_major_axis === undefined || params.mass_central === undefined) {
            return { success: false, result: "", formula: "T^2 = (4*pi^2/GM)*a^3", steps, message: "Provide semi_major_axis and mass_central" };
          }
          let a = params.semi_major_axis;
          if (params.in_au) a = a * ASTRO_CONSTANTS.AU;
          const M = params.mass_central;
          const T = 2 * Math.PI * Math.sqrt(a ** 3 / (G * M));
          steps.push(`Kepler's Third Law: T = 2*pi*sqrt(a^3 / GM)`);
          steps.push(`a = ${a} m, M = ${M} kg`);
          steps.push(`T = ${T} s = ${(T / 86400).toFixed(4)} days = ${(T / (365.25 * 86400)).toFixed(6)} years`);
          return { success: true, result: `${T} s`, result_value: T, formula: "T = 2*pi*sqrt(a^3/GM)", steps, message: `Orbital period = ${T} s (${(T / (365.25 * 86400)).toFixed(4)} years)` };
        }

        case "orbital_velocity": {
          if (params.mass_central === undefined || params.radius === undefined) {
            return { success: false, result: "", formula: "v = sqrt(GM/r)", steps, message: "Provide mass_central and radius (orbital radius)" };
          }
          const v = Math.sqrt((G * params.mass_central) / params.radius);
          steps.push(`Orbital Velocity: v = sqrt(GM/r)`);
          steps.push(`v = sqrt(${G} * ${params.mass_central} / ${params.radius}) = ${v} m/s`);
          steps.push(`= ${(v / 1000).toFixed(4)} km/s`);
          return { success: true, result: `${v} m/s`, result_value: v, formula: "v = sqrt(GM/r)", steps, message: `Orbital velocity = ${v} m/s (${(v / 1000).toFixed(2)} km/s)` };
        }

        case "escape_velocity": {
          if (params.mass_central === undefined || params.radius === undefined) {
            return { success: false, result: "", formula: "v_e = sqrt(2GM/r)", steps, message: "Provide mass_central and radius" };
          }
          const ve = Math.sqrt((2 * G * params.mass_central) / params.radius);
          steps.push(`Escape Velocity: v_e = sqrt(2GM/r)`);
          steps.push(`v_e = sqrt(2 * ${G} * ${params.mass_central} / ${params.radius}) = ${ve} m/s`);
          steps.push(`= ${(ve / 1000).toFixed(4)} km/s`);
          return { success: true, result: `${ve} m/s`, result_value: ve, formula: "v_e = sqrt(2GM/r)", steps, message: `Escape velocity = ${ve} m/s (${(ve / 1000).toFixed(2)} km/s)` };
        }

        case "gravitational_force": {
          if (params.mass_central === undefined || params.mass_orbiting === undefined || params.distance === undefined) {
            return { success: false, result: "", formula: "F = G*m1*m2/r^2", steps, message: "Provide mass_central (m1), mass_orbiting (m2), and distance" };
          }
          const F = (G * params.mass_central * params.mass_orbiting) / params.distance ** 2;
          steps.push(`Gravitational Force: F = G*m1*m2/r^2`);
          steps.push(`F = ${G} * ${params.mass_central} * ${params.mass_orbiting} / ${params.distance}^2 = ${F} N`);
          return { success: true, result: `${F} N`, result_value: F, formula: "F = G*m1*m2/r^2", steps, message: `Gravitational force = ${F} N` };
        }

        case "schwarzschild_radius": {
          if (params.mass === undefined) {
            return { success: false, result: "", formula: "r_s = 2GM/c^2", steps, message: "Provide mass" };
          }
          const c = ASTRO_CONSTANTS.c;
          const rs = (2 * G * params.mass) / (c ** 2);
          steps.push(`Schwarzschild Radius: r_s = 2GM/c^2`);
          steps.push(`r_s = 2 * ${G} * ${params.mass} / ${c}^2 = ${rs} m`);
          steps.push(`= ${(rs / 1000).toFixed(6)} km`);
          if (params.mass_solar !== undefined) {
            steps.push(`For ${params.mass_solar} solar masses: r_s = ${rs} m`);
          }
          steps.push(`This is the event horizon radius of a non-rotating black hole`);
          return { success: true, result: `${rs} m`, result_value: rs, formula: "r_s = 2GM/c^2", steps, message: `Schwarzschild radius = ${rs} m (${(rs / 1000).toFixed(4)} km)` };
        }

        case "stellar_luminosity": {
          if (params.stellar_radius === undefined || params.temperature === undefined) {
            return { success: false, result: "", formula: "L = 4*pi*R^2*sigma*T^4", steps, message: "Provide stellar_radius and temperature" };
          }
          let R = params.stellar_radius;
          if (params.in_solar_radii) R = R * ASTRO_CONSTANTS.R_sun;
          const sigma = ASTRO_CONSTANTS.sigma;
          const L = 4 * Math.PI * R ** 2 * sigma * params.temperature ** 4;
          const Lsolar = L / ASTRO_CONSTANTS.L_sun;
          steps.push(`Stellar Luminosity: L = 4*pi*R^2*sigma*T^4`);
          steps.push(`R = ${R} m, T = ${params.temperature} K`);
          steps.push(`L = 4*pi*${R}^2*${sigma}*${params.temperature}^4 = ${L} W`);
          steps.push(`= ${Lsolar.toFixed(6)} L_sun (solar luminosities)`);
          return { success: true, result: `${L} W`, result_value: L, formula: "L = 4*pi*R^2*sigma*T^4", steps, message: `Luminosity = ${Lsolar.toFixed(4)} L_sun` };
        }

        case "hubble_law": {
          if (params.distance === undefined) {
            return { success: false, result: "", formula: "v = H0 * d", steps, message: "Provide distance" };
          }
          let d = params.distance;
          if (params.in_mpc) {
            // distance in Mpc, H0 in km/s/Mpc
            const v = ASTRO_CONSTANTS.H0 * d;
            steps.push(`Hubble's Law: v = H0 * d`);
            steps.push(`H0 = ${ASTRO_CONSTANTS.H0} km/s/Mpc`);
            steps.push(`v = ${ASTRO_CONSTANTS.H0} * ${d} = ${v} km/s`);
            return { success: true, result: `${v} km/s`, result_value: v, formula: "v = H0*d", steps, message: `Recession velocity = ${v} km/s` };
          }
          // distance in meters
          const dMpc = d / (ASTRO_CONSTANTS.parsec * 1e6);
          const v = ASTRO_CONSTANTS.H0 * dMpc * 1000; // m/s
          steps.push(`Hubble's Law: v = H0 * d`);
          steps.push(`d = ${d} m = ${dMpc.toFixed(4)} Mpc`);
          steps.push(`v = ${ASTRO_CONSTANTS.H0} * ${dMpc.toFixed(4)} = ${(ASTRO_CONSTANTS.H0 * dMpc).toFixed(2)} km/s`);
          return { success: true, result: `${v} m/s`, result_value: v, formula: "v = H0*d", steps, message: `Recession velocity = ${(ASTRO_CONSTANTS.H0 * dMpc).toFixed(2)} km/s` };
        }

        case "redshift": {
          if (params.observed_wavelength === undefined || params.emitted_wavelength === undefined) {
            return { success: false, result: "", formula: "z = (lambda_obs - lambda_emit) / lambda_emit", steps, message: "Provide observed_wavelength and emitted_wavelength" };
          }
          const z = (params.observed_wavelength - params.emitted_wavelength) / params.emitted_wavelength;
          const v = ((z + 1) ** 2 - 1) / ((z + 1) ** 2 + 1) * ASTRO_CONSTANTS.c; // relativistic
          steps.push(`Cosmological Redshift: z = (lambda_obs - lambda_emit) / lambda_emit`);
          steps.push(`z = (${params.observed_wavelength} - ${params.emitted_wavelength}) / ${params.emitted_wavelength} = ${z.toFixed(6)}`);
          steps.push(`${z > 0 ? "Redshift (moving away)" : "Blueshift (moving toward)"}`);
          steps.push(`Recession velocity (relativistic): v = ${v.toFixed(2)} m/s = ${(v / 1000).toFixed(2)} km/s`);
          return { success: true, result: `z = ${z.toFixed(6)}`, result_value: z, formula: "z = (obs - emit)/emit", steps, message: `Redshift z = ${z.toFixed(6)}, v = ${(v / 1000).toFixed(2)} km/s` };
        }

        case "wiens_law": {
          if (params.temperature === undefined) {
            return { success: false, result: "", formula: "lambda_max = b/T", steps, message: "Provide temperature (K)" };
          }
          const b = 2.898e-3; // Wien's displacement constant (m*K)
          const lambdaMax = b / params.temperature;
          steps.push(`Wien's Displacement Law: lambda_max = b/T`);
          steps.push(`b = 2.898e-3 m*K`);
          steps.push(`lambda_max = ${b} / ${params.temperature} = ${lambdaMax} m`);
          steps.push(`= ${(lambdaMax * 1e9).toFixed(2)} nm`);
          const band = lambdaMax < 400e-9 ? "UV" : lambdaMax > 700e-9 ? "IR" : "Visible";
          steps.push(`Peak emission: ${band} band`);
          return { success: true, result: `${lambdaMax} m`, result_value: lambdaMax, formula: "lambda_max = b/T", steps, message: `Peak wavelength = ${(lambdaMax * 1e9).toFixed(2)} nm (${band})` };
        }

        case "stellar_lifetime": {
          if (params.mass_solar === undefined) {
            return { success: false, result: "", formula: "t ~ 10^10 * (M/L) years", steps, message: "Provide mass_solar (mass in solar masses)" };
          }
          // L ~ M^3.5 (main sequence mass-luminosity relation)
          const Lsolar = params.mass_solar ** 3.5;
          const t = 1e10 * (params.mass_solar / Lsolar);
          steps.push(`Stellar Main Sequence Lifetime:`);
          steps.push(`Mass-luminosity relation: L ~ M^3.5`);
          steps.push(`L = ${params.mass_solar}^3.5 = ${Lsolar.toFixed(4)} L_sun`);
          steps.push(`t ~ 10^10 * (M/L) = 10^10 * (${params.mass_solar}/${Lsolar.toFixed(4)}) = ${t.toFixed(4)} years`);
          steps.push(`= ${(t / 1e9).toFixed(4)} billion years`);
          return { success: true, result: `${t} years`, result_value: t, formula: "t ~ 10^10 * M/M^3.5", steps, message: `Lifetime ~ ${(t / 1e9).toFixed(2)} billion years` };
        }

        default:
          return { success: false, result: "", formula: "", steps, message: "Unknown formula" };
      }
    } catch (e: any) {
      return { success: false, result: "", formula: "", steps, message: e.message ?? String(e) };
    }
  },
};
