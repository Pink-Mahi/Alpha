/**
 * Geography & Maps tools — geocoding, distance calculations,
 * timezone lookups, and coordinate conversions.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// GEO DISTANCE — Haversine, bearing, midpoint
// =============================================================================

export const geoDistance: ToolDef = {
  name: "geo.distance",
  description: "Calculate geographic distances and positions: Haversine distance between two lat/lon points, initial bearing (compass direction), midpoint between two coordinates, destination point given start/bearing/distance, and coordinate format conversion (decimal to DMS). All distances in km or miles.",
  inputSchema: z.object({
    operation: z.enum(["haversine", "bearing", "midpoint", "destination", "dms_convert", "list"]).describe("Geographic operation"),
    lat1: z.number().optional().describe("Latitude of point 1 (decimal degrees)"),
    lon1: z.number().optional().describe("Longitude of point 1 (decimal degrees)"),
    lat2: z.number().optional().describe("Latitude of point 2 (decimal degrees)"),
    lon2: z.number().optional().describe("Longitude of point 2 (decimal degrees)"),
    bearing_deg: z.number().optional().describe("Bearing in degrees (for destination)"),
    distance_km: z.number().optional().describe("Distance in km (for destination)"),
    lat: z.number().optional().describe("Latitude (for DMS conversion)"),
    lon: z.number().optional().describe("Longitude (for DMS conversion)"),
    unit: z.enum(["km", "miles"]).default("km").describe("Distance unit"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    result_value: z.number().optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];
    const R = 6371; // Earth radius in km

    try {
      if (params.operation === "list") {
        return {
          success: true,
          result: "Operations: haversine, bearing, midpoint, destination, dms_convert",
          steps,
          message: "Available geographic operations",
        };
      }

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const toDeg = (rad: number) => (rad * 180) / Math.PI;

      switch (params.operation) {
        case "haversine": {
          if (params.lat1 === undefined || params.lon1 === undefined || params.lat2 === undefined || params.lon2 === undefined) {
            return { success: false, result: "", steps, message: "Provide lat1, lon1, lat2, lon2" };
          }
          const dLat = toRad(params.lat2 - params.lat1);
          const dLon = toRad(params.lon2 - params.lon1);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(params.lat1)) * Math.cos(toRad(params.lat2)) * Math.sin(dLon / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distKm = R * c;
          const distMiles = distKm * 0.621371;
          steps.push(`Haversine Distance:`);
          steps.push(`  Point 1: ${params.lat1}, ${params.lon1}`);
          steps.push(`  Point 2: ${params.lat2}, ${params.lon2}`);
          steps.push(`  Distance: ${distKm.toFixed(4)} km (${distMiles.toFixed(4)} miles)`);
          const result = params.unit === "miles" ? `${distMiles.toFixed(4)} miles` : `${distKm.toFixed(4)} km`;
          return { success: true, result, result_value: params.unit === "miles" ? distMiles : distKm, steps, message: `Distance = ${result}` };
        }

        case "bearing": {
          if (params.lat1 === undefined || params.lon1 === undefined || params.lat2 === undefined || params.lon2 === undefined) {
            return { success: false, result: "", steps, message: "Provide lat1, lon1, lat2, lon2" };
          }
          const phi1 = toRad(params.lat1);
          const phi2 = toRad(params.lat2);
          const dLambda = toRad(params.lon2 - params.lon1);
          const y = Math.sin(dLambda) * Math.cos(phi2);
          const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
          let bearing = toDeg(Math.atan2(y, x));
          bearing = (bearing + 360) % 360;
          const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
          const compassDir = compass[Math.round(bearing / 22.5) % 16];
          steps.push(`Initial Bearing:`);
          steps.push(`  From: ${params.lat1}, ${params.lon1}`);
          steps.push(`  To: ${params.lat2}, ${params.lon2}`);
          steps.push(`  Bearing: ${bearing.toFixed(2)} degrees (${compassDir})`);
          return { success: true, result: `${bearing.toFixed(2)} degrees (${compassDir})`, result_value: bearing, steps, message: `Bearing = ${bearing.toFixed(2)}° (${compassDir})` };
        }

        case "midpoint": {
          if (params.lat1 === undefined || params.lon1 === undefined || params.lat2 === undefined || params.lon2 === undefined) {
            return { success: false, result: "", steps, message: "Provide lat1, lon1, lat2, lon2" };
          }
          const phi1 = toRad(params.lat1);
          const phi2 = toRad(params.lat2);
          const dLambda = toRad(params.lon2 - params.lon1);
          const Bx = Math.cos(phi2) * Math.cos(dLambda);
          const By = Math.cos(phi2) * Math.sin(dLambda);
          const phiMid = Math.atan2(Math.sin(phi1) + Math.sin(phi2), Math.sqrt((Math.cos(phi1) + Bx) ** 2 + By ** 2));
          const lambdaMid = toRad(params.lon1) + Math.atan2(By, Math.cos(phi1) + Bx);
          const latMid = toDeg(phiMid);
          const lonMid = (toDeg(lambdaMid) + 540) % 360 - 180;
          steps.push(`Midpoint:`);
          steps.push(`  Between: (${params.lat1}, ${params.lon1}) and (${params.lat2}, ${params.lon2})`);
          steps.push(`  Midpoint: (${latMid.toFixed(6)}, ${lonMid.toFixed(6)})`);
          return { success: true, result: `${latMid.toFixed(6)}, ${lonMid.toFixed(6)}`, result_value: latMid, steps, message: `Midpoint = ${latMid.toFixed(6)}, ${lonMid.toFixed(6)}` };
        }

        case "destination": {
          if (params.lat1 === undefined || params.lon1 === undefined || params.bearing_deg === undefined || params.distance_km === undefined) {
            return { success: false, result: "", steps, message: "Provide lat1, lon1, bearing_deg, distance_km" };
          }
          const delta = params.distance_km / R;
          const theta = toRad(params.bearing_deg);
          const phi1 = toRad(params.lat1);
          const lambda1 = toRad(params.lon1);
          const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
          const lambda2 = lambda1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
          const lat2 = toDeg(phi2);
          const lon2 = ((toDeg(lambda2) + 540) % 360) - 180;
          steps.push(`Destination Point:`);
          steps.push(`  Start: (${params.lat1}, ${params.lon1})`);
          steps.push(`  Bearing: ${params.bearing_deg} degrees, Distance: ${params.distance_km} km`);
          steps.push(`  Destination: (${lat2.toFixed(6)}, ${lon2.toFixed(6)})`);
          return { success: true, result: `${lat2.toFixed(6)}, ${lon2.toFixed(6)}`, result_value: lat2, steps, message: `Destination = ${lat2.toFixed(6)}, ${lon2.toFixed(6)}` };
        }

        case "dms_convert": {
          if (params.lat === undefined || params.lon === undefined) {
            return { success: false, result: "", steps, message: "Provide lat and lon (decimal degrees)" };
          }
          const toDMS = (decimal: number, isLat: boolean) => {
            const dir = decimal >= 0 ? (isLat ? "N" : "E") : (isLat ? "S" : "W");
            const abs = Math.abs(decimal);
            const d = Math.floor(abs);
            const m = Math.floor((abs - d) * 60);
            const s = ((abs - d - m / 60) * 3600).toFixed(2);
            return `${d}°${m}'${s}"${dir}`;
          };
          const latDMS = toDMS(params.lat, true);
          const lonDMS = toDMS(params.lon, false);
          steps.push(`DMS Conversion:`);
          steps.push(`  Decimal: ${params.lat}, ${params.lon}`);
          steps.push(`  DMS: ${latDMS}, ${lonDMS}`);
          return { success: true, result: `${latDMS}, ${lonDMS}`, steps, message: `DMS: ${latDMS}, ${lonDMS}` };
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
// GEO TIMEZONE — timezone lookup and conversion
// =============================================================================

const TIMEZONE_DATA: Array<{ name: string; offset: number; cities: string[] }> = [
  { name: "UTC", offset: 0, cities: ["London (winter)", "Dublin (winter)", "Lisbon (winter)", "Reykjavik"] },
  { name: "EST (UTC-5)", offset: -5, cities: ["New York (winter)", "Toronto (winter)", "Miami (winter)"] },
  { name: "CST (UTC-6)", offset: -6, cities: ["Chicago (winter)", "Mexico City", "Dallas (winter)"] },
  { name: "MST (UTC-7)", offset: -7, cities: ["Denver (winter)", "Phoenix", "Calgary (winter)"] },
  { name: "PST (UTC-8)", offset: -8, cities: ["Los Angeles (winter)", "Seattle (winter)", "Vancouver (winter)"] },
  { name: "AKST (UTC-9)", offset: -9, cities: ["Anchorage (winter)"] },
  { name: "HST (UTC-10)", offset: -10, cities: ["Honolulu"] },
  { name: "CET (UTC+1)", offset: 1, cities: ["Paris", "Berlin", "Rome", "Madrid", "Amsterdam"] },
  { name: "EET (UTC+2)", offset: 2, cities: ["Athens", "Cairo", "Helsinki", "Bucharest"] },
  { name: "MSK (UTC+3)", offset: 3, cities: ["Moscow", "Istanbul", "Nairobi"] },
  { name: "GST (UTC+4)", offset: 4, cities: ["Dubai", "Baku", "Tbilisi"] },
  { name: "IST (UTC+5:30)", offset: 5.5, cities: ["Mumbai", "Delhi", "Bangalore", "Kolkata"] },
  { name: "CST China (UTC+8)", offset: 8, cities: ["Beijing", "Shanghai", "Singapore", "Hong Kong"] },
  { name: "JST (UTC+9)", offset: 9, cities: ["Tokyo", "Seoul", "Osaka"] },
  { name: "AEST (UTC+10)", offset: 10, cities: ["Sydney (winter)", "Melbourne (winter)", "Brisbane"] },
  { name: "NZST (UTC+12)", offset: 12, cities: ["Auckland (winter)", "Wellington (winter)"] },
];

export const geoTimezone: ToolDef = {
  name: "geo.timezone",
  description: "Look up timezone information and convert times between timezones. Supports: lookup by city name, list all timezones, convert a time from one timezone to another, and get current UTC offset. Includes major world timezones with representative cities.",
  inputSchema: z.object({
    operation: z.enum(["lookup", "list", "convert", "current_utc"]).describe("Timezone operation"),
    city: z.string().optional().describe("City name to look up timezone"),
    from_timezone: z.number().optional().describe("Source timezone offset (hours from UTC)"),
    to_timezone: z.number().optional().describe("Target timezone offset (hours from UTC)"),
    time: z.string().optional().describe("Time to convert (HH:MM format, 24-hour)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    timezone: z.string().optional(),
    offset: z.number().optional(),
    converted_time: z.string().optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute(params) {
    const steps: string[] = [];

    try {
      switch (params.operation) {
        case "list": {
          const list = TIMEZONE_DATA.map((tz) => `${tz.name}: ${tz.cities.slice(0, 3).join(", ")}`).join("\n");
          steps.push(`Available timezones: ${TIMEZONE_DATA.length}`);
          return { success: true, result: list, steps, message: `${TIMEZONE_DATA.length} timezones available` };
        }

        case "lookup": {
          if (!params.city) return { success: false, result: "", steps, message: "Provide city name" };
          const cityLower = params.city.toLowerCase();
          for (const tz of TIMEZONE_DATA) {
            if (tz.cities.some((c) => c.toLowerCase().includes(cityLower))) {
              steps.push(`City: ${params.city}`);
              steps.push(`Timezone: ${tz.name}`);
              steps.push(`UTC offset: ${tz.offset >= 0 ? "+" : ""}${tz.offset} hours`);
              steps.push(`Other cities: ${tz.cities.join(", ")}`);
              return { success: true, result: `${tz.name} (UTC${tz.offset >= 0 ? "+" : ""}${tz.offset})`, timezone: tz.name, offset: tz.offset, steps, message: `${params.city} is in ${tz.name}` };
            }
          }
          return { success: false, result: "", steps, message: `Timezone for '${params.city}' not found. Use 'list' to see available cities.` };
        }

        case "convert": {
          if (params.from_timezone === undefined || params.to_timezone === undefined || !params.time) {
            return { success: false, result: "", steps, message: "Provide from_timezone, to_timezone (UTC offsets), and time (HH:MM)" };
          }
          const [h, m] = params.time.split(":").map(Number);
          if (h === undefined || m === undefined) return { success: false, result: "", steps, message: "Time must be HH:MM format" };
          const diff = params.to_timezone - params.from_timezone;
          let newH = h + diff;
          let dayChange = "";
          if (newH >= 24) { newH -= 24; dayChange = " (next day)"; }
          if (newH < 0) { newH += 24; dayChange = " (previous day)"; }
          const newTime = `${String(Math.floor(newH)).padStart(2, "0")}:${String(m).padStart(2, "0")}${dayChange}`;
          steps.push(`Time conversion:`);
          steps.push(`  From: UTC${params.from_timezone >= 0 ? "+" : ""}${params.from_timezone} at ${params.time}`);
          steps.push(`  To: UTC${params.to_timezone >= 0 ? "+" : ""}${params.to_timezone}`);
          steps.push(`  Difference: ${diff >= 0 ? "+" : ""}${diff} hours`);
          steps.push(`  Result: ${newTime}`);
          return { success: true, result: newTime, converted_time: newTime, steps, message: `${params.time} UTC${params.from_timezone >= 0 ? "+" : ""}${params.from_timezone} = ${newTime} UTC${params.to_timezone >= 0 ? "+" : ""}${params.to_timezone}` };
        }

        case "current_utc": {
          const now = new Date();
          const utcTime = now.toISOString();
          const offset = -now.getTimezoneOffset() / 60;
          steps.push(`Current UTC time: ${utcTime}`);
          steps.push(`Local timezone offset: UTC${offset >= 0 ? "+" : ""}${offset}`);
          return { success: true, result: utcTime, offset, steps, message: `UTC: ${utcTime}, local offset: UTC${offset >= 0 ? "+" : ""}${offset}` };
        }

        default:
          return { success: false, result: "", steps, message: "Unknown operation" };
      }
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};
