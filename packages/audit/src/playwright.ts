/**
 * Optional Playwright-based audit runner.
 *
 * Requires `playwright` or `playwright-core` to be installed separately:
 *   pnpm add -D playwright
 *
 * Usage:
 *   import { auditURL } from '@gamut-all/audit';
 *   const result = await auditURL('http://localhost:3000', registry);
 */

import type { TokenRegistry } from '@gamut-all/core';
import type { AuditResult } from './runner.js';

export interface PlaywrightAuditOptions {
  /** Viewport width. @default 1280 */
  width?: number;
  /** Viewport height. @default 720 */
  height?: number;
  /** Browser to use. @default 'chromium' */
  browser?: 'chromium' | 'firefox' | 'webkit';
}

interface ExtractedElement {
  tag: string;
  dataBg: string | null;
  dataStack: string | null;
  dataVision: string | null;
  inlineStyle: string;
}

/**
 * Audits a live URL by launching a Playwright browser, extracting DOM context
 * attributes and inline style CSS vars, then running the DOM audit.
 *
 * @throws if `playwright` is not installed.
 */
export async function auditURL(
  url: string,
  registry: TokenRegistry,
  options: PlaywrightAuditOptions = {},
): Promise<AuditResult> {
  // Dynamic import so Playwright is an optional peer dep
  interface PlaywrightModule {
    chromium: BrowserType;
    firefox: BrowserType;
    webkit: BrowserType;
  }
  interface BrowserType {
    launch(): Promise<Browser>;
  }
  interface Browser {
    newPage(opts?: { viewport?: { width: number; height: number } }): Promise<Page>;
    close(): Promise<void>;
  }
  interface Page {
    goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
    evaluate<T>(fn: () => T): Promise<T>;
  }

  let pw: PlaywrightModule;
  try {
    // @ts-ignore – optional peer dep, not listed in package.json
    pw = await import('playwright') as unknown as PlaywrightModule;
  } catch {
    throw new Error(
      '[gamut-all/audit] Playwright is not installed. Run: pnpm add -D playwright'
    );
  }

  const browserType = options.browser ?? 'chromium';
  const browser = await pw[browserType].launch();
  const page = await browser.newPage({
    viewport: { width: options.width ?? 1280, height: options.height ?? 720 },
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    const elements: ExtractedElement[] = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*')).map(el => ({
        tag: el.tagName.toLowerCase(),
        dataBg: el.getAttribute('data-bg'),
        dataStack: el.getAttribute('data-stack'),
        dataVision: el.getAttribute('data-vision'),
        inlineStyle: el.getAttribute('style') ?? '',
      }));
    });

    // Build a synthetic DOM for the runner to traverse
    const root = buildSyntheticDOM(elements);
    const { auditDOM } = await import('./runner.js');
    return auditDOM(root, registry);
  } finally {
    await browser.close();
  }
}

/** Builds a flat synthetic DOM from extracted elements for the runner. */
function buildSyntheticDOM(elements: ExtractedElement[]): Element {
  const root = document.createElement('div');
  for (const el of elements) {
    const node = document.createElement(el.tag);
    if (el.dataBg !== null) node.setAttribute('data-bg', el.dataBg);
    if (el.dataStack !== null) node.setAttribute('data-stack', el.dataStack);
    if (el.dataVision !== null) node.setAttribute('data-vision', el.dataVision);
    if (el.inlineStyle) node.setAttribute('style', el.inlineStyle);
    root.appendChild(node);
  }
  return root;
}
