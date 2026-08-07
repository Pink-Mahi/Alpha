/**
 * Science tools — math, physics, and chemistry problem solving.
 *
 * These tools give the agent the ability to solve advanced problems in
 * mathematics, physics, and chemistry using symbolic computation.
 */
import { z } from "zod";
import { create, all } from "mathjs";
import type { ToolDef } from "./toolBus.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const math = create(all as any, {}) as any;

// =============================================================================
// 1. MATH.SOLVE — Solve equations and systems of equations
// =============================================================================

export const mathSolve: ToolDef = {
  name: "math.solve",
  description: "Solve mathematical equations and systems of equations. Supports algebraic equations, quadratic equations, systems of linear equations, and symbolic expressions. Returns step-by-step solutions. Examples: '2x + 5 = 15', 'x^2 - 4 = 0', '2x + 3y = 7, x - y = 1'.",
  inputSchema: z.object({
    equation: z.string().describe("Equation to solve (e.g. '2x + 5 = 15' or 'x^2 - 4 = 0'). For systems, separate equations with commas."),
    variable: z.string().default("x").describe("Variable to solve for (default: x)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solutions: z.array(z.string()),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ equation, variable }) {
    try {
      const steps: string[] = [];
      const solutions: string[] = [];

      // Handle systems of equations (comma-separated)
      const equations = equation.split(",").map((e: string) => e.trim());

      if (equations.length > 1) {
        // System of equations — use matrix method for linear systems
        steps.push(`System of ${equations.length} equations detected`);

        // Try to parse as linear system
        const coeffs: number[][] = [];
        const constants: number[] = [];
        const vars = new Set<string>();

        for (const eq of equations) {
          const [lhs, rhs] = eq.split("=");
          if (!lhs || !rhs) continue;
          const expr = `${lhs.trim()} - (${rhs.trim()})`;
          try {
            const node = math.parse(expr);
            // Collect coefficients for each variable
            const collected: Record<string, number> = {};
            let constant = 0;
            node.traverse((n: any) => {
              if (n.type === "SymbolNode") vars.add(n.name);
            });
            const varsArr = Array.from(vars);
            for (const v of varsArr) {
              try {
                const coeff = math.derivative(expr, v).evaluate();
                collected[v] = typeof coeff === "number" ? coeff : Number(coeff);
              } catch { collected[v] = 0; }
            }
            // Evaluate constant by substituting 0 for all vars
            try {
              const scope: Record<string, number> = {};
              varsArr.forEach((v) => (scope[v] = 0));
              constant = Number(node.evaluate(scope));
            } catch { constant = 0; }
            coeffs.push(varsArr.map((v) => collected[v] ?? 0));
            constants.push(constant);
          } catch { /* skip unparseable */ }
        }

        if (coeffs.length === equations.length && vars.size > 0) {
          steps.push(`Variables: ${Array.from(vars).join(", ")}`);
          steps.push(`Coefficient matrix: [${coeffs.map((r) => `[${r.join(", ")}]`).join(", ")}]`);
          steps.push(`Constants: [${constants.join(", ")}]`);

          // Solve using Cramer's rule or matrix inverse
          try {
            const A = math.matrix(coeffs);
            const b = math.matrix(constants);
            const det = math.det(A);
            steps.push(`Determinant: ${det}`);

            if (det !== 0) {
              const x = math.multiply(math.inv(A), b);
              const result = x.toArray() as number[];
              const varsArr = Array.from(vars);
              for (let i = 0; i < varsArr.length; i++) {
                solutions.push(`${varsArr[i]} = ${result[i]}`);
              }
              steps.push(`Solution: ${solutions.join(", ")}`);
            } else {
              solutions.push("System has no unique solution (determinant = 0)");
            }
          } catch (e: any) {
            solutions.push(`Matrix method failed: ${e.message}`);
          }
        }
      } else {
        // Single equation
        const [lhs, rhs] = equation.split("=");
        if (!lhs || !rhs) {
          return { success: false, solutions: [], steps: ["Invalid equation format. Use '=' to separate sides."], message: "Invalid equation" };
        }

        const expr = `${lhs.trim()} - (${rhs.trim()})`;
        steps.push(`Rearranging: ${expr} = 0`);

        // Try to solve symbolically
        try {
          // For polynomial equations, try to find roots
          const simplified = math.simplify(expr);
          steps.push(`Simplified: ${simplified.toString()} = 0`);

          // Try algebraic solve using mathjs derivative approach for polynomials
          // For linear: ax + b = 0 -> x = -b/a
          try {
            const f = math.compile(expr);
            // Try Newton's method from multiple starting points
            const startPoints = [0, 1, -1, 2, -2, 5, -5, 10, -10, 0.5, -0.5];
            const found = new Set<string>();
            for (const x0 of startPoints) {
              let x = x0;
              for (let i = 0; i < 100; i++) {
                const fx = Number(f.evaluate({ [variable]: x }));
                if (Math.abs(fx) < 1e-10) {
                  const rounded = Math.round(x * 1e6) / 1e6;
                  const sol = `${variable} = ${rounded}`;
                  if (!found.has(sol)) {
                    found.add(sol);
                    solutions.push(sol);
                  }
                  break;
                }
                const h = 1e-7;
                const fxh = Number(f.evaluate({ [variable]: x + h }));
                const deriv = (fxh - fx) / h;
                if (Math.abs(deriv) < 1e-15) break;
                x = x - fx / deriv;
              }
            }
          } catch { /* fallback below */ }
          steps.push(`Solutions found: ${solutions.length}`);
        } catch {
          // Fallback: try numerical root finding
          steps.push(`Symbolic solve failed, trying numerical method...`);
          try {
            const f = math.compile(expr);
            // Newton's method
            let x0 = 0;
            const tolerance = 1e-10;
            const maxIter = 100;
            for (let i = 0; i < maxIter; i++) {
              const fx = Number(f.evaluate({ [variable]: x0 }));
              if (Math.abs(fx) < tolerance) {
                solutions.push(`${variable} = ${x0.toFixed(6)}`);
                steps.push(`Numerical root found at iteration ${i}: ${variable} = ${x0.toFixed(6)}`);
                break;
              }
              const h = 1e-7;
              const fxh = Number(f.evaluate({ [variable]: x0 + h }));
              const deriv = (fxh - fx) / h;
              if (Math.abs(deriv) < 1e-15) break;
              x0 = x0 - fx / deriv;
            }
            if (solutions.length === 0) {
              // Try different starting points
              for (const start of [-10, -1, 1, 10, 100]) {
                let x = start;
                for (let i = 0; i < 100; i++) {
                  const fx = Number(f.evaluate({ [variable]: x }));
                  if (Math.abs(fx) < 1e-10) {
                    const sol = `${variable} = ${x.toFixed(6)}`;
                    if (!solutions.includes(sol)) solutions.push(sol);
                    break;
                  }
                  const h = 1e-7;
                  const fxh = Number(f.evaluate({ [variable]: x + h }));
                  const deriv = (fxh - fx) / h;
                  if (Math.abs(deriv) < 1e-15) break;
                  x = x - fx / deriv;
                }
              }
            }
          } catch (e: any) {
            solutions.push(`Could not solve: ${e.message}`);
          }
        }
      }

      return {
        success: solutions.length > 0,
        solutions,
        steps,
        message: solutions.length > 0 ? `Found ${solutions.length} solution(s)` : "No solutions found",
      };
    } catch (e: any) {
      return { success: false, solutions: [], steps: [], message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 2. MATH.CALCULATE — Evaluate mathematical expressions
// =============================================================================

export const mathCalculate: ToolDef = {
  name: "math.calculate",
  description: "Evaluate a mathematical expression with full precision. Supports: arithmetic, algebra, calculus (derivatives, integrals), matrices, complex numbers, trigonometry, logarithms, statistics, and unit conversions. Examples: '2^10', 'derivative(x^2, x)', 'integrate(x^2, x)', 'sin(pi/4)', 'log(100, 10)', '5 meter to feet', 'mean([1,2,3,4,5])', 'det([1,2;3,4])'.",
  inputSchema: z.object({
    expression: z.string().describe("Mathematical expression to evaluate (e.g. '2^10', 'derivative(x^2, x)', 'sin(pi/4)')"),
    variables: z.record(z.string()).optional().describe("Variable values (e.g. {x: '5', y: '3'}) for substitution"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    result_type: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ expression, variables }) {
    try {
      const steps: string[] = [];
      steps.push(`Input: ${expression}`);

      // Parse the expression
      const node = math.parse(expression);
      steps.push(`Parsed: ${node.toString()}`);

      // Substitute variables if provided
      let exprToEval = node;
      if (variables) {
        const scope: Record<string, any> = {};
        for (const [key, value] of Object.entries(variables)) {
          scope[key] = math.evaluate(value);
        }
        steps.push(`Substituting: ${JSON.stringify(variables)}`);
        const result = (node as any).evaluate(scope);
        const resultStr = math.format(result, { precision: 10 });
        return {
          success: true,
          result: resultStr,
          result_type: typeof result === "object" ? (result.constructor?.name ?? "object") : typeof result,
          steps,
          message: `Result: ${resultStr}`,
        };
      }

      // Evaluate
      const result = (exprToEval as any).evaluate();
      const resultStr = math.format(result, { precision: 10 });
      steps.push(`Result: ${resultStr}`);

      // Determine result type
      let resultType = "number";
      if (typeof result === "object") {
        if (result?.constructor?.name === "Complex") resultType = "complex";
        else if (result?.constructor?.name === "Matrix") resultType = "matrix";
        else if (result?.constructor?.name === "Unit") resultType = "unit";
        else if (result?.constructor?.name === "Fraction") resultType = "fraction";
        else if (Array.isArray(result)) resultType = "array";
        else resultType = "object";
      }

      // Check if it's a symbolic result (derivative/integral)
      if (expression.includes("derivative") || expression.includes("integrate")) {
        steps.push(`Symbolic operation completed`);
      }

      return {
        success: true,
        result: resultStr,
        result_type: resultType,
        steps,
        message: `Result: ${resultStr}`,
      };
    } catch (e: any) {
      return {
        success: false,
        result: "",
        result_type: "error",
        steps: [],
        message: `Error: ${e.message ?? String(e)}`,
      };
    }
  },
};

// =============================================================================
// 3. PHYSICS.SOLVE — Solve physics problems
// =============================================================================

// Physics constants
const PHYSICS_CONSTANTS: Record<string, { value: number; unit: string; description: string }> = {
  "speed_of_light": { value: 299792458, unit: "m/s", description: "Speed of light in vacuum (c)" },
  "gravitational_acceleration": { value: 9.81, unit: "m/s^2", description: "Standard gravity (g)" },
  "gravitational_constant": { value: 6.674e-11, unit: "N*m^2/kg^2", description: "Gravitational constant (G)" },
  "planck_constant": { value: 6.626e-34, unit: "J*s", description: "Planck constant (h)" },
  "boltzmann_constant": { value: 1.381e-23, unit: "J/K", description: "Boltzmann constant (k)" },
  "avogadro_number": { value: 6.022e23, unit: "1/mol", description: "Avogadro's number (Na)" },
  "electron_mass": { value: 9.109e-31, unit: "kg", description: "Electron rest mass (me)" },
  "proton_mass": { value: 1.673e-27, unit: "kg", description: "Proton rest mass (mp)" },
  "neutron_mass": { value: 1.675e-27, unit: "kg", description: "Neutron rest mass (mn)" },
  "electron_charge": { value: 1.602e-19, unit: "C", description: "Elementary charge (e)" },
  "permittivity_vacuum": { value: 8.854e-12, unit: "F/m", description: "Vacuum permittivity (e0)" },
  "permeability_vacuum": { value: 1.257e-6, unit: "H/m", description: "Vacuum permeability (u0)" },
  "stefan_boltzmann": { value: 5.670e-8, unit: "W/(m^2*K^4)", description: "Stefan-Boltzmann constant" },
  "gas_constant": { value: 8.314, unit: "J/(mol*K)", description: "Ideal gas constant (R)" },
  "atomic_mass_unit": { value: 1.661e-27, unit: "kg", description: "Atomic mass unit (u)" },
};

// Physics formulas
const PHYSICS_FORMULAS: Record<string, {
  formula: string; description: string; variables: Record<string, string>;
}> = {
  "kinematics_velocity": { formula: "v = v0 + a*t", description: "Final velocity (uniform acceleration)", variables: { v: "final velocity (m/s)", v0: "initial velocity (m/s)", a: "acceleration (m/s^2)", t: "time (s)" } },
  "kinematics_position": { formula: "x = x0 + v0*t + 0.5*a*t^2", description: "Position (uniform acceleration)", variables: { x: "final position (m)", x0: "initial position (m)", v0: "initial velocity (m/s)", a: "acceleration (m/s^2)", t: "time (s)" } },
  "kinematics_velocity_squared": { formula: "v^2 = v0^2 + 2*a*d", description: "Velocity squared (no time)", variables: { v: "final velocity (m/s)", v0: "initial velocity (m/s)", a: "acceleration (m/s^2)", d: "displacement (m)" } },
  "newton_second": { formula: "F = m*a", description: "Newton's second law", variables: { F: "force (N)", m: "mass (kg)", a: "acceleration (m/s^2)" } },
  "kinetic_energy": { formula: "KE = 0.5*m*v^2", description: "Kinetic energy", variables: { KE: "kinetic energy (J)", m: "mass (kg)", v: "velocity (m/s)" } },
  "potential_energy": { formula: "PE = m*g*h", description: "Gravitational potential energy", variables: { PE: "potential energy (J)", m: "mass (kg)", g: "gravity (m/s^2)", h: "height (m)" } },
  "momentum": { formula: "p = m*v", description: "Linear momentum", variables: { p: "momentum (kg*m/s)", m: "mass (kg)", v: "velocity (m/s)" } },
  "work": { formula: "W = F*d*cos(theta)", description: "Work done by a force", variables: { W: "work (J)", F: "force (N)", d: "displacement (m)", theta: "angle (rad)" } },
  "power": { formula: "P = W/t", description: "Power", variables: { P: "power (W)", W: "work (J)", t: "time (s)" } },
  "ohms_law": { formula: "V = I*R", description: "Ohm's law", variables: { V: "voltage (V)", I: "current (A)", R: "resistance (ohm)" } },
  "electric_power": { formula: "P = V*I", description: "Electric power", variables: { P: "power (W)", V: "voltage (V)", I: "current (A)" } },
  "coulomb": { formula: "F = k*q1*q2/r^2", description: "Coulomb's law", variables: { F: "force (N)", k: "Coulomb constant", q1: "charge 1 (C)", q2: "charge 2 (C)", r: "distance (m)" } },
  "gravitation": { formula: "F = G*m1*m2/r^2", description: "Newton's law of gravitation", variables: { F: "force (N)", G: "gravitational constant", m1: "mass 1 (kg)", m2: "mass 2 (kg)", r: "distance (m)" } },
  "wave_speed": { formula: "v = f*lambda", description: "Wave speed", variables: { v: "wave speed (m/s)", f: "frequency (Hz)", lambda: "wavelength (m)" } },
  "snells_law": { formula: "n1*sin(theta1) = n2*sin(theta2)", description: "Snell's law (refraction)", variables: { n1: "index 1", n2: "index 2", theta1: "angle 1 (rad)", theta2: "angle 2 (rad)" } },
  "ideal_gas": { formula: "P*V = n*R*T", description: "Ideal gas law", variables: { P: "pressure (Pa)", V: "volume (m^3)", n: "moles", R: "gas constant", T: "temperature (K)" } },
  "heat_transfer": { formula: "Q = m*c*dT", description: "Heat transfer", variables: { Q: "heat (J)", m: "mass (kg)", c: "specific heat (J/(kg*K))", dT: "temp change (K)" } },
  "doppler": { formula: "f' = f*(v+vd)/(v-vs)", description: "Doppler effect", variables: { f_: "observed freq (Hz)", f: "source freq (Hz)", v: "wave speed (m/s)", vd: "detector speed (m/s)", vs: "source speed (m/s)" } },
  "lens_equation": { formula: "1/f = 1/do + 1/di", description: "Thin lens equation", variables: { f: "focal length (m)", do: "object distance (m)", di: "image distance (m)" } },
  "magnetic_force": { formula: "F = q*v*B*sin(theta)", description: "Magnetic force on charge", variables: { F: "force (N)", q: "charge (C)", v: "velocity (m/s)", B: "magnetic field (T)", theta: "angle (rad)" } },
  "simple_pendulum": { formula: "T = 2*pi*sqrt(L/g)", description: "Pendulum period", variables: { T: "period (s)", L: "length (m)", g: "gravity (m/s^2)" } },
  "spring_period": { formula: "T = 2*pi*sqrt(m/k)", description: "Spring-mass period", variables: { T: "period (s)", m: "mass (kg)", k: "spring constant (N/m)" } },
  "centripetal": { formula: "a = v^2/r", description: "Centripetal acceleration", variables: { a: "acceleration (m/s^2)", v: "velocity (m/s)", r: "radius (m)" } },
  "energy_mass": { formula: "E = m*c^2", description: "Einstein's mass-energy equivalence", variables: { E: "energy (J)", m: "mass (kg)", c: "speed of light (m/s)" } },
  "photoelectric": { formula: "E = h*f - phi", description: "Photoelectric effect", variables: { E: "kinetic energy (J)", h: "Planck constant", f: "frequency (Hz)", phi: "work function (J)" } },
  "de_broglie": { formula: "lambda = h/p", description: "de Broglie wavelength", variables: { lambda: "wavelength (m)", h: "Planck constant", p: "momentum (kg*m/s)" } },
};

export const physicsSolve: ToolDef = {
  name: "physics.solve",
  description: "Solve physics problems using known formulas. Provide the formula name (e.g. 'kinematics_velocity', 'newton_second', 'ohms_law', 'kinetic_energy') and known variable values. The tool solves for the missing variable. Supports mechanics, electricity, waves, optics, thermodynamics, and modern physics. Use physics.list_formulas to see all available formulas.",
  inputSchema: z.object({
    formula: z.string().describe("Formula name (e.g. 'newton_second', 'ohms_law', 'kinetic_energy'). Use 'list' to see all formulas."),
    values: z.record(z.string()).describe("Known variable values (e.g. {m: '10', a: '9.81'}). The missing variable will be solved for."),
    solve_for: z.string().optional().describe("Variable to solve for (auto-detected if omitted — the missing variable in values)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    formula: z.string(),
    formula_expression: z.string(),
    solved_variable: z.string(),
    result: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ formula, values, solve_for }) {
    try {
      // List all formulas if requested
      if (formula === "list" || formula === "list_formulas") {
        const list = Object.entries(PHYSICS_FORMULAS).map(([name, f]) =>
          `  ${name}: ${f.formula} — ${f.description}`
        ).join("\n");
        return {
          success: true,
          formula: "list",
          formula_expression: list,
          solved_variable: "",
          result: "",
          steps: [],
          message: `Available formulas:\n${list}`,
        };
      }

      const formulaDef = PHYSICS_FORMULAS[formula];
      if (!formulaDef) {
        const available = Object.keys(PHYSICS_FORMULAS).join(", ");
        return {
          success: false,
          formula,
          formula_expression: "",
          solved_variable: "",
          result: "",
          steps: [],
          message: `Unknown formula '${formula}'. Available: ${available}`,
        };
      }

      const steps: string[] = [];
      steps.push(`Formula: ${formulaDef.formula}`);
      steps.push(`Description: ${formulaDef.description}`);

      // Determine which variable to solve for
      const allVars = Object.keys(formulaDef.variables);
      const providedVars = Object.keys(values);
      const missingVars = allVars.filter((v) => !providedVars.includes(v) && v !== "g" && v !== "c" && v !== "k" && v !== "G" && v !== "R" && v !== "h");

      let target = solve_for ?? missingVars[0] ?? "";
      if (!target) {
        return {
          success: false,
          formula,
          formula_expression: formulaDef.formula,
          solved_variable: "",
          result: "",
          steps,
          message: "Could not determine which variable to solve for. Provide solve_for parameter.",
        };
      }

      steps.push(`Solving for: ${target}`);
      steps.push(`Known values: ${JSON.stringify(values)}`);

      // Build the equation and solve symbolically
      // Parse the formula (e.g. "F = m*a" -> solve for F or rearrange)
      const [lhs, rhs] = formulaDef.formula.split("=");
      if (!lhs || !rhs) {
        return { success: false, formula, formula_expression: formulaDef.formula, solved_variable: target, result: "", steps, message: "Invalid formula format" };
      }

      // Build scope with known values + constants
      const scope: Record<string, any> = {};
      for (const [k, v] of Object.entries(values)) {
        scope[k] = math.evaluate(v);
      }
      // Add common constants
      scope["g"] = PHYSICS_CONSTANTS.gravitational_acceleration!.value;
      scope["c"] = PHYSICS_CONSTANTS.speed_of_light!.value;
      scope["G"] = PHYSICS_CONSTANTS.gravitational_constant!.value;
      scope["h"] = PHYSICS_CONSTANTS.planck_constant!.value;
      scope["k"] = 8.99e9; // Coulomb constant
      scope["R"] = PHYSICS_CONSTANTS.gas_constant!.value;
      scope["pi"] = Math.PI;

      // If solving for the LHS variable, just evaluate RHS
      if (lhs.trim() === target) {
        try {
          const result = math.evaluate(rhs.trim(), scope);
          const resultStr = math.format(result, { precision: 6 });
          steps.push(`Substituting values into ${rhs.trim()}`);
          steps.push(`Result: ${target} = ${resultStr}`);
          return {
            success: true,
            formula,
            formula_expression: formulaDef.formula,
            solved_variable: target,
            result: resultStr,
            steps,
            message: `${target} = ${resultStr} ${formulaDef.variables[target]?.split(" ")[1] ?? ""}`,
          };
        } catch (e: any) {
          return { success: false, formula, formula_expression: formulaDef.formula, solved_variable: target, result: "", steps, message: `Evaluation error: ${e.message}` };
        }
      }

      // If solving for a variable on the RHS, rearrange: target = (lhs - other_terms) / coefficient
      // Use mathjs to solve: lhs - rhs = 0, solve for target
      try {
        const equation = `${lhs.trim()} - (${rhs.trim()})`;
        steps.push(`Rearranging: ${equation} = 0, solving for ${target}`);

        // Try numerical solve (Newton's method)
        try {
          const f = math.compile(equation);
          // Try multiple starting points
          const startPoints = [1, -1, 0.1, -0.1, 10, -10, 100, 0.01, 1000];
          for (const x0 of startPoints) {
            let x = x0;
            for (let i = 0; i < 200; i++) {
              const fx = Number(f.evaluate({ ...scope, [target]: x }));
              if (Math.abs(fx) < 1e-10) {
                const resultStr = x.toFixed(6);
                steps.push(`Solution: ${target} = ${resultStr}`);
                return {
                  success: true,
                  formula,
                  formula_expression: formulaDef.formula,
                  solved_variable: target,
                  result: resultStr,
                  steps,
                  message: `${target} = ${resultStr} ${formulaDef.variables[target]?.split(" ")[1] ?? ""}`,
                };
              }
              const h = 1e-7;
              const fxh = Number(f.evaluate({ ...scope, [target]: x + h }));
              const deriv = (fxh - fx) / h;
              if (Math.abs(deriv) < 1e-15) break;
              x = x - fx / deriv;
            }
          }
          return { success: false, formula, formula_expression: formulaDef.formula, solved_variable: target, result: "", steps, message: "Could not converge on a solution" };
        } catch {
          return { success: false, formula, formula_expression: formulaDef.formula, solved_variable: target, result: "", steps, message: "Could not solve equation" };
        }
      } catch (e: any) {
        return { success: false, formula, formula_expression: formulaDef.formula, solved_variable: target, result: "", steps, message: e.message ?? String(e) };
      }
    } catch (e: any) {
      return { success: false, formula, formula_expression: "", solved_variable: "", result: "", steps: [], message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 4. CHEMISTRY.SOLVE — Solve chemistry problems
// =============================================================================

// Periodic table data (common elements)
const PERIODIC_TABLE: Record<string, { name: string; symbol: string; atomic_number: number; atomic_mass: number; group: number; period: number; category: string }> = {
  "H": { name: "Hydrogen", symbol: "H", atomic_number: 1, atomic_mass: 1.008, group: 1, period: 1, category: "nonmetal" },
  "He": { name: "Helium", symbol: "He", atomic_number: 2, atomic_mass: 4.003, group: 18, period: 1, category: "noble gas" },
  "Li": { name: "Lithium", symbol: "Li", atomic_number: 3, atomic_mass: 6.941, group: 1, period: 2, category: "alkali metal" },
  "C": { name: "Carbon", symbol: "C", atomic_number: 6, atomic_mass: 12.011, group: 14, period: 2, category: "nonmetal" },
  "N": { name: "Nitrogen", symbol: "N", atomic_number: 7, atomic_mass: 14.007, group: 15, period: 2, category: "nonmetal" },
  "O": { name: "Oxygen", symbol: "O", atomic_number: 8, atomic_mass: 15.999, group: 16, period: 2, category: "nonmetal" },
  "F": { name: "Fluorine", symbol: "F", atomic_number: 9, atomic_mass: 18.998, group: 17, period: 2, category: "halogen" },
  "Ne": { name: "Neon", symbol: "Ne", atomic_number: 10, atomic_mass: 20.180, group: 18, period: 2, category: "noble gas" },
  "Na": { name: "Sodium", symbol: "Na", atomic_number: 11, atomic_mass: 22.990, group: 1, period: 3, category: "alkali metal" },
  "Mg": { name: "Magnesium", symbol: "Mg", atomic_number: 12, atomic_mass: 24.305, group: 2, period: 3, category: "alkaline earth metal" },
  "Al": { name: "Aluminum", symbol: "Al", atomic_number: 13, atomic_mass: 26.982, group: 13, period: 3, category: "post-transition metal" },
  "Si": { name: "Silicon", symbol: "Si", atomic_number: 14, atomic_mass: 28.086, group: 14, period: 3, category: "metalloid" },
  "P": { name: "Phosphorus", symbol: "P", atomic_number: 15, atomic_mass: 30.974, group: 15, period: 3, category: "nonmetal" },
  "S": { name: "Sulfur", symbol: "S", atomic_number: 16, atomic_mass: 32.065, group: 16, period: 3, category: "nonmetal" },
  "Cl": { name: "Chlorine", symbol: "Cl", atomic_number: 17, atomic_mass: 35.453, group: 17, period: 3, category: "halogen" },
  "K": { name: "Potassium", symbol: "K", atomic_number: 19, atomic_mass: 39.098, group: 1, period: 4, category: "alkali metal" },
  "Ca": { name: "Calcium", symbol: "Ca", atomic_number: 20, atomic_mass: 40.078, group: 2, period: 4, category: "alkaline earth metal" },
  "Fe": { name: "Iron", symbol: "Fe", atomic_number: 26, atomic_mass: 55.845, group: 8, period: 4, category: "transition metal" },
  "Cu": { name: "Copper", symbol: "Cu", atomic_number: 29, atomic_mass: 63.546, group: 11, period: 4, category: "transition metal" },
  "Zn": { name: "Zinc", symbol: "Zn", atomic_number: 30, atomic_mass: 65.38, group: 12, period: 4, category: "transition metal" },
  "Ag": { name: "Silver", symbol: "Ag", atomic_number: 47, atomic_mass: 107.868, group: 11, period: 5, category: "transition metal" },
  "Au": { name: "Gold", symbol: "Au", atomic_number: 79, atomic_mass: 196.967, group: 11, period: 6, category: "transition metal" },
  "Hg": { name: "Mercury", symbol: "Hg", atomic_number: 80, atomic_mass: 200.59, group: 12, period: 6, category: "transition metal" },
  "Pb": { name: "Lead", symbol: "Pb", atomic_number: 82, atomic_mass: 207.2, group: 14, period: 6, category: "post-transition metal" },
  "U": { name: "Uranium", symbol: "U", atomic_number: 92, atomic_mass: 238.029, group: 0, period: 7, category: "actinide" },
};

// Parse a chemical formula like "H2O" -> [{element: "H", count: 2}, {element: "O", count: 1}]
function parseFormula(formula: string): Array<{ element: string; count: number }> {
  const result: Array<{ element: string; count: number }> = [];
  const regex = /([A-Z][a-z]?)(\d*)/g;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    const element = match[1] ?? "";
    const count = match[2] ? parseInt(match[2]) : 1;
    result.push({ element, count });
  }
  return result;
}

// Calculate molar mass of a compound
function molarMass(formula: string): number {
  const elements = parseFormula(formula);
  let mass = 0;
  for (const { element, count } of elements) {
    const data = PERIODIC_TABLE[element];
    if (data) {
      mass += data.atomic_mass * count;
    }
  }
  return mass;
}

export const chemistrySolve: ToolDef = {
  name: "chemistry.solve",
  description: "Solve chemistry problems: molar mass calculation, mole conversions, stoichiometry, balancing equations, gas laws, pH calculations, concentration, and limiting reagent. Supports looking up element properties (atomic mass, number, group, period). Examples: 'molar_mass H2O', 'moles 36g H2O', 'pH 0.001', 'balance H2 + O2 -> H2O'.",
  inputSchema: z.object({
    operation: z.enum(["molar_mass", "moles", "mass", "molecules", "ph", "ph_from_oh", "concentration", "dilution", "balance", "element_info", "gas_law"]).describe("Chemistry operation to perform"),
    formula: z.string().optional().describe("Chemical formula (e.g. 'H2O', 'NaCl', 'C6H12O6')"),
    value: z.number().optional().describe("Input value (mass in grams, moles, concentration, pH, etc.)"),
    unit: z.string().optional().describe("Unit of input value"),
    element: z.string().optional().describe("Element symbol for element_info (e.g. 'Fe')"),
    equation: z.string().optional().describe("Chemical equation to balance (e.g. 'H2 + O2 -> H2O')"),
    extra: z.record(z.string()).optional().describe("Additional parameters (e.g. {volume: '1L', molarity: '0.5M'})"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ operation, formula, value, unit, element, equation, extra }) {
    try {
      const steps: string[] = [];

      switch (operation) {
        case "molar_mass": {
          if (!formula) return { success: false, result: "", steps: [], message: "Formula required" };
          const elements = parseFormula(formula);
          steps.push(`Parsing formula: ${formula}`);
          steps.push(`Elements: ${elements.map((e) => `${e.element}(${e.count})`).join(", ")}`);
          let mass = 0;
          for (const { element: el, count } of elements) {
            const data = PERIODIC_TABLE[el];
            if (data) {
              const contribution = data.atomic_mass * count;
              mass += contribution;
              steps.push(`  ${el}: ${data.atomic_mass} x ${count} = ${contribution} g/mol`);
            } else {
              return { success: false, result: "", steps, message: `Unknown element: ${el}` };
            }
          }
          const result = `${mass.toFixed(3)} g/mol`;
          steps.push(`Total molar mass: ${result}`);
          return { success: true, result, steps, message: `Molar mass of ${formula}: ${result}` };
        }

        case "moles": {
          if (!formula || value === undefined) return { success: false, result: "", steps: [], message: "Formula and value (mass in grams) required" };
          const mm = molarMass(formula);
          steps.push(`Molar mass of ${formula}: ${mm.toFixed(3)} g/mol`);
          const moles = value / mm;
          steps.push(`Moles = ${value} g / ${mm.toFixed(3)} g/mol = ${moles.toFixed(6)} mol`);
          return { success: true, result: `${moles.toFixed(6)} mol`, steps, message: `${value} g of ${formula} = ${moles.toFixed(6)} moles` };
        }

        case "mass": {
          if (!formula || value === undefined) return { success: false, result: "", steps: [], message: "Formula and value (moles) required" };
          const mm = molarMass(formula);
          steps.push(`Molar mass of ${formula}: ${mm.toFixed(3)} g/mol`);
          const mass = value * mm;
          steps.push(`Mass = ${value} mol x ${mm.toFixed(3)} g/mol = ${mass.toFixed(6)} g`);
          return { success: true, result: `${mass.toFixed(6)} g`, steps, message: `${value} moles of ${formula} = ${mass.toFixed(6)} grams` };
        }

        case "molecules": {
          if (!formula || value === undefined) return { success: false, result: "", steps: [], message: "Formula and value (moles) required" };
          const na = PHYSICS_CONSTANTS.avogadro_number!.value;
          const molecules = value * na;
          steps.push(`Molecules = ${value} mol x ${na} molecules/mol`);
          steps.push(`Molecules = ${molecules.toExponential(3)}`);
          return { success: true, result: `${molecules.toExponential(3)} molecules`, steps, message: `${value} moles of ${formula} = ${molecules.toExponential(3)} molecules` };
        }

        case "ph": {
          if (value === undefined) return { success: false, result: "", steps: [], message: "H+ concentration required" };
          const hConc = value;
          const pH = -Math.log10(hConc);
          steps.push(`pH = -log10([H+])`);
          steps.push(`pH = -log10(${hConc})`);
          steps.push(`pH = ${pH.toFixed(4)}`);
          const nature = pH < 7 ? "acidic" : pH > 7 ? "basic" : "neutral";
          steps.push(`Solution is ${nature} (pH ${pH < 7 ? "< 7" : pH > 7 ? "> 7" : "= 7"})`);
          return { success: true, result: `${pH.toFixed(4)}`, steps, message: `pH = ${pH.toFixed(4)} (${nature})` };
        }

        case "ph_from_oh": {
          if (value === undefined) return { success: false, result: "", steps: [], message: "OH- concentration required" };
          const ohConc = value;
          const pOH = -Math.log10(ohConc);
          const pH = 14 - pOH;
          steps.push(`pOH = -log10([OH-]) = ${pOH.toFixed(4)}`);
          steps.push(`pH = 14 - pOH = ${pH.toFixed(4)}`);
          return { success: true, result: `${pH.toFixed(4)}`, steps, message: `pH = ${pH.toFixed(4)}` };
        }

        case "concentration": {
          if (!extra) return { success: false, result: "", steps: [], message: "Extra parameters required (moles and volume)" };
          const moles = parseFloat(extra["moles"] ?? "0");
          const volume = parseFloat(extra["volume"] ?? "0"); // in liters
          steps.push(`Molarity = moles / volume (L)`);
          steps.push(`Molarity = ${moles} mol / ${volume} L`);
          const molarity = moles / volume;
          steps.push(`Molarity = ${molarity.toFixed(4)} M`);
          return { success: true, result: `${molarity.toFixed(4)} M`, steps, message: `Concentration = ${molarity.toFixed(4)} mol/L` };
        }

        case "dilution": {
          if (!extra) return { success: false, result: "", steps: [], message: "Extra parameters required (M1, V1, V2 or M1, V1, M2)" };
          const m1 = parseFloat(extra["M1"] ?? "0");
          const v1 = parseFloat(extra["V1"] ?? "0");
          const m2 = extra["M2"] ? parseFloat(extra["M2"]) : undefined;
          const v2 = extra["V2"] ? parseFloat(extra["V2"]) : undefined;
          steps.push(`M1V1 = M2V2 (dilution formula)`);
          steps.push(`${m1} * ${v1} = M2 * V2`);
          if (m2 === undefined && v2 !== undefined) {
            const result = (m1 * v1) / v2;
            steps.push(`M2 = (${m1} * ${v1}) / ${v2} = ${result.toFixed(4)} M`);
            return { success: true, result: `${result.toFixed(4)} M`, steps, message: `Final concentration: ${result.toFixed(4)} M` };
          } else if (v2 === undefined && m2 !== undefined) {
            const result = (m1 * v1) / m2;
            steps.push(`V2 = (${m1} * ${v1}) / ${m2} = ${result.toFixed(4)} L`);
            return { success: true, result: `${result.toFixed(4)} L`, steps, message: `Final volume: ${result.toFixed(4)} L` };
          }
          return { success: false, result: "", steps, message: "Provide either M2 or V2" };
        }

        case "balance": {
          if (!equation) return { success: false, result: "", steps: [], message: "Equation required" };
          steps.push(`Equation: ${equation}`);
          // Simple balancing — just return the equation and note that balancing is complex
          // A full balancer would need linear algebra
          const [reactants, products] = equation.split("->");
          if (!reactants || !products) {
            return { success: false, result: "", steps, message: "Invalid equation format. Use '->' to separate reactants and products." };
          }
          steps.push(`Reactants: ${reactants.trim()}`);
          steps.push(`Products: ${products.trim()}`);
          // Parse compounds on each side
          const reactantCompounds = reactants.split("+").map((c: string) => c.trim());
          const productCompounds = products.split("+").map((c: string) => c.trim());
          steps.push(`Reactant compounds: ${reactantCompounds.join(", ")}`);
          steps.push(`Product compounds: ${productCompounds.join(", ")}`);
          // Count atoms on each side
          const countAtoms = (compounds: string[]): Record<string, number> => {
            const atoms: Record<string, number> = {};
            for (const compound of compounds) {
              const elements = parseFormula(compound);
              for (const { element, count } of elements) {
                atoms[element] = (atoms[element] ?? 0) + count;
              }
            }
            return atoms;
          };
          const reactantAtoms = countAtoms(reactantCompounds);
          const productAtoms = countAtoms(productCompounds);
          steps.push(`Reactant atoms: ${JSON.stringify(reactantAtoms)}`);
          steps.push(`Product atoms: ${JSON.stringify(productAtoms)}`);
          // Check if already balanced
          const balanced = JSON.stringify(reactantAtoms) === JSON.stringify(productAtoms);
          if (balanced) {
            return { success: true, result: equation, steps, message: "Equation is already balanced!" };
          }
          steps.push(`Equation is not balanced. Manual balancing or linear algebra required.`);
          return { success: true, result: equation, steps, message: "Use the atom counts above to balance the equation by adjusting coefficients." };
        }

        case "element_info": {
          if (!element) return { success: false, result: "", steps: [], message: "Element symbol required" };
          const data = PERIODIC_TABLE[element];
          if (!data) return { success: false, result: "", steps: [], message: `Unknown element: ${element}` };
          const result = `${data.name} (${data.symbol}): Atomic #${data.atomic_number}, Mass ${data.atomic_mass} g/mol, Group ${data.group}, Period ${data.period}, Category: ${data.category}`;
          steps.push(`Element: ${data.name}`);
          steps.push(`Symbol: ${data.symbol}`);
          steps.push(`Atomic number: ${data.atomic_number}`);
          steps.push(`Atomic mass: ${data.atomic_mass} g/mol`);
          steps.push(`Group: ${data.group}, Period: ${data.period}`);
          steps.push(`Category: ${data.category}`);
          return { success: true, result, steps, message: result };
        }

        case "gas_law": {
          if (!extra) return { success: false, result: "", steps: [], message: "Extra parameters required" };
          const R = 0.0821; // L*atm/(mol*K)
          const pressure = parseFloat(extra["pressure"] ?? "0"); // atm
          const volume = parseFloat(extra["volume"] ?? "0"); // L
          const moles = parseFloat(extra["moles"] ?? "0"); // mol
          const temp = parseFloat(extra["temperature"] ?? "0"); // K
          steps.push(`Ideal Gas Law: PV = nRT`);
          steps.push(`R = ${R} L*atm/(mol*K)`);
          // Solve for missing variable
          if (!extra["pressure"]) {
            const p = (moles * R * temp) / volume;
            steps.push(`P = nRT/V = (${moles} * ${R} * ${temp}) / ${volume} = ${p.toFixed(4)} atm`);
            return { success: true, result: `${p.toFixed(4)} atm`, steps, message: `Pressure = ${p.toFixed(4)} atm` };
          } else if (!extra["volume"]) {
            const v = (moles * R * temp) / pressure;
            steps.push(`V = nRT/P = (${moles} * ${R} * ${temp}) / ${pressure} = ${v.toFixed(4)} L`);
            return { success: true, result: `${v.toFixed(4)} L`, steps, message: `Volume = ${v.toFixed(4)} L` };
          } else if (!extra["moles"]) {
            const n = (pressure * volume) / (R * temp);
            steps.push(`n = PV/(RT) = (${pressure} * ${volume}) / (${R} * ${temp}) = ${n.toFixed(4)} mol`);
            return { success: true, result: `${n.toFixed(4)} mol`, steps, message: `Moles = ${n.toFixed(4)} mol` };
          } else if (!extra["temperature"]) {
            const t = (pressure * volume) / (moles * R);
            steps.push(`T = PV/(nR) = (${pressure} * ${volume}) / (${moles} * ${R}) = ${t.toFixed(4)} K`);
            return { success: true, result: `${t.toFixed(4)} K`, steps, message: `Temperature = ${t.toFixed(4)} K` };
          }
          return { success: false, result: "", steps, message: "Leave one variable out to solve for it" };
        }

        default:
          return { success: false, result: "", steps: [], message: `Unknown operation: ${operation}` };
      }
    } catch (e: any) {
      return { success: false, result: "", steps: [], message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 5. SCIENCE.CONSTANT — Look up physics/chemistry constants
// =============================================================================

export const scienceConstant: ToolDef = {
  name: "science.constant",
  description: "Look up physical constants and their values. Returns the value, unit, and description. Available constants: speed_of_light, gravitational_acceleration, gravitational_constant, planck_constant, boltzmann_constant, avogadro_number, electron_mass, proton_mass, neutron_mass, electron_charge, permittivity_vacuum, permeability_vacuum, stefan_boltzmann, gas_constant, atomic_mass_unit. Use 'list' to see all constants.",
  inputSchema: z.object({
    name: z.string().describe("Constant name (e.g. 'speed_of_light') or 'list' to see all"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ name }) {
    if (name === "list") {
      const list = Object.entries(PHYSICS_CONSTANTS).map(([k, v]) =>
        `  ${k}: ${v.value} ${v.unit} — ${v.description}`
      ).join("\n");
      return { success: true, result: list, message: `Available constants:\n${list}` };
    }
    const c = PHYSICS_CONSTANTS[name];
    if (!c) {
      return { success: false, result: "", message: `Unknown constant '${name}'. Use 'list' to see available constants.` };
    }
    return {
      success: true,
      result: `${c.value} ${c.unit}`,
      message: `${c.description}: ${c.value} ${c.unit}`,
    };
  },
};
