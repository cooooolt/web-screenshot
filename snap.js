const { chromium } = require("playwright");
const sharp = require("sharp");
const path = require("path");
const os = require("os");
const dns = require("dns");

(async () => {
  const rawArgs = process.argv.slice(2);
  const diagnose = rawArgs.includes("--diagnose");
  const waitArg = rawArgs.find((arg) => arg.startsWith("--wait="));
  const waitUntil = waitArg ? waitArg.split("=")[1] : "domcontentloaded";
  const waitForArg = rawArgs.find((arg) => arg.startsWith("--wait-for="));
  const waitForSelector = waitForArg ? waitForArg.slice("--wait-for=".length) : null;
  const args = rawArgs.filter(
    (arg) =>
      arg !== "--diagnose" &&
      !arg.startsWith("--wait=") &&
      !arg.startsWith("--wait-for="),
  );
  const rawInput = args[0];
  const method = args[1] || "native"; // Default to native method

  if (!rawInput) {
    console.error("Usage: node snap.js <URL> [method] [--diagnose] [--wait=domcontentloaded|load|networkidle] [--wait-for=<selector>]");
    console.error("Methods: native (default) - for regular pages, stitched - for animated/lazy pages");
    process.exit(1);
  }

  if (!["native", "stitched"].includes(method)) {
    console.error("Invalid method. Use 'native' or 'stitched'");
    process.exit(1);
  }

  if (!["domcontentloaded", "load", "networkidle"].includes(waitUntil)) {
    console.error("Invalid wait mode. Use domcontentloaded, load, or networkidle");
    process.exit(1);
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawInput);
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/|$)/i.test(rawInput);
  const isPrivateIPv4 = /^(10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?(\/|$)/.test(rawInput);
  const inferredProtocol = (isLoopback || isPrivateIPv4) ? "http" : "https";
  const targetUrl = hasProtocol ? rawInput : `${inferredProtocol}://${rawInput}`;

  if (!hasProtocol) {
    console.log(`No protocol provided, using: ${targetUrl}`);
  }

  const cleanFileName = targetUrl
    .replace(/^https?:\/\//, "")
    .replace(/\//g, "_")
    .replace(/[?#:]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");

  const runDiagnostics = async (context, finalUrl) => {
    console.log("Diagnostics enabled:");
    const proxyVars = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "no_proxy",
    ];
    proxyVars.forEach((key) => {
      const value = process.env[key];
      if (value) console.log(`  ${key}=${value}`);
    });

    try {
      const hostname = new URL(finalUrl).hostname;
      const addresses = await dns.promises.lookup(hostname, { all: true });
      const ipList = addresses.map((a) => a.address).join(", ");
      console.log(`  DNS ${hostname} -> ${ipList}`);
    } catch (err) {
      console.log(`  DNS lookup failed: ${err.message}`);
    }

    try {
      const response = await context.request.get("https://api.ipify.org", {
        timeout: 30000,
      });
      const ip = (await response.text()).trim();
      console.log(`  Playwright egress IP -> ${ip}`);
    } catch (err) {
      console.log(`  Egress IP check failed: ${err.message}`);
    }
  };

  const outputFilename = path.join(
    os.homedir(),
    "Downloads",
    `${cleanFileName}.avif`,
  );

  const browser = await chromium.launch();
  const scaleFactor = 2; // Retina resolution

  if (method === "native") {
    // Native full page capture - good for regular pages
    const context = await browser.newContext({
      viewport: { width: 1536, height: 960 },
      deviceScaleFactor: scaleFactor,
    });
    if (diagnose) await runDiagnostics(context, targetUrl);
    const page = await context.newPage();

    console.log(`Navigating to: ${targetUrl} (using native method)`);
    try {
      await page.goto(targetUrl, { waitUntil, timeout: 60000 });
      if (waitForSelector) {
        console.log(`Waiting for selector: ${waitForSelector}`);
        await page.waitForSelector(waitForSelector, { timeout: 60000 });
      }

      // Smart Scroll - Trigger lazy loading without manual stitching
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0); // Scroll back to top for clean header
              resolve();
            }
          }, 100);
        });
      });

      // Wait for any remaining animations or re-renders
      await new Promise((r) => setTimeout(r, 2000));

      // Capture the entire page natively
      console.log(`Capturing full page natively...`);
      const buffer = await page.screenshot({ fullPage: true });
      await sharp(buffer).avif({ quality: 80 }).toFile(outputFilename);

      console.log(`🎉 Success! Saved to Downloads: ${cleanFileName}.avif`);
    } catch (err) {
      console.error("❌ Error:", err);
      process.exit(1);
    } finally {
      await browser.close();
    }
  } else if (method === "stitched") {
    // Stitched capture - good for animated or lazy-loaded pages
    const context = await browser.newContext({
      viewport: { width: 1536, height: 1000 },
      deviceScaleFactor: scaleFactor,
    });
    if (diagnose) await runDiagnostics(context, targetUrl);
    const page = await context.newPage();

    console.log(`Navigating to: ${targetUrl} (using stitched method)`);
    try {
      await page.goto(targetUrl, { waitUntil, timeout: 60000 });
      if (waitForSelector) {
        console.log(`Waiting for selector: ${waitForSelector}`);
        await page.waitForSelector(waitForSelector, { timeout: 60000 });
      }

      // Wait for dynamic content initialization
      await new Promise((r) => setTimeout(r, 2000));

      const totalHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = 1000;

      console.log(`Total page height: ${totalHeight}px`);

      if (totalHeight <= viewportHeight) {
        console.log(`Page is small, using simple capture...`);
        const buffer = await page.screenshot({ fullPage: true });
        await sharp(buffer).avif({ quality: 80 }).toFile(outputFilename);
      } else {
        // For large pages, use stitched method
        const buffers = [];
        let currentScroll = 0;

        // Scroll and capture segments
        while (currentScroll < totalHeight) {
          const remainingHeight = totalHeight - currentScroll;
          const captureHeight = Math.min(viewportHeight, remainingHeight);
          let scrollY = currentScroll;

          await page.evaluate((y) => window.scrollTo(0, y), scrollY);
          await new Promise((r) => setTimeout(r, 1200));

          console.log(
            `Capturing: ${Math.round((currentScroll / totalHeight) * 100)}%`,
          );
          const buffer = await page.screenshot({ fullPage: false });

          buffers.push({
            input: buffer,
            top: Math.round(scrollY * scaleFactor),
            left: 0,
          });

          currentScroll += captureHeight;
          if (currentScroll >= totalHeight) break;
        }

        // Composite all buffers into one high-res image
        console.log(`Stitching ${buffers.length} segments into: ${outputFilename}`);
        await sharp({
          create: {
            width: 1536 * scaleFactor,
            height: Math.ceil(totalHeight * scaleFactor),
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
          limitInputPixels: false,
        })
          .composite(buffers)
          .avif({ quality: 80 })
          .toFile(outputFilename);
      }

      console.log(`🎉 Success! Saved to Downloads: ${cleanFileName}.avif`);
    } catch (err) {
      console.error("Error during execution:", err.message);
      process.exit(1);
    } finally {
      await browser.close();
    }
  }
})();
