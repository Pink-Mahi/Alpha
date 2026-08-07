/**
 * Browser automation tools for competitor analysis, web interaction, and SEO auditing.
 *
 * Tools: browser.navigate, browser.screenshot, browser.click, browser.fill,
 *        browser.extract, browser.get_html, browser.analyze_seo, browser.scroll,
 *        browser.list_elements, browser.wait
 *
 * Uses Playwright with a persistent browser context so agents can log in,
 * create accounts, and explore websites like a real user.
 */
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "./toolBus.js";

// --- Browser singleton management --------------------------------------------

let _browser: any = null;
let _context: any = null;
let _page: any = null;

export async function getBrowser(): Promise<any> {
  if (!_browser) {
    const { chromium } = await import("playwright");
    _browser = await chromium.launch({ headless: true });
    _context = await _browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    _page = await _context.newPage();
  }
  return _page;
}

// --- Tools -------------------------------------------------------------------

export const browserNavigate: ToolDef = {
  name: "browser.navigate",
  description: "Navigate the browser to a URL. Use this to visit competitor websites, documentation pages, or any web resource. The browser maintains cookies/session across navigations so you can log in and explore.",
  inputSchema: z.object({
    url: z.string().describe("The URL to navigate to (include https://)"),
    wait_until: z.enum(["load", "domcontentloaded", "networkidle"]).default("domcontentloaded").describe("When to consider navigation complete"),
  }),
  outputSchema: z.object({
    url: z.string(),
    title: z.string(),
    status: z.number(),
  }),
  permissionsRequired: ["browser.navigate"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ url, wait_until }) {
    const page = await getBrowser();
    const response = await page.goto(url, { waitUntil: wait_until, timeout: 30000 });
    const title = await page.title();
    return {
      url: page.url(),
      title,
      status: response?.status() ?? 0,
    };
  },
};

export const browserScreenshot: ToolDef = {
  name: "browser.screenshot",
  description: "Take a screenshot of the current page. Saves to a file and returns the path. Use this to visually analyze a competitor's website layout, design, and user experience.",
  inputSchema: z.object({
    path: z.string().optional().describe("File path to save screenshot (relative to cwd). Defaults to screenshot_<timestamp>.png"),
    full_page: z.boolean().default(true).describe("Capture the full scrollable page, not just the viewport"),
  }),
  outputSchema: z.object({
    path: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  permissionsRequired: ["browser.screenshot"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ path, full_page }, ctx) {
    const page = await getBrowser();
    const filename = path ?? `screenshot_${Date.now()}.png`;
    const fullPath = join(ctx.cwd, filename);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("\\") >= 0 ? fullPath.lastIndexOf("\\") : fullPath.lastIndexOf("/"));
    try { mkdirSync(dir, { recursive: true }); } catch { /* dir exists */ }
    await page.screenshot({ path: fullPath, fullPage: full_page });
    const viewport = page.viewportSize();
    return {
      path: filename,
      width: viewport?.width ?? 1920,
      height: viewport?.height ?? 1080,
    };
  },
};

export const browserClick: ToolDef = {
  name: "browser.click",
  description: "Click an element on the page. Use this to interact with websites — click buttons, links, navigation menus, etc. Useful for exploring competitor features behind login walls.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector for the element to click (e.g. 'button.login', '#signup-btn', 'a[href=\"/pricing\"]')"),
  }),
  outputSchema: z.object({
    clicked: z.boolean(),
    current_url: z.string(),
  }),
  permissionsRequired: ["browser.click"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ selector }) {
    const page = await getBrowser();
    try {
      await page.click(selector, { timeout: 10000 });
      await page.waitForTimeout(1000); // brief pause for any animations/navigation
      return { clicked: true, current_url: page.url() };
    } catch (e) {
      return { clicked: false, current_url: page.url() };
    }
  },
};

export const browserFill: ToolDef = {
  name: "browser.fill",
  description: "Fill a form field on the page. Use this to type into input fields — for creating accounts, logging in, filling out forms on competitor websites.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector for the input field"),
    value: z.string().describe("The text to type into the field"),
  }),
  outputSchema: z.object({
    filled: z.boolean(),
  }),
  permissionsRequired: ["browser.fill"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ selector, value }) {
    const page = await getBrowser();
    try {
      await page.fill(selector, value, { timeout: 10000 });
      return { filled: true };
    } catch (e) {
      return { filled: false };
    }
  },
};

