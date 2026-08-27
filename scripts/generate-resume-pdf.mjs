import { spawn } from "node:child_process";
import { constants, createReadStream } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outputName = "Maksim-Tretikov-Resume.pdf";
const outputPath = join(dist, outputName);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const delay = (milliseconds) => new Promise((resolveDelay) => {
  setTimeout(resolveDelay, milliseconds);
});

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function createDistServer() {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://resume.local");
      const requested = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      const candidate = resolve(dist, requested || "index.html");
      const insideDist = candidate === dist || candidate.startsWith(`${dist}${sep}`);

      if (!insideDist) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const filePath = await isFile(candidate) ? candidate : join(dist, "index.html");
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
}

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The résumé preview server did not expose a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function findChrome() {
  const programFiles = process.env.PROGRAMFILES;
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    programFiles && join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next conventional Chrome location.
    }
  }

  throw new Error(
    "Google Chrome is required to generate the résumé PDF. "
    + "Install Chrome or set CHROME_BIN to its executable path.",
  );
}

async function waitForDevToolsPort(profileDirectory, chrome, chromeLog, chromeError) {
  const portFile = join(profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (chromeError()) {
      throw new Error(`Could not launch Chrome: ${chromeError().message}`);
    }
    if (chrome.exitCode != null) {
      throw new Error(`Chrome exited before DevTools was ready.\n${chromeLog()}`);
    }

    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split(/\s+/);
      if (/^\d+$/.test(port) && Number(port) > 0) return Number(port);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await delay(50);
  }

  throw new Error(`Timed out waiting for Chrome DevTools.\n${chromeLog()}`);
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Map();

    socket.addEventListener("message", (event) => this.onMessage(event.data));
    socket.addEventListener("close", () => this.failAll("Chrome DevTools disconnected."));
    socket.addEventListener("error", () => this.failAll("Chrome DevTools failed."));
  }

  onMessage(data) {
    const message = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString());
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    const waiter = this.waiters.get(message.method);
    if (!waiter) return;
    this.waiters.delete(message.method);
    clearTimeout(waiter.timer);
    waiter.resolve(message.params);
  }

  send(method, params = {}, timeout = 30_000) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`Timed out waiting for ${method}.`));
      }, timeout);
      this.pending.set(id, { reject: rejectSend, resolve: resolveSend, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeout = 30_000) {
    return new Promise((resolveWait, rejectWait) => {
      const timer = setTimeout(() => {
        this.waiters.delete(method);
        rejectWait(new Error(`Timed out waiting for ${method}.`));
      }, timeout);
      this.waiters.set(method, { reject: rejectWait, resolve: resolveWait, timer });
    });
  }

  failAll(message) {
    const error = new Error(message);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
    this.waiters.clear();
  }

  close() {
    this.socket.close();
  }
}

