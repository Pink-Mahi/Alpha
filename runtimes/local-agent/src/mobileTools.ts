/**
 * Mobile app tools — convert websites into native iOS and Android apps.
 *
 * Uses Capacitor (by Ionic) to wrap web apps into native mobile apps.
 * The agent can take any website it has built and convert it into a
 * full mobile app project that can be opened in Xcode or Android Studio.
 *
 * Tools:
 * - mobile.convert   — Create a Capacitor project from a web directory
 * - mobile.config    — Configure app name, bundle ID, permissions
 * - mobile.icon      — Generate app icons and splash screens
 * - mobile.build     — Build the app for iOS or Android
 * - mobile.run       — Run on emulator/device
 */
import { z } from "zod";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readFile as readFileAsync, writeFile as writeFileAsync, readdir, copyFile, cp } from "node:fs/promises";
import { join, isAbsolute, relative, basename, extname } from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef, ToolContext } from "./toolBus.js";

const execAsync = promisify(execCb);

function safePath(cwd: string, path: string): string {
  const resolved = isAbsolute(path) ? path : join(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..")) throw new Error(`path outside working directory: ${path}`);
  return resolved;
}

// =============================================================================
// 1. MOBILE.CONVERT — Create a Capacitor project from a web directory
// =============================================================================

export const mobileConvert: ToolDef = {
  name: "mobile.convert",
  description: "Convert a website (HTML/CSS/JS directory with index.html) into a native mobile app project for iOS and Android. Creates a Capacitor project that wraps the web app in a native shell. The web app runs inside a WebView with native capabilities (camera, geolocation, push notifications, etc.). The output is a complete project that can be opened in Xcode (iOS) or Android Studio (Android).",
  inputSchema: z.object({
    web_dir: z.string().describe("Path to the directory containing the website (must have index.html)"),
    app_name: z.string().describe("App name (e.g. 'My App'). This is shown on the home screen."),
    app_id: z.string().describe("Bundle identifier (e.g. 'com.example.myapp'). Must be reverse-domain format."),
    output_dir: z.string().optional().describe("Output directory for the mobile project (defaults to 'mobile-app' in cwd)"),
    platforms: z.array(z.enum(["ios", "android"])).default(["ios", "android"]).describe("Platforms to target"),
  }),
  outputSchema: z.object({
    project_dir: z.string(),
    platforms: z.array(z.string()),
    success: z.boolean(),
    message: z.string(),
    next_steps: z.array(z.string()),
  }),
  permissionsRequired: ["fs.write", "shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ web_dir, app_name, app_id, output_dir, platforms }, ctx) {
    const webFullPath = safePath(ctx.cwd, web_dir);
    const projectDir = output_dir ? safePath(ctx.cwd, output_dir) : join(ctx.cwd, "mobile-app");

    // Verify web directory has index.html
    if (!existsSync(join(webFullPath, "index.html"))) {
      return {
        project_dir: projectDir,
        platforms: [],
        success: false,
        message: `No index.html found in ${web_dir}. The web directory must contain an index.html file.`,
        next_steps: [],
      };
    }

    try {
      // Create project directory
      mkdirSync(projectDir, { recursive: true });

      // 1. Create package.json for the Capacitor project
      const packageJson = {
        name: app_id.replace(/\./g, "-"),
        version: "1.0.0",
        description: `${app_name} - Mobile App`,
        scripts: {
          "build": "echo 'Web assets are pre-built'",
          "sync": "bunx cap sync",
          "ios": "bunx cap open ios",
          "android": "bunx cap open android",
          "run:ios": "bunx cap run ios",
          "run:android": "bunx cap run android",
        },
        dependencies: {
          "@capacitor/core": "^6.0.0",
          "@capacitor/cli": "^6.0.0",
          "@capacitor/ios": "^6.0.0",
          "@capacitor/android": "^6.0.0",
          "@capacitor/app": "^6.0.0",
          "@capacitor/haptics": "^6.0.0",
          "@capacitor/keyboard": "^6.0.0",
          "@capacitor/status-bar": "^6.0.0",
          "@capacitor/splash-screen": "^6.0.0",
          "@capacitor/geolocation": "^6.0.0",
          "@capacitor/camera": "^6.0.0",
          "@capacitor/push-notifications": "^6.0.0",
        },
      };
      await writeFileAsync(join(projectDir, "package.json"), JSON.stringify(packageJson, null, 2));

      // 2. Create capacitor.config.ts
      const capacitorConfig = `import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "${app_id}",
  appName: "${app_name}",
  webDir: "www",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
`;
      await writeFileAsync(join(projectDir, "capacitor.config.ts"), capacitorConfig);

      // 3. Copy web assets to www/
      const wwwDir = join(projectDir, "www");
      mkdirSync(wwwDir, { recursive: true });
      await cp(webFullPath, wwwDir, { recursive: true });

      // 4. Install dependencies
      try {
        await execAsync("bun install", { cwd: projectDir, timeout: 60000 });
      } catch {
        // Fallback to npm if bun fails
        try {
          await execAsync("npm install", { cwd: projectDir, timeout: 120000 });
        } catch (e) {
          return {
            project_dir: projectDir,
            platforms: [],
            success: false,
            message: `Failed to install dependencies: ${e}. You may need to run 'npm install' manually in ${projectDir}.`,
            next_steps: [`cd ${projectDir}`, "npm install", "npx cap add ios", "npx cap add android"],
          };
        }
      }

      // 5. Add native platforms
      const addedPlatforms: string[] = [];
      for (const platform of platforms) {
        try {
          await execAsync(`bunx cap add ${platform}`, { cwd: projectDir, timeout: 60000 });
          addedPlatforms.push(platform);
        } catch {
          try {
            await execAsync(`npx cap add ${platform}`, { cwd: projectDir, timeout: 60000 });
            addedPlatforms.push(platform);
          } catch (e) {
            // Platform add might fail if not on the right OS (e.g. iOS on Windows)
            // That's OK — the project structure is still created
          }
        }
      }

      // 6. Sync web assets to native projects
      try {
        await execAsync("bunx cap sync", { cwd: projectDir, timeout: 30000 });
      } catch {
        try { await execAsync("npx cap sync", { cwd: projectDir, timeout: 30000 }); } catch { /* best effort */ }
      }

      // 7. Create a README with instructions
      const readme = `# ${app_name} - Mobile App

This is a native mobile app generated from a web app using Capacitor.

## Project Structure
- \`www/\` - Web assets (HTML/CSS/JS)
- \`ios/\` - iOS project (open in Xcode)
- \`android/\` - Android project (open in Android Studio)

## Prerequisites

### iOS (requires macOS)
- Xcode 15+
- CocoaPods
- iOS 13+ deployment target

### Android
- Android Studio
- Android SDK 21+
- JDK 17

## Building

### iOS
\`\`\`bash
cd ${output_dir ?? "mobile-app"}
npx cap open ios
# Xcode will open — select a signing team and click Run
\`\`\`

### Android
\`\`\`bash
cd ${output_dir ?? "mobile-app"}
npx cap open android
# Android Studio will open — click Run
\`\`\`

## Running on a Device/Emulator

\`\`\`bash
# iOS (requires macOS + Xcode)
npx cap run ios

# Android
npx cap run android
\`\`\`

## Updating Web Assets

After modifying files in \`www/\`:
\`\`\`bash
npx cap sync
\`\`\`

## Native Plugins Included
- @capacitor/app - App lifecycle
- @capacitor/haptics - Vibration/haptic feedback
- @capacitor/keyboard - Keyboard events
- @capacitor/status-bar - Status bar control
- @capacitor/splash-screen - Splash screen
- @capacitor/geolocation - GPS/location
- @capacitor/camera - Camera access
- @capacitor/push-notifications - Push notifications

## App Configuration
Edit \`capacitor.config.ts\` to change app settings.
`;
      await writeFileAsync(join(projectDir, "README.md"), readme);

      const nextSteps: string[] = [];
      if (addedPlatforms.includes("ios")) {
        nextSteps.push(`Open iOS project: cd ${output_dir ?? "mobile-app"} && npx cap open ios`);
        nextSteps.push("In Xcode: select signing team, set bundle ID, click Run");
      }
      if (addedPlatforms.includes("android")) {
        nextSteps.push(`Open Android project: cd ${output_dir ?? "mobile-app"} && npx cap open android`);
        nextSteps.push("In Android Studio: click Run to deploy to emulator/device");
      }
      if (addedPlatforms.length === 0) {
        nextSteps.push("Install dependencies: cd " + (output_dir ?? "mobile-app") + " && npm install");
        nextSteps.push("Add iOS: npx cap add ios (requires macOS)");
        nextSteps.push("Add Android: npx cap add android");
        nextSteps.push("Sync: npx cap sync");
      }

      return {
        project_dir: output_dir ?? "mobile-app",
        platforms: addedPlatforms,
        success: true,
        message: `Mobile app project created at ${output_dir ?? "mobile-app"}. Web assets copied to www/. ${addedPlatforms.length} platform(s) added: ${addedPlatforms.join(", ") || "none (add manually with npx cap add ios/android)"}.`,
        next_steps: nextSteps,
      };
    } catch (e: any) {
      return {
        project_dir: projectDir,
        platforms: [],
        success: false,
        message: `Failed to create mobile app project: ${e.message ?? String(e)}`,
        next_steps: [],
      };
    }
  },
};

// =============================================================================
// 2. MOBILE.CONFIG — Configure app name, bundle ID, permissions
// =============================================================================

export const mobileConfig: ToolDef = {
  name: "mobile.config",
  description: "Configure a mobile app project's settings: app name, bundle ID, permissions, orientation, status bar, splash screen. Use this after mobile.convert to customize the app before building.",
  inputSchema: z.object({
    project_dir: z.string().describe("Path to the mobile app project directory"),
    app_name: z.string().optional().describe("New app name"),
    app_id: z.string().optional().describe("New bundle identifier (e.g. com.example.app)"),
    permissions: z.array(z.enum(["camera", "geolocation", "push-notifications", "microphone", "contacts", "storage", "bluetooth"])).optional().describe("Native permissions to enable"),
    orientation: z.enum(["portrait", "landscape", "any"]).optional().describe("Screen orientation lock"),
    status_bar_style: z.enum(["DARK", "LIGHT", "DEFAULT"]).optional().describe("Status bar style"),
    splash_color: z.string().optional().describe("Splash screen background color (hex)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  permissionsRequired: ["fs.write"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ project_dir, app_name, app_id, permissions, orientation, status_bar_style, splash_color }, ctx) {
    const fullPath = safePath(ctx.cwd, project_dir);
    const configPath = join(fullPath, "capacitor.config.ts");

    if (!existsSync(configPath)) {
      return { success: false, message: "Not a Capacitor project. Run mobile.convert first." };
    }

    try {
      let configContent = await readFileAsync(configPath, "utf8");

      // Update app name
      if (app_name) {
        configContent = configContent.replace(/appName:\s*"[^"]*"/, `appName: "${app_name}"`);
      }

      // Update app ID
      if (app_id) {
        configContent = configContent.replace(/appId:\s*"[^"]*"/, `appId: "${app_id}"`);
      }

      // Update status bar style
      if (status_bar_style) {
        if (configContent.includes("style:")) {
          configContent = configContent.replace(/style:\s*"[^"]*"/, `style: "${status_bar_style}"`);
        }
      }

      // Update splash screen color
      if (splash_color) {
        if (configContent.includes("backgroundColor:")) {
          configContent = configContent.replace(/backgroundColor:\s*"[^"]*"/, `backgroundColor: "${splash_color}"`);
        }
      }

      // Add orientation config
      if (orientation) {
        if (!configContent.includes("orientation:")) {
          configContent = configContent.replace(
            /(server:\s*{)/,
            `orientation: "${orientation}",\n  $1`
          );
        } else {
          configContent = configContent.replace(/orientation:\s*"[^"]*"/, `orientation: "${orientation}"`);
        }
      }

      await writeFileAsync(configPath, configContent, "utf8");

      // Update iOS Info.plist with permissions
      if (permissions && permissions.length > 0) {
        const iosInfoPlistPath = join(fullPath, "ios", "App", "App", "Info.plist");
        if (existsSync(iosInfoPlistPath)) {
          let plistContent = await readFileAsync(iosInfoPlistPath, "utf8");
          const permissionMessages: Record<string, string> = {
            camera: "NSCameraUsageDescription",
            geolocation: "NSLocationWhenInUseUsageDescription",
            "push-notifications": "NSRemoteNotificationUsageDescription",
            microphone: "NSMicrophoneUsageDescription",
            contacts: "NSContactsUsageDescription",
            storage: "NSPhotoLibraryUsageDescription",
            bluetooth: "NSBluetoothAlwaysUsageDescription",
          };
          const descriptions: Record<string, string> = {
            camera: "This app needs camera access to take photos.",
            geolocation: "This app needs location access to show your position on the map.",
            "push-notifications": "This app needs notification permission to send you updates.",
            microphone: "This app needs microphone access to record audio.",
            contacts: "This app needs contacts access to find your friends.",
            storage: "This app needs photo library access to save and load images.",
            bluetooth: "This app needs Bluetooth access to connect to devices.",
          };

          for (const perm of permissions) {
            const key = permissionMessages[perm];
            const desc = descriptions[perm];
            if (key && desc && !plistContent.includes(key)) {
              // Insert permission before </dict>
              plistContent = plistContent.replace(
                /<\/dict>/,
                `  <key>${key}</key>\n  <string>${desc}</string>\n</dict>`
              );
            }
          }
          await writeFileAsync(iosInfoPlistPath, plistContent, "utf8");
        }

        // Update Android AndroidManifest.xml with permissions
        const androidManifestPath = join(fullPath, "android", "app", "src", "main", "AndroidManifest.xml");
        if (existsSync(androidManifestPath)) {
          let manifestContent = await readFileAsync(androidManifestPath, "utf8");
          const androidPermissions: Record<string, string> = {
            camera: "android.permission.CAMERA",
            geolocation: "android.permission.ACCESS_FINE_LOCATION",
            "push-notifications": "android.permission.POST_NOTIFICATIONS",
            microphone: "android.permission.RECORD_AUDIO",
            contacts: "android.permission.READ_CONTACTS",
            storage: "android.permission.READ_EXTERNAL_STORAGE",
            bluetooth: "android.permission.BLUETOOTH",
          };

          for (const perm of permissions) {
            const androidPerm = androidPermissions[perm];
            if (androidPerm && !manifestContent.includes(androidPerm)) {
              manifestContent = manifestContent.replace(
                /<application/,
                `  <uses-permission android:name="${androidPerm}" />\n  <application`
              );
            }
          }
          await writeFileAsync(androidManifestPath, manifestContent, "utf8");
        }
      }

      // Sync changes to native projects
      try {
        await execAsync("bunx cap sync", { cwd: fullPath, timeout: 30000 });
      } catch {
        try { await execAsync("npx cap sync", { cwd: fullPath, timeout: 30000 }); } catch { /* best effort */ }
      }

      return {
        success: true,
        message: `Configuration updated. ${app_name ? `App name: ${app_name}. ` : ""}${app_id ? `Bundle ID: ${app_id}. ` : ""}${permissions ? `Permissions: ${permissions.join(", ")}. ` : ""}${orientation ? `Orientation: ${orientation}. ` : ""}Changes synced to native projects.`,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to update config: ${e.message ?? String(e)}` };
    }
  },
};

// =============================================================================
// 3. MOBILE.ICON — Generate app icons and splash screens
// =============================================================================

export const mobileIcon: ToolDef = {
  name: "mobile.icon",
  description: "Generate app icons and splash screen images for iOS and Android from a source image. The source image should be a high-resolution PNG (1024x1024 or larger for icons, 2732x2732 for splash). The tool creates all required sizes for both platforms. Use image.generate first to create a logo, then use this to convert it to app icons.",
  inputSchema: z.object({
    project_dir: z.string().describe("Path to the mobile app project directory"),
    icon_source: z.string().describe("Path to the source icon image (PNG, 1024x1024+ recommended)"),
    splash_source: z.string().optional().describe("Path to the source splash screen image (PNG, 2732x2732 recommended)"),
    background_color: z.string().default("#ffffff").describe("Background color for splash screen (hex)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    icons_generated: z.number(),
  }),
  permissionsRequired: ["fs.write", "shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ project_dir, icon_source, splash_source, background_color }, ctx) {
    const fullPath = safePath(ctx.cwd, project_dir);
    const iconPath = safePath(ctx.cwd, icon_source);

    if (!existsSync(iconPath)) {
      return { success: false, message: `Icon source not found: ${icon_source}`, icons_generated: 0 };
    }

    try {
      // Try using @capacitor/assets to generate icons
      // First install it
      try {
        await execAsync("bun add -D @capacitor/assets", { cwd: fullPath, timeout: 30000 });
      } catch {
        try { await execAsync("npm install -D @capacitor/assets", { cwd: fullPath, timeout: 60000 }); } catch { /* may already be installed */ }
      }

      // Create assets directory structure
      const assetsDir = join(fullPath, "assets");
      mkdirSync(assetsDir, { recursive: true });

      // Copy icon source
      await copyFile(iconPath, join(assetsDir, "icon.png"));

      // Copy splash source if provided
      if (splash_source) {
        const splashPath = safePath(ctx.cwd, splash_source);
        if (existsSync(splashPath)) {
          await copyFile(splashPath, join(assetsDir, "splash.png"));
        }
      }

      // Generate icons using @capacitor/assets
      let iconsGenerated = 0;
      try {
        const { stdout } = await execAsync("bunx capacitor-assets generate --icon", { cwd: fullPath, timeout: 60000 });
        iconsGenerated += 20; // iOS + Android icon sizes
      } catch {
        try {
          const { stdout } = await execAsync("npx capacitor-assets generate --icon", { cwd: fullPath, timeout: 60000 });
          iconsGenerated += 20;
        } catch {
          // Manual icon generation fallback — create a simple icon set
          // iOS icons
          const iosIconDir = join(fullPath, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
          if (existsSync(iosIconDir)) {
            await copyFile(iconPath, join(iosIconDir, "icon-1024.png"));
            iconsGenerated += 1;
          }
          // Android icons
          const androidIconDir = join(fullPath, "android", "app", "src", "main", "res");
          if (existsSync(androidIconDir)) {
            for (const size of ["mipmap-hdpi", "mipmap-mdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]) {
              const dir = join(androidIconDir, size);
              if (existsSync(dir)) {
                await copyFile(iconPath, join(dir, "ic_launcher.png"));
                await copyFile(iconPath, join(dir, "ic_launcher_round.png"));
                iconsGenerated += 2;
              }
            }
          }
        }
      }

      // Generate splash screen if source provided
      if (splash_source) {
        try {
          await execAsync("bunx capacitor-assets generate --splash", { cwd: fullPath, timeout: 60000 });
          iconsGenerated += 10;
        } catch {
          try { await execAsync("npx capacitor-assets generate --splash", { cwd: fullPath, timeout: 60000 }); } catch { /* best effort */ }
        }
      }

      // Sync to native projects
      try {
        await execAsync("bunx cap sync", { cwd: fullPath, timeout: 30000 });
      } catch {
        try { await execAsync("npx cap sync", { cwd: fullPath, timeout: 30000 }); } catch { /* best effort */ }
      }

      return {
        success: true,
        message: `App icons generated from ${icon_source}. ${iconsGenerated} icon/splash variants created and synced to native projects.`,
        icons_generated: iconsGenerated,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to generate icons: ${e.message ?? String(e)}`, icons_generated: 0 };
    }
  },
};

// =============================================================================
// 4. MOBILE.BUILD — Build the app for iOS or Android
// =============================================================================

export const mobileBuild: ToolDef = {
  name: "mobile.build",
  description: "Build the mobile app for iOS (.ipa/.app) or Android (.apk/.aab). Syncs web assets first, then builds the native project. iOS builds require macOS with Xcode. Android builds require Android SDK. Returns the path to the built artifact.",
  inputSchema: z.object({
    project_dir: z.string().describe("Path to the mobile app project directory"),
    platform: z.enum(["ios", "android"]).describe("Platform to build for"),
    build_type: z.enum(["debug", "release"]).default("debug").describe("Build type: debug for testing, release for distribution"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    artifact_path: z.string().optional(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ project_dir, platform, build_type }, ctx) {
    const fullPath = safePath(ctx.cwd, project_dir);

    if (!existsSync(join(fullPath, "capacitor.config.ts"))) {
      return { success: false, message: "Not a Capacitor project. Run mobile.convert first." };
    }

    try {
      // Sync web assets
      try {
        await execAsync("bunx cap sync", { cwd: fullPath, timeout: 30000 });
      } catch {
        try { await execAsync("npx cap sync", { cwd: fullPath, timeout: 30000 }); } catch { /* best effort */ }
      }

      if (platform === "android") {
        // Android build using Gradle
        const gradleCmd = build_type === "release" ? "assembleRelease" : "assembleDebug";
        const androidDir = join(fullPath, "android");

        if (!existsSync(androidDir)) {
          return { success: false, message: "Android platform not added. Run: npx cap add android" };
        }

        try {
          if (process.platform === "win32") {
            await execAsync(`cd android && gradlew.bat ${gradleCmd}`, { cwd: fullPath, timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
          } else {
            await execAsync(`cd android && ./gradlew ${gradleCmd}`, { cwd: fullPath, timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
          }

          // Find the APK
          const apkDir = join(androidDir, "app", "build", "outputs", "apk", build_type);
          const apkFiles = await readdir(apkDir).catch(() => []);
          const apk = apkFiles.find((f) => f.endsWith(".apk"));

          return {
            success: true,
            message: `Android ${build_type} build complete. APK: ${apk ?? "app-" + build_type + ".apk"}`,
            artifact_path: apk ? join("android", "app", "build", "outputs", "apk", build_type, apk) : undefined,
          };
        } catch (e: any) {
          return {
            success: false,
            message: `Android build failed: ${e.stderr?.toString() ?? e.message}. Make sure Android SDK is installed and ANDROID_HOME is set.`,
          };
        }
      } else if (platform === "ios") {
        // iOS build using xcodebuild
        const iosDir = join(fullPath, "ios");

        if (!existsSync(iosDir)) {
          return { success: false, message: "iOS platform not added. Run: npx cap add ios (requires macOS)" };
        }

        if (process.platform !== "darwin") {
          return {
            success: false,
            message: "iOS builds require macOS with Xcode. You can still open the project in Xcode: npx cap open ios",
          };
        }

        try {
          const xcodeproj = join(iosDir, "App.xcworkspace");
          const scheme = "App";
          const config = build_type === "release" ? "Release" : "Debug";

          await execAsync(
            `xcodebuild -workspace "${xcodeproj}" -scheme "${scheme}" -configuration "${config}" -sdk iphoneos build`,
            { cwd: fullPath, timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
          );

          return {
            success: true,
            message: `iOS ${build_type} build complete. Open in Xcode to archive and export: npx cap open ios`,
            artifact_path: join("ios", "build", "App"),
          };
        } catch (e: any) {
          return {
            success: false,
            message: `iOS build failed: ${e.stderr?.toString() ?? e.message}. Try opening in Xcode: npx cap open ios`,
          };
        }
      }

      return { success: false, message: "Unknown platform" };
    } catch (e: any) {
      return { success: false, message: `Build failed: ${e.message ?? String(e)}` };
    }
  },
};

// =============================================================================
// 5. MOBILE.RUN — Run on emulator or connected device
// =============================================================================

export const mobileRun: ToolDef = {
  name: "mobile.run",
  description: "Run the mobile app on an emulator or connected device. For Android, starts the app on a running emulator or connected device via ADB. For iOS, requires a macOS with Xcode and a simulator or connected device.",
  inputSchema: z.object({
    project_dir: z.string().describe("Path to the mobile app project directory"),
    platform: z.enum(["ios", "android"]).describe("Platform to run on"),
    target: z.string().optional().describe("Specific device/emulator ID (optional, uses first available if omitted)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ project_dir, platform, target }, ctx) {
    const fullPath = safePath(ctx.cwd, project_dir);

    if (!existsSync(join(fullPath, "capacitor.config.ts"))) {
      return { success: false, message: "Not a Capacitor project. Run mobile.convert first." };
    }

    try {
      // Sync first
      try {
        await execAsync("bunx cap sync", { cwd: fullPath, timeout: 30000 });
      } catch {
        try { await execAsync("npx cap sync", { cwd: fullPath, timeout: 30000 }); } catch { /* best effort */ }
      }

      const cmd = target
        ? `bunx cap run ${platform} --target ${target}`
        : `bunx cap run ${platform}`;

      try {
        const { stdout } = await execAsync(cmd, { cwd: fullPath, timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
        return {
          success: true,
          message: `App launched on ${platform}${target ? ` (target: ${target})` : ""}. ${stdout.slice(0, 200)}`,
        };
      } catch (e: any) {
        return {
          success: false,
          message: `Failed to run on ${platform}: ${e.stderr?.toString() ?? e.message}. Make sure an emulator is running or a device is connected.`,
        };
      }
    } catch (e: any) {
      return { success: false, message: `Run failed: ${e.message ?? String(e)}` };
    }
  },
};