export const browserExtract: ToolDef = {
  name: "browser.extract",
  description: "Extract text content from the page or specific elements. Use this to read competitor website content, feature descriptions, pricing pages, etc.",
  inputSchema: z.object({
    selector: z.string().optional().describe("CSS selector to extract text from. If omitted, extracts all visible text from the page."),
    max_chars: z.number().int().min(100).max(50000).default(10000).describe("Maximum characters to return"),
  }),
  outputSchema: z.object({
    text: z.string(),
    char_count: z.number(),
  }),
  permissionsRequired: ["browser.extract"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ selector, max_chars }) {
    const page = await getBrowser();
    let text: string;
    if (selector) {
      text = await page.textContent(selector) ?? "";
    } else {
      text = await page.textContent("body") ?? "";
    }
    text = text.replace(/\s+/g, " ").trim();
    return {
      text: text.slice(0, max_chars),
      char_count: text.length,
    };
  },
};

export const browserGetHtml: ToolDef = {
  name: "browser.get_html",
  description: "Get the HTML source of the current page or a specific element. Use this to analyze a competitor's HTML structure, CSS classes, meta tags, and implementation details.",
  inputSchema: z.object({
    selector: z.string().optional().describe("CSS selector to get HTML from. If omitted, gets the full page HTML."),
    max_chars: z.number().int().min(100).max(50000).default(15000).describe("Maximum characters to return"),
  }),
  outputSchema: z.object({
    html: z.string(),
    char_count: z.number(),
  }),
  permissionsRequired: ["browser.get_html"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ selector, max_chars }) {
    const page = await getBrowser();
    let html: string;
    if (selector) {
      html = await page.innerHTML(selector) ?? "";
    } else {
      html = await page.content();
    }
    return {
      html: html.slice(0, max_chars),
      char_count: html.length,
    };
  },
};

export const browserAnalyzeSeo: ToolDef = {
  name: "browser.analyze_seo",
  description: "Analyze the SEO characteristics of the current page. Extracts meta tags, Open Graph data, headings structure, image alt texts, and other SEO-relevant information. Use this to audit competitor websites and identify SEO opportunities.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    title: z.string(),
    description: z.string(),
    keywords: z.string(),
    og_title: z.string(),
    og_description: z.string(),
    og_image: z.string(),
    canonical: z.string(),
    robots: z.string(),
    headings: z.array(z.object({ level: z.string(), text: z.string() })),
    images_without_alt: z.number(),
    total_images: z.number(),
    links_count: z.number(),
    word_count: z.number(),
    has_structured_data: z.boolean(),
    structured_data_types: z.array(z.string()),
  }),
  permissionsRequired: ["browser.analyze_seo"],
  sideEffect: "read",
  requiresApproval: false,
  async execute() {
    const page = await getBrowser();
    const result = await page.evaluate(() => {
      const getMeta = (name: string) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el?.getAttribute("content") ?? "";
      };
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => ({
        level: h.tagName.toLowerCase(),
        text: h.textContent?.trim().slice(0, 200) ?? "",
      }));
      const images = Array.from(document.querySelectorAll("img"));
      const imagesWithoutAlt = images.filter((img) => !img.getAttribute("alt")).length;
      const links = document.querySelectorAll("a").length;
      const wordCount = (document.body.textContent ?? "").split(/\s+/).filter(Boolean).length;
      const structuredData = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const sdTypes: string[] = [];
      structuredData.forEach((sd) => {
        try {
          const data = JSON.parse(sd.textContent ?? "");
          const types = Array.isArray(data) ? data.map((d) => d["@type"]).filter(Boolean) : [data["@type"]].filter(Boolean);
          sdTypes.push(...types.map(String));
        } catch { /* invalid JSON */ }
      });
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
      return {
        title: document.title ?? "",
        description: getMeta("description"),
        keywords: getMeta("keywords"),
        og_title: getMeta("og:title"),
        og_description: getMeta("og:description"),
        og_image: getMeta("og:image"),
        canonical,
        robots: getMeta("robots"),
        headings: headings.slice(0, 50),
        images_without_alt: imagesWithoutAlt,
        total_images: images.length,
        links_count: links,
        word_count: wordCount,
        has_structured_data: structuredData.length > 0,
        structured_data_types: sdTypes,
      };
    });
    return result;
  },
};

