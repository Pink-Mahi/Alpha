/**
 * Cryptography tools — hashing, encoding/decoding, and cipher operations.
 * Uses Node.js built-in crypto module for secure hashing.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";
import { createHash } from "crypto";

// =============================================================================
// CRYPTO HASH — SHA-256, SHA-512, SHA-1, MD5
// =============================================================================

export const cryptoHash: ToolDef = {
  name: "crypto.hash",
  description: "Hash data using cryptographic algorithms: SHA-256, SHA-512, SHA-384, SHA-1, MD5. Returns hex and base64 digests. Useful for verifying data integrity, generating checksums, and password hashing (use bcrypt/argon2 for passwords in production).",
  inputSchema: z.object({
    data: z.string().describe("Data to hash"),
    algorithm: z.enum(["sha256", "sha512", "sha384", "sha1", "md5"]).default("sha256").describe("Hash algorithm"),
    encoding: z.enum(["hex", "base64", "base64url"]).default("hex").describe("Output encoding"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    hash_hex: z.string().optional(),
    hash_base64: z.string().optional(),
    algorithm: z.string(),
    data_length: z.number(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ data, algorithm, encoding }) {
    const steps: string[] = [];
    try {
      const hash = createHash(algorithm);
      hash.update(data);
      const hexDigest = hash.digest("hex");
      const hash2 = createHash(algorithm);
      hash2.update(data);
      const b64Digest = hash2.digest("base64");

      steps.push(`Hashing ${data.length} characters with ${algorithm}`);
      steps.push(`Hex: ${hexDigest}`);
      steps.push(`Base64: ${b64Digest}`);

      const result = encoding === "base64" ? b64Digest : encoding === "base64url" ? b64Digest.replace(/\+/g, "-").replace(/\//g, "_") : hexDigest;

      return {
        success: true,
        result,
        hash_hex: hexDigest,
        hash_base64: b64Digest,
        algorithm,
        data_length: data.length,
        steps,
        message: `${algorithm} hash: ${result.substring(0, 32)}...`,
      };
    } catch (e: any) {
      return { success: false, result: "", algorithm, data_length: 0, steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// CRYPTO ENCODE — Base64, hex, URL, ROT13
// =============================================================================

export const cryptoEncode: ToolDef = {
  name: "crypto.encode",
  description: "Encode and decode data in various formats: Base64, hex, URL encoding, ROT13, binary, and ASCII. Supports both encode and decode operations.",
  inputSchema: z.object({
    data: z.string().describe("Data to encode or decode"),
    format: z.enum(["base64", "hex", "url", "rot13", "binary", "ascii"]).describe("Encoding format"),
    operation: z.enum(["encode", "decode"]).default("encode").describe("Encode or decode"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    format: z.string(),
    operation: z.string(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ data, format, operation }) {
    const steps: string[] = [];
    try {
      let result = "";

      switch (format) {
        case "base64": {
          if (operation === "encode") {
            result = Buffer.from(data, "utf8").toString("base64");
            steps.push(`Base64 encode: ${data} -> ${result}`);
          } else {
            result = Buffer.from(data, "base64").toString("utf8");
            steps.push(`Base64 decode: ${data} -> ${result}`);
          }
          break;
        }

        case "hex": {
          if (operation === "encode") {
            result = Buffer.from(data, "utf8").toString("hex");
            steps.push(`Hex encode: ${data} -> ${result}`);
          } else {
            result = Buffer.from(data, "hex").toString("utf8");
            steps.push(`Hex decode: ${data} -> ${result}`);
          }
          break;
        }

        case "url": {
          if (operation === "encode") {
            result = encodeURIComponent(data);
            steps.push(`URL encode: ${data} -> ${result}`);
          } else {
            result = decodeURIComponent(data);
            steps.push(`URL decode: ${data} -> ${result}`);
          }
          break;
        }

        case "rot13": {
          result = data.replace(/[a-zA-Z]/g, (c: string) => {
            const code = c.charCodeAt(0);
            const base = code >= 65 && code <= 90 ? 65 : 97;
            return String.fromCharCode(((code - base + 13) % 26) + base);
          });
          steps.push(`ROT13 ${operation}: ${data} -> ${result}`);
          break;
        }

        case "binary": {
          if (operation === "encode") {
            result = data.split("").map((c: string) => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
            steps.push(`Binary encode: ${data} -> ${result}`);
          } else {
            result = data.split(" ").map((b: string) => String.fromCharCode(parseInt(b, 2))).join("");
            steps.push(`Binary decode: ${data} -> ${result}`);
          }
          break;
        }

        case "ascii": {
          if (operation === "encode") {
            result = data.split("").map((c: string) => c.charCodeAt(0)).join(" ");
            steps.push(`ASCII encode: ${data} -> ${result}`);
          } else {
            result = data.split(" ").map((n: string) => String.fromCharCode(parseInt(n))).join("");
            steps.push(`ASCII decode: ${data} -> ${result}`);
          }
          break;
        }

        default:
          return { success: false, result: "", format, operation, steps, message: "Unknown format" };
      }

      return { success: true, result, format, operation, steps, message: `${operation} ${format}: ${result.substring(0, 50)}${result.length > 50 ? "..." : ""}` };
    } catch (e: any) {
      return { success: false, result: "", format, operation, steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// CRYPTO CIPHER — AES encryption/decryption (for development/testing)
// =============================================================================

export const cryptoCipher: ToolDef = {
  name: "crypto.cipher",
  description: "Encrypt and decrypt data using AES-256-CBC. Provide a password and the tool derives a key using PBKDF2. Returns encrypted data as base64. For development and testing — use proper key management in production. Also supports generating random keys and IVs.",
  inputSchema: z.object({
    operation: z.enum(["encrypt", "decrypt", "generate_key"]).describe("Operation to perform"),
    data: z.string().optional().describe("Data to encrypt or decrypt"),
    password: z.string().optional().describe("Password for key derivation (encrypt/decrypt)"),
    encrypted_data: z.string().optional().describe("Base64 encrypted data (for decrypt)"),
    key_length: z.number().default(32).describe("Key length in bytes (16, 24, or 32)"),
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
  async execute(params) {
    const steps: string[] = [];
    try {
      if (params.operation === "generate_key") {
        const { randomBytes } = await import("crypto");
        const key = randomBytes(params.key_length);
        const iv = randomBytes(16);
        steps.push(`Generated ${params.key_length}-byte key and 16-byte IV`);
        steps.push(`Key (hex): ${key.toString("hex")}`);
        steps.push(`Key (base64): ${key.toString("base64")}`);
        steps.push(`IV (hex): ${iv.toString("hex")}`);
        return { success: true, result: `Key: ${key.toString("base64")}, IV: ${iv.toString("base64")}`, steps, message: `Generated ${params.key_length}-byte key` };
      }

      if (!params.password) {
        return { success: false, result: "", steps, message: "Provide password for key derivation" };
      }

      const { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } = await import("crypto");

      // Derive key from password using PBKDF2
      const salt = Buffer.from("alpha-salt-v1", "utf8"); // Fixed salt for reproducibility
      const key = pbkdf2Sync(params.password, salt, 100000, 32, "sha256");

      if (params.operation === "encrypt") {
        if (!params.data) return { success: false, result: "", steps, message: "Provide data to encrypt" };
        const iv = randomBytes(16);
        const cipher = createCipheriv("aes-256-cbc", key, iv);
        let encrypted = cipher.update(params.data, "utf8", "base64");
        encrypted += cipher.final("base64");
        // Prepend IV to encrypted data (IV doesn't need to be secret)
        const ivHex = iv.toString("hex");
        const result = `${ivHex}:${encrypted}`;
        steps.push(`AES-256-CBC encryption:`);
        steps.push(`Key derived from password using PBKDF2 (100000 iterations, SHA-256)`);
        steps.push(`IV generated: ${ivHex}`);
        steps.push(`Encrypted: ${encrypted.substring(0, 50)}...`);
        return { success: true, result, steps, message: `Encrypted (IV:ciphertext): ${result.substring(0, 60)}...` };
      }

      if (params.operation === "decrypt") {
        if (!params.encrypted_data) return { success: false, result: "", steps, message: "Provide encrypted_data (format: IV:ciphertext)" };
        const colonIdx = params.encrypted_data.indexOf(":");
        if (colonIdx === -1) return { success: false, result: "", steps, message: "Invalid format. Expected IV:ciphertext" };
        const ivHex = params.encrypted_data.substring(0, colonIdx);
        const encrypted = params.encrypted_data.substring(colonIdx + 1);
        const iv = Buffer.from(ivHex, "hex");
        const decipher = createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(encrypted, "base64", "utf8");
        decrypted += decipher.final("utf8");
        steps.push(`AES-256-CBC decryption:`);
        steps.push(`Key derived from password using PBKDF2`);
        steps.push(`IV extracted: ${ivHex}`);
        steps.push(`Decrypted: ${decrypted}`);
        return { success: true, result: decrypted, steps, message: `Decrypted: ${decrypted}` };
      }

      return { success: false, result: "", steps, message: "Unknown operation" };
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};