async function connectToPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Chrome refused to create a PDF tab (${response.status}).`);
  }

  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      callback(value);
    };
    const onOpen = () => finish(resolveOpen);
    const onError = () => finish(
      rejectOpen,
      new Error("Could not connect to Chrome DevTools."),
    );
    const timer = setTimeout(() => {
      finish(rejectOpen, new Error("Timed out connecting to Chrome DevTools."));
    }, 10_000);
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
  });
  return new CdpConnection(socket);
}

function evaluationError(result) {
  const details = result.exceptionDetails;
  if (!details) return null;
  return details.exception?.description ?? details.text ?? "The résumé page failed to initialize.";
}

function validatePdf(pdf) {
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Chrome did not return a PDF document.");
  }

  const source = pdf.toString("latin1");
  const pages = source.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  const letter = /\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+612(?:\.0+)?\s+792(?:\.0+)?\s*]/.test(source);
  const tagged = /\/Marked\s+true\b/.test(source) && source.includes("/StructTreeRoot");

  if (pages !== 1) throw new Error(`Expected one résumé page; Chrome produced ${pages}.`);
  if (!letter) throw new Error("The résumé PDF is not US Letter size.");
  if (!tagged) throw new Error("The résumé PDF is missing its tagged document structure.");
}

function waitForChromeExit(chrome, timeout) {
  if (chrome.exitCode != null || chrome.signalCode != null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const finish = (exited) => {
      clearTimeout(timer);
      chrome.off("exit", onExit);
      resolveExit(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeout);
    chrome.once("exit", onExit);
  });
}

async function stopChrome(chrome) {
  if (!chrome || chrome.exitCode != null || chrome.signalCode != null) return;
  const gracefulExit = waitForChromeExit(chrome, 2_000);
  chrome.kill("SIGTERM");
  if (await gracefulExit) return;

  const forcedExit = waitForChromeExit(chrome, 2_000);
  chrome.kill("SIGKILL");
  await forcedExit;
}

const server = createDistServer();
let chrome;
let connection;
let profileDirectory;
let temporaryOutput;

try {
  const origin = await listen(server);
  const chromePath = await findChrome();
  profileDirectory = await mkdtemp(join(tmpdir(), "max-resume-pdf-"));
  let stderr = "";
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let spawnError;
  chrome.once("error", (error) => {
    spawnError = error;
  });
  chrome.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });

  const port = await waitForDevToolsPort(
    profileDirectory,
    chrome,
    () => stderr,
    () => spawnError,
  );
  connection = await connectToPage(port);
  await connection.send("Page.enable");
  await connection.send("Runtime.enable");
  const loaded = connection.waitFor("Page.loadEventFired");
  await connection.send("Page.navigate", { url: `${origin}/resume` });
  await loaded;
  await connection.send("Emulation.setEmulatedMedia", { media: "print" });

  const ready = await connection.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `
      (async () => {
        const deadline = performance.now() + 15000;
        while (
          (!document.querySelector('.resume-document')
            || document.documentElement.dataset.view !== 'resume')
          && performance.now() < deadline
        ) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        if (
          !document.querySelector('.resume-document')
          || document.documentElement.dataset.view !== 'resume'
        ) {
          throw new Error('The résumé route did not render.');
        }
        await document.fonts.ready;
        const loadedFontFamilies = new Set(
          [...document.fonts]
            .filter((font) => font.status === 'loaded')
            .map((font) => font.family.replace(/^['"]|['"]$/g, '')),
        );
        if (
          !document.fonts.check('16px "Space Grotesk"')
          || !document.fonts.check('16px "Space Mono"')
          || !loadedFontFamilies.has('Space Grotesk')
          || !loadedFontFamilies.has('Space Mono')
        ) {
          throw new Error('The résumé fonts did not load.');
        }
        await Promise.all(
          [...document.images].map((image) => image.complete ? undefined : image.decode()),
        );
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        return document.querySelector('#resume-name')?.textContent;
      })()
    `,
    returnByValue: true,
  });
  const readyError = evaluationError(ready);
  if (readyError) throw new Error(readyError);
  if (!ready.result?.value || !/maksim/i.test(ready.result.value)) {
    throw new Error("The résumé name was not present before PDF generation.");
  }

  const result = await connection.send("Page.printToPDF", {
    displayHeaderFooter: false,
    generateTaggedPDF: true,
    landscape: false,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paperHeight: 11,
    paperWidth: 8.5,
    preferCSSPageSize: true,
    printBackground: true,
    scale: 1,
    transferMode: "ReturnAsBase64",
  });
  const pdf = Buffer.from(result.data, "base64");
  validatePdf(pdf);

  temporaryOutput = join(dist, `.${outputName}.${process.pid}.tmp`);
  await writeFile(temporaryOutput, pdf);
  await rename(temporaryOutput, outputPath);
  temporaryOutput = null;
  console.log(`Generated dist/${outputName} (${Math.ceil(pdf.length / 1024)} KiB)`);
} finally {
  connection?.close();
  await stopChrome(chrome);
  if (server.listening) {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
  if (temporaryOutput) await rm(temporaryOutput, { force: true });
  if (profileDirectory) await rm(profileDirectory, { force: true, recursive: true });
}