export const browserScroll: ToolDef = {
  name: "browser.scroll",
  description: "Scroll the page down or up. Use this to explore long pages, trigger lazy-loaded content, or see different sections of a competitor's website.",
  inputSchema: z.object({
    direction: z.enum(["down", "up", "bottom", "top"]).default("down").describe("Direction to scroll"),
    amount: z.number().int().min(100).max(5000).default(800).describe("Pixels to scroll (ignored for 'bottom' and 'top')"),
  }),
  outputSchema: z.object({
    scrolled: z.boolean(),
    scroll_y: z.number(),
  }),
  permissionsRequired: ["browser.scroll"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ direction, amount }) {
    const page = await getBrowser();
    if (direction === "top") {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (direction === "bottom") {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else if (direction === "down") {
      await page.evaluate((px: number) => window.scrollBy(0, px), amount);
    } else {
      await page.evaluate((px: number) => window.scrollBy(0, -px), amount);
    }
    await page.waitForTimeout(500);
    const scrollY = await page.evaluate(() => window.scrollY);
    return { scrolled: true, scroll_y: scrollY };
  },
};

export const browserListElements: ToolDef = {
  name: "browser.list_elements",
  description: "List interactive elements on the page (buttons, links, inputs, forms). Use this to understand what actions are available on a competitor's page before clicking or filling.",
  inputSchema: z.object({
    selector: z.string().optional().describe("CSS selector to scope the search. If omitted, searches the whole page."),
    element_type: z.enum(["all", "buttons", "links", "inputs", "forms", "images"]).default("all").describe("Type of elements to list"),
    max_results: z.number().int().min(1).max(100).default(30).describe("Maximum number of elements to return"),
  }),
  outputSchema: z.object({
    elements: z.array(z.object({
      tag: z.string(),
      type: z.string(),
      id: z.string(),
      class: z.string(),
      text: z.string(),
      href: z.string(),
      placeholder: z.string(),
      selector: z.string(),
    })),
  }),
  permissionsRequired: ["browser.list_elements"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ selector, element_type, max_results }) {
    const page = await getBrowser();
    const typeSelector: Record<string, string> = {
      all: "button, a, input, select, textarea, form, img",
      buttons: "button, input[type='button'], input[type='submit']",
      links: "a[href]",
      inputs: "input, select, textarea",
      forms: "form",
      images: "img",
    };
    const scope = selector ?? "body";
    const elements = await page.evaluate(({ scope, typeSel, max }: { scope: string; typeSel: string; max: number }) => {
      const root = document.querySelector(scope) ?? document.body;
      const els = Array.from(root.querySelectorAll(typeSel));
      return els.slice(0, max).map((el: Element) => {
        const id = el.id ? `#${el.id}` : "";
        const classes = el.className && typeof el.className === "string" ? `.${el.className.split(" ").join(".")}` : "";
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") ?? "",
          id: el.id ?? "",
          class: typeof el.className === "string" ? el.className : "",
          text: el.textContent?.trim().slice(0, 100) ?? "",
          href: el.getAttribute("href") ?? "",
          placeholder: el.getAttribute("placeholder") ?? "",
          selector: `${el.tagName.toLowerCase()}${id}${classes}`.slice(0, 200),
        };
      });
    }, { scope, typeSel: typeSelector[element_type]!, max: max_results });
    return { elements };
  },
};

export const browserWait: ToolDef = {
  name: "browser.wait",
  description: "Wait for an element to appear on the page or for a specified duration. Use this after clicking something that triggers a page load or modal.",
  inputSchema: z.object({
    selector: z.string().optional().describe("CSS selector to wait for. If omitted, waits for the specified duration."),
    timeout: z.number().int().min(500).max(30000).default(5000).describe("Maximum wait time in milliseconds"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
  }),
  permissionsRequired: ["browser.wait"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ selector, timeout }) {
    const page = await getBrowser();
    if (selector) {
      try {
        await page.waitForSelector(selector, { timeout });
        return { found: true };
      } catch {
        return { found: false };
      }
    } else {
      await page.waitForTimeout(timeout);
      return { found: true };
    }
  },
};

/** Close the browser (cleanup). */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
    _context = null;
    _page = null;
  }
}
