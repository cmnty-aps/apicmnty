import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import net from "net";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";

interface ApiLog {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
}

const app = express();
const PORT = 3000;

app.set("json spaces", 2);
app.use(express.json());

// Strict workspace & server protection middleware to prevent source/secret leaks (anti-hacker)
app.use((req, res, next) => {
  const normalizedPath = decodeURIComponent(req.path).toLowerCase();
  
  // Specific files containing backend source or configuration secrets
  const blockedFiles = [
    "server.ts",
    ".env",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "metadata.json",
    "components.json",
    "vite.config.ts",
    "firestore.rules",
    "firebase-blueprint.json"
  ];
  
  // Block any path containing or matching these crucial environment / source files
  const isBlockedFile = blockedFiles.some(file => 
    normalizedPath === `/${file}` || 
    normalizedPath.endsWith(`/${file}`) || 
    normalizedPath.includes(`/${file}/`)
  );

  // Block forbidden extensions
  const blockedExtensions = [".env", ".yml", ".yaml", ".sh", ".git", ".gitignore", ".bat", ".cmd"];
  const isBlockedExtension = blockedExtensions.some(ext => normalizedPath.endsWith(ext));

  // In production, also block direct access to typescript/source folders
  const isProductionSourceLeak = process.env.NODE_ENV === "production" && 
                                 (normalizedPath.endsWith(".ts") || 
                                  normalizedPath.endsWith(".tsx") || 
                                  normalizedPath.includes("/src/") ||
                                  normalizedPath.startsWith("/src/"));

  if (isBlockedFile || isBlockedExtension || isProductionSourceLeak) {
    console.warn(`[Security Alert] Blocked suspicious request to: ${req.originalUrl} from IP: ${req.ip}`);
    return res.status(403).json({
      status: false,
      statusCode: 403,
      author: "@cmnty - Public-api",
      message: "Access Forbidden - Target resource is a restricted security file."
    });
  }

  // Expanded Protection against Automated Vulnerability Scanners, Bot Crawlers, and Exploits
  // Skip scans inside the static file serving uploads directory /cfiles/ to preserve legitimate downloads
  const isCfilesPath = normalizedPath.startsWith("/cfiles/");
  if (!isCfilesPath) {
    // 1. CMS and WordPress exploits probe patterns
    const cmsKeywords = [
      "/wp-admin",
      "/wp-content",
      "/wp-includes",
      "/wp-json",
      "xmlrpc.php",
      "wp-login.php",
      "/wp-",
      "index.php",
      "/joomla",
      "/drupal"
    ];

    // 2. Control panels, workspace artifacts, database leaks, or cloud provider configuration files
    const infraKeywords = [
      "/workspaces/",
      "/webhook-waiting",
      "/webhook-test",
      "/var/task",
      "/v2/",
      "/v3/",
      "/etc/passwd",
      "/webmin",
      "/cpanel",
      "/phpmyadmin",
      "netlify.toml",
      "vercel.json",
      "docker-compose",
      "dockerfile",
      "config.json",
      "configuration.php",
      "database.sql",
      "mysql.sql",
      "backup.sql",
      "dump.sql"
    ];

    const isCmsProbe = cmsKeywords.some(keyword => normalizedPath.includes(keyword));
    const isInfraProbe = infraKeywords.some(keyword => normalizedPath.includes(keyword));

    // 3. Scripting engine or database dump extensions targeted by bots
    const scannerExtensions = [
      ".php", ".php5", ".asp", ".aspx", ".jsp", ".jspx", ".cgi", 
      ".pl", ".sql", ".bak", ".backup", ".sqlite", ".db"
    ];
    const isScannerExtension = scannerExtensions.some(ext => normalizedPath.endsWith(ext));

    if (isCmsProbe || isInfraProbe || isScannerExtension) {
      console.warn(`[Vulnerability Scan Blocked] Blocked scanner attempt to: ${req.originalUrl} from IP: ${req.ip}`);
      return res.status(404).json({
        status: false,
        statusCode: 404,
        author: "@cmnty - Public-api",
        message: "Not Found - The requested resource or endpoint does not exist on this server."
      });
    }
  }
  
  next();
});

// Initialize cfiles folder
const cfilesDir = path.join(process.cwd(), "cfiles");
if (!fs.existsSync(cfilesDir)) {
  fs.mkdirSync(cfilesDir, { recursive: true });
}

// Multer Disk Storage Configuration (random secure IDs, supports any file extension)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, cfilesDir);
  },
  filename: (req, file, cb) => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randomId = "";
    for (let i = 0; i < 12; i++) {
      randomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomId}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB maximum file size
});

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// WebSocket server instance
let wss: WebSocketServer;

// In-memory request logs for the client-facing traffic monitor
const requestLogs: ApiLog[] = [];

// Helper to broadcast to all connected clients
function broadcast(data: any) {
  if (!wss) return;
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Helper to log requests
function logRequest(method: string, url: string, status: number, durationMs: number) {
  const log: ApiLog = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString(),
    method,
    url,
    status,
    durationMs,
  };
  requestLogs.unshift(log);
  if (requestLogs.length > 15) {
    requestLogs.pop();
  }
  
  // Broadcast the new log to all connected clients
  broadcast({ type: "TRAFFIC_LOG", log });
}

// Helper to dynamically detect if a request path targets an API endpoint
function isApiRouteFunc(reqPath: string): boolean {
  if (reqPath === "/" || reqPath === "") return false;

  // Ignore internal metrics, logs, visitor counters, and admin /oji path from registering in public logs
  if (
    reqPath.includes("/v1/logs") || 
    reqPath.includes("visitor") || 
    reqPath.includes("oji") ||
    reqPath.includes("/socket.io")
  ) {
    return false;
  }

  // Ignore HMR and framework source files
  if (
    reqPath.startsWith("/@vite") ||
    reqPath.startsWith("/@fs") ||
    reqPath.startsWith("/src/") ||
    reqPath.startsWith("/node_modules/") ||
    reqPath.startsWith("/index.html") ||
    reqPath.startsWith("/vite.svg")
  ) {
    return false;
  }

  // Ignore common asset file formats automatically
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|json|map|txt|woff|woff2|ttf|mp3|mp4|webp|html|webmanifest)$/i.test(reqPath);
  if (isStaticAsset) {
    return false;
  }

  return true;
}

// Rate Limiter storage
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Security Headers & Rate Limiting Middlewares
app.use((req, res, next) => {
  // Override res.json to guarantee that status, statusCode, and author are serialized at the very top of the JSON payload
  const originalJson = res.json;
  res.json = function (this: any, body: any): any {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const ordered: any = {};
      if ("status" in body) {
        ordered.status = body.status;
      }
      if ("statusCode" in body) {
        ordered.statusCode = body.statusCode;
      }
      if ("author" in body) {
        ordered.author = body.author;
      }
      for (const key of Object.keys(body)) {
        if (key !== "status" && key !== "statusCode" && key !== "author") {
          ordered[key] = body[key];
        }
      }
      return originalJson.call(this, ordered);
    }
    return originalJson.call(this, body);
  };

  // 1. Add standard HTTP Security Headers & CORS for Developer Integration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Download-Options", "noopen");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  // 2. Simple In-Memory Rate Limiting
  // Only apply rate limits to API routes to prevent resource exhaustion and brute-forcing
  const isApiRoute = isApiRouteFunc(req.path);

  if (isApiRoute) {
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const ip = Array.isArray(rawIp) ? rawIp[0] : (rawIp as string).split(",")[0].trim();
    
    const now = Date.now();
    const limitWindowMs = 60 * 1000; // 1 minute window
    const maxRequests = 100; // Limit to 100 requests per minute
    
    let rateData = rateLimitMap.get(ip);
    
    if (!rateData || now > rateData.resetTime) {
      rateData = {
        count: 1,
        resetTime: now + limitWindowMs
      };
      rateLimitMap.set(ip, rateData);
    } else {
      rateData.count++;
      if (rateData.count > maxRequests) {
        return res.status(429).json({
          status: false,
          statusCode: 429,
          author: "@cmnty - Public-api",
          message: "Terlalu banyak permintaan (Too many requests). Keamanan mendeteksi aktivitas mencurigakan. Coba lagi dalam 1 menit."
        });
      }
    }
  }

  next();
});

// Anti-Theft / Anti-Scraping / WebToZip & HTTrack Security Middlewares
app.use((req, res, next) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  
  // List of blocked crawler / scraper / copier user-agents
  const blockedAgents = [
    "webtozip",
    "web2zip",
    "httrack",
    "wget",
    "offline",
    "teleport",
    "sitesucker",
    "webcopier",
    "downloader",
    "cloner",
    "extractor",
    "scrap",
    "crawl",
    "spider",
    "headless",
    "puppeteer"
  ];

  const isBlockedAgent = blockedAgents.some(agent => userAgent.includes(agent));
  
  // Check if any headers contain webtozip, web2zip, or httrack signatures
  const hasSuspiciousHeaders = Object.entries(req.headers).some(([key, val]) => {
    const k = key.toLowerCase();
    const v = String(val).toLowerCase();
    return k.includes("webtozip") || k.includes("web2zip") || k.includes("httrack") ||
           v.includes("webtozip") || v.includes("web2zip") || v.includes("httrack");
  });

  if (isBlockedAgent || hasSuspiciousHeaders) {
    console.warn(`[Security Alert] Blocked scraper/cloner request to: ${req.originalUrl} from IP: ${req.ip}`);
    return res.status(403).json({
      status: false,
      statusCode: 403,
      author: "@cmnty - Public-api",
      message: "Forbidden - Website scraping and cloner tools (WebToZip, HTTrack, web2zip, etc.) are strictly blocked by security protocols."
    });
  }

  next();
});

// Global logger middleware for API routes
app.use((req, res, next) => {
  const start = Date.now();
  
  // Listen for the finish event to log the request once completed
  res.on("finish", () => {
    // Check if path is a dynamic API route using the unified helper
    const isApiCall = isApiRouteFunc(req.path);
    
    // Ignore internal dev calls or static files if needed, but here we track APIs
    if (isApiCall) {
      const duration = Date.now() - start;
      logRequest(req.method, req.originalUrl, res.statusCode, duration);
    }
  });
  
  next();
});

// endpoint to get live request logs
app.get("/api/v1/logs", (req, res) => {
  res.json(requestLogs);
});

// Clear log history
app.post("/api/v1/logs/clear", (req, res) => {
  requestLogs.length = 0;
  res.json({ success: true, message: "Logs cleared" });
});

// Supported providers list
const SUPPORTED_PROVIDERS = {
  berita: ["antara", "cnn", "cnbc", "cnbcindonesia", "ffnews", "tempo", "republika", "okezone", "merdeka", "kompas", "tribunnews", "liputan6", "sindonews"],
};

// Custom error messages mapping
const ERROR_MESSAGES: Record<number, string> = {
  400: "Bad Request - Invalid parameters or missing required fields",
  405: "Method Not Allowed - HTTP method not supported",
  429: "Too Many Requests - Rate limit exceeded",
  500: "Internal Server Error - Server encountered an error",
};

function getErrorMessage(status: number): string {
  return ERROR_MESSAGES[status] || `Terjadi kesalahan pada sistem (HTTP ${status}). Mohon hubungi administrator jika masalah berlanjut.`;
}

/**
 * Helper to recursively remove branding/author fields from upstream data
 * to ensure strictly custom authorship.
 */
function cleanAuthorFields(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanAuthorFields);

  const cleaned: any = {};
  const forbiddenKeys = [
    "creator", "author", "signature", "signature_api", "copyright", 
    "status", "statusCode", "response_time", "responsetime", 
    "exectime", "runtime", "executiontime", "timestamp", "time",
    "createdby", "developer", "poweredby", "powered_by", "credit", "source", "success"
  ];

  for (const [key, value] of Object.entries(obj)) {
    if (!forbiddenKeys.includes(key.toLowerCase())) {
      cleaned[key] = cleanAuthorFields(value);
    }
  }
  return cleaned;
}

// Unified endpoint for news: supports both /api/v1/berita/:provider and /berita/:provider
app.get(["/api/v1/berita/:provider", "/berita/:provider"], async (req, res) => {
  const { provider } = req.params;
  const start = Date.now();
  const lowerProvider = provider.toLowerCase();

  // Map aliases
  let targetProvider = lowerProvider;
  if (lowerProvider === "cnbc") {
    targetProvider = "cnbcindonesia";
  }

  if (!SUPPORTED_PROVIDERS.berita.includes(targetProvider) && !SUPPORTED_PROVIDERS.berita.includes(lowerProvider)) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: ERROR_MESSAGES[400],
      supported: SUPPORTED_PROVIDERS.berita,
    });
  }

  let targetUrl = `https://api.nexray.eu.cc/berita/${targetProvider}`;
  if (targetProvider === "merdeka") {
    targetUrl = "https://api.siputzx.my.id/api/berita/merdeka";
  } else if (targetProvider === "kompas") {
    targetUrl = "https://api.siputzx.my.id/api/berita/kompas";
  } else if (targetProvider === "tribunnews") {
    targetUrl = "https://api.siputzx.my.id/api/berita/tribunnews";
  } else if (targetProvider === "liputan6") {
    targetUrl = "https://api.siputzx.my.id/api/berita/liputan6";
  } else if (targetProvider === "sindonews") {
    targetUrl = "https://api.siputzx.my.id/api/berita/sindonews";
  }

  try {
    const targetRes = await fetch(targetUrl);
    const duration = Date.now() - start;

    const textData = await targetRes.text();
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (e) {
      jsonData = { raw: textData };
    }

    if (!targetRes.ok) {
      const status = targetRes.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
        request_id: Math.random().toString(36).substring(7)
      });
    }

    // Clean data and add custom signature
    const cleanedData = cleanAuthorFields(jsonData);
    const responsePayload = {
      ...cleanedData,
      status: true,
      statusCode: targetRes.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    };

    res.json(responsePayload);
  } catch (error: any) {
    console.error(`Error fetching:`, error.message);

    // Serve resilient mock news as fallback so the workspace never crashes even if nexray is down/slow!
    const mockNews: Record<string, any> = {
      antara: {
        status: 200,
        result: [
          {
            title: "Cmnty API Sukses Mengintegrasikan Layanan",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Gateway Cmnty API berhasil menghubungkan portal informasi ke dalam arsitektur berkinerja tinggi, dilengkapi sistem pemantauan latensi.",
          },
          {
            title: "Pengembang Cmnty Merilis Dashboard API Minimalis Hitam Putih",
            link: "#",
            image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date(Date.now() - 3600000).toISOString(),
            description: "Mengutamakan fungsionalitas murni, workspace API dengan tema monokromatis gelap siber dan pendaran bayangan putih (white glow) ini diluncurkan secara publik hari ini.",
          },
          {
            title: "Analisis Arsitektur API Gateway untuk Menghadapi Beban Trafik Tinggi",
            link: "#",
            image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date(Date.now() - 7200000).toISOString(),
            description: "Arsitektur gateway satu endpoint mempermudah integrasi multi-provider, meminimalkan latensi jaringan, serta meringankan beban parsing di klien.",
          }
        ]
      },
      cnn: {
        status: 200,
        result: [
          {
            title: "Diskusi Pengembangan Ekosistem Pengembang",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Asosiasi teknologi global menekankan relevansi dari standardisasi API di masa depan untuk kelancaran transaksi data lintas platform.",
          }
        ]
      },
      cnbcindonesia: {
        status: 200,
        result: [
          {
            title: "Nilai Tukar Rupiah Menguat Terhadap Dolar AS",
            link: "#",
            image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Sentimen positif pasar atas rilis dashboard API monokromatik terbaru memberikan dorongan segar bagi sektor inovasi finansial lokal.",
          }
        ]
      },
      merdeka: {
        status: 200,
        result: [
          {
            title: "Cmnty API Rilis Fitur Pemantauan Berita Merdeka Secara Instan",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Akses berita peristiwa terpopuler di Indonesia kini terintegrasi penuh lewat portal berkinerja tinggi Cmnty API tanpa API key."
          }
        ]
      },
      kompas: {
        status: 200,
        result: [
          {
            title: "Cmnty API Luncurkan Pemantauan Berita Kompas Tercepat",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Berita aktual dan terpercaya dari rubrik nasional Kompas kini dapat diakses dengan latensi sangat rendah melalui Cmnty API."
          }
        ]
      },
      tribunnews: {
        status: 200,
        result: [
          {
            title: "Cmnty API Mengintegrasikan Portal Berita Regional Tribunnews Terlengkap",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Akses berita aktual regional, nasional, dan lokal dari seluruh jaringan Tribunnews secara andal dengan latensi minimal di Cmnty API."
          }
        ]
      },
      liputan6: {
        status: 200,
        result: [
          {
            title: "Liputan6 Kini Hadir di Cmnty API Secara Real-time",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Dapatkan liputan akurat dan terpercaya dari portal Liputan6.com dengan respon super cepat dari ekosistem Cmnty API."
          }
        ]
      },
      sindonews: {
        status: 200,
        result: [
          {
            title: "Sindonews Kini Terhubung dengan Ekosistem Cmnty API",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Berita terhangat dari Sindonews kini dapat diakses secara instan melalui infrastruktur Cmnty API yang dioptimalkan."
          }
        ]
      }
    };

    const mockResult = mockNews[targetProvider] || mockNews[lowerProvider] || {
      status: 200,
      result: [
        {
          title: `Layanan Berita Terupdate`,
          link: "#",
          image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
          isoDate: new Date().toISOString(),
          description: `Koneksi ke upstream tidak stabil, sehingga Gateway menyajikan cache tangguh yang kaya data.`
        }
      ]
    };

    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      provider: targetProvider,
      isCachedFallback: true,
      message: `Gateway Timeout: Koneksi ke upstream terputus. Menyajikan cache cadangan.`,
      result: mockResult.result || [],
    });
  }
});

// Tools Endpoint: infonegara
app.get(["/api/tools/infonegara", "/tools/infonegara"], async (req, res) => {
  const start = Date.now();
  const name = req.query.name || "Indonesia";
  const targetUrl = `https://api.cuki.biz.id/api/tools/infonegara?apikey=cuki-x&name=${encodeURIComponent(name as string)}`;
  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;

    const textData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (e) {
      jsonData = { raw: textData };
    }

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
        request_id: Math.random().toString(36).substring(7)
      });
    }

    const cleanedData = cleanAuthorFields(jsonData);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: kodepos
app.get(["/api/v1/tools/kodepos", "/tools/kodepos"], async (req, res) => {
  const start = Date.now();
  const form = req.query.form || "jakarta";
  const targetUrl = `https://api.cuki.biz.id/api/tools/kodepos?apikey=cuki-x&form=${encodeURIComponent(form as string)}`;
  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;

    const textData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (e) {
      jsonData = { raw: textData };
    }

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
        request_id: Math.random().toString(36).substring(7)
      });
    }

    // Clean data and add custom signature at top level
    const cleanedData = cleanAuthorFields(jsonData);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: Translate
app.get(["/api/tools/translate", "/tools/translate"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  const source = req.query.source as string || "en";
  const target = req.query.target as string || "id";

  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/tools/translate?text=${encodeURIComponent(text)}&source=${source}&target=${target}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    
    const textData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (e) {
      jsonData = { raw: textData };
    }
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(jsonData);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Translate error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Canvas Endpoint: ektp
app.get(["/api/canvas/ektp", "/canvas/ektp"], async (req, res) => {
  const start = Date.now();
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    queryParams.append(key, value as string);
  }
  
  const targetUrl = `https://api.siputzx.my.id/api/canvas/ektp?${queryParams.toString()}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Canvas error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Proxy for external temporary files (like TTS results)
app.get(["/tmp/:filename", "/api/tmp/:filename"], async (req, res) => {
  const { filename } = req.params;
  const targetUrl = `https://api.nexray.eu.cc/tmp/${filename}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://api.nexray.eu.cc/"
      }
    });
    
    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`Proxy Target Error: ${targetUrl} returned ${response.status}`);
      }
      return res.status(response.status).json({
        status: false,
        message: "File tidak ditemukan atau telah kedaluwarsa.",
      });
    }
    
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    
    // Use stream instead of arrayBuffer for efficiency
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Proxy error:", error.message);
    res.status(502).json({
        status: false,
        message: "Proxy error: " + error.message
    });
  }
});

// Helper for Gemini 3.1 Flash image upload
async function uploadTmplink(buffer: Buffer, fileName: string = "image.png") {
  try {
    const formData = new FormData();
    const fileBlob = new Blob([buffer], { type: "image/png" });
    formData.append("file", fileBlob, fileName);

    const res = await fetch("https://tmpfile.link/api/upload", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://tmpfile.link",
        "Referer": "https://tmpfile.link/index-id"
      },
      body: formData
    });

    if (!res.ok) {
      throw new Error(`tmpfile.link error. Status: ${res.status}`);
    }

    const data: any = await res.json();
    const rawLink = data?.downloadLink || data?.downloadLinkEncoded || "";
    if (!rawLink) return { status: false, message: "Gagal mendapatkan link" };

    return { status: true, url: rawLink };
  } catch (e: any) {
    return { status: false, message: e.message };
  }
}

// AI Endpoint: gemini-3-1-flash
app.get(["/api/ai/gemini-3-1-flash", "/ai/gemini-3-1-flash", "/api/ai/gemini31", "/ai/gemini31"], async (req, res) => {
  const start = Date.now();
  const text = (req.query.text || req.query.prompt || req.query.question) as string;
  const image = req.query.image as string;

  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' or 'prompt' is required",
    });
  }

  const EMAIL = "dac0fe80@web-library.net";
  const PASSWORD = "kyynzz_123";

  try {
    let imageUrlsArray: string[] = [];

    if (image) {
      try {
        const imgRes = await fetch(image);
        if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer();
          const uploadResult = await uploadTmplink(Buffer.from(imgBuffer), "image.png");
          if (uploadResult.status && uploadResult.url) {
            imageUrlsArray.push(uploadResult.url);
          }
        }
      } catch (e: any) {
        console.error("Gagal memproses image URL:", e.message);
      }
    }

    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
      "Referer": "https://notegpt.io/",
      "Origin": "https://notegpt.io"
    };

    const loginUrl = "https://notegpt.io/api/v1/auth/email/login";
    const loginRes = await fetch(loginUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });

    if (!loginRes.ok) {
      throw new Error(`Gagal login ke notegpt. Status: ${loginRes.status}`);
    }

    const loginData: any = await loginRes.json();
    const accessToken = loginData?.data?.access_token;

    if (!accessToken) {
      throw new Error("Gagal mendapatkan token akses dari notegpt.io");
    }

    const conversationId = crypto.randomUUID();
    const streamUrl = "https://notegpt.io/api/v2/chat/stream";
    const response = await fetch(streamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken,
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
        "Referer": "https://notegpt.io/",
        "Origin": "https://notegpt.io"
      },
      body: JSON.stringify({
        message: text,
        language: "auto",
        model: "gemini-3.1-flash-lite-preview",
        tone: "default",
        length: "moderate",
        conversation_id: conversationId,
        image_urls: imageUrlsArray,
        history_messages: [],
        chat_mode: "standard"
      })
    });

    if (!response.ok) {
      throw new Error(`notegpt stream gagal. Status: ${response.status}`);
    }

    let fullText = "";
    const reader = response.body;
    if (reader) {
      const bodyReader = reader as any;
      let buffer = "";
      for await (const chunk of bodyReader) {
        buffer += Buffer.from(chunk).toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const dataContent = trimmed.substring(5).trim();
          try {
            const parsed = JSON.parse(dataContent);
            if (parsed.done === true) break;
            if (parsed.text) {
              fullText += parsed.text;
            }
          } catch (e) {}
        }
      }
    }

    const duration = Date.now() - start;
    res.json({
      status: true,
      statusCode: 200,
      author: "@cmnty - Public-api",
      result: fullText,
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Gemini 3.1 Flash error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: error.message || "Gagal berkomunikasi dengan chatbot AI.",
    });
  }
});

// AI Endpoint: gemini
app.get(["/api/ai/gemini", "/ai/gemini"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/gemini?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Gemini error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: gpt-3.5-turbo
app.get(["/api/ai/gpt-3.5-turbo", "/ai/gpt-3.5-turbo"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/gpt-3.5-turbo?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("GPT-3.5 Turbo error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: ideogram
app.get(["/api/ai/ideogram", "/ai/ideogram"], async (req, res) => {
  const start = Date.now();
  const prompt = req.query.prompt as string;
  
  if (!prompt) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'prompt' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/ideogram?prompt=${encodeURIComponent(prompt)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    if (contentType.includes("image")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(Buffer.from(buffer));
    }

    const duration = Date.now() - start;
    const data = await response.json();
    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Ideogram error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: Text to Image (GenMyArt WP AJAX)
app.get(["/api/ai/text2image", "/ai/text2image", "/api/ai/text2img", "/ai/text2img"], async (req, res) => {
  const start = Date.now();
  const prompt = req.query.prompt as string;
  const style = (req.query.style as string) || "photorealistic";
  const resolution = (req.query.resolution as string) || "1024x1024";
  const aspectRatio = (req.query.aspectRatio as string) || "square";
  const numImagesStr = req.query.numImages as string;
  const raw = req.query.raw === "true";

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'prompt' is required",
    });
  }

  const STYLES = ["photorealistic", "digital-art", "impressionist", "anime", "fantasy", "sci-fi", "vintage", "watercolor", "ghibli", "cyberpunk", "surrealist", "minimalist", "baroque"];
  const RESOLUTIONS = ["512x512", "768x768", "1024x1024", "1280x720", "1920x1080", "2560x1440", "3840x2160"];
  const ASPECT_RATIOS = ["square", "portrait", "landscape"];

  if (!STYLES.includes(style)) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: `Style tidak valid. Pilihan: ${STYLES.join(", ")}`,
    });
  }

  if (!RESOLUTIONS.includes(resolution)) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: `Resolution tidak valid. Pilihan: ${RESOLUTIONS.join(", ")}`,
    });
  }

  if (!ASPECT_RATIOS.includes(aspectRatio)) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: `Aspect ratio tidak valid. Pilihan: ${ASPECT_RATIOS.join(", ")}`,
    });
  }

  let numImages = 1;
  if (numImagesStr) {
    const parsed = parseInt(numImagesStr, 10);
    if (!isNaN(parsed)) {
      numImages = Math.max(1, Math.min(6, parsed));
    }
  }

  try {
    // 1. Get nonce from genmyart homepage
    const homepageRes = await fetch("https://genmyart.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    if (!homepageRes.ok) {
      throw new Error(`Gagal memuat halaman genmyart. Status: ${homepageRes.status}`);
    }
    const htmlText = await homepageRes.text();
    const nonceMatch = htmlText.match(/_ajax_nonce\s*:\s*['"]([a-f0-9]+)['"]/i);
    if (!nonceMatch) {
      throw new Error("Nonce tidak ditemukan pada website source");
    }
    const nonce = nonceMatch[1];

    // 2. POST to WP admin-ajax
    const postParams = new URLSearchParams();
    postParams.append("action", "generate_ai_image");
    postParams.append("ai_prompt", prompt);
    postParams.append("ai_style", style);
    postParams.append("ai_resolution", resolution);
    postParams.append("ai_aspect_ratio", aspectRatio);
    postParams.append("ai_num_images", String(numImages));
    postParams.append("_ajax_nonce", nonce);

    const ajaxRes = await fetch("https://genmyart.com/wp-admin/admin-ajax.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://genmyart.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      body: postParams.toString()
    });

    if (!ajaxRes.ok) {
      throw new Error(`WordPress server returned error. Status: ${ajaxRes.status}`);
    }

    const resultData: any = await ajaxRes.json();
    if (!resultData.success) {
      throw new Error(resultData.message || resultData.data?.message || "Generate gagal");
    }

    const images = resultData.images || [];

    if (images.length > 0) {
      const firstImg = images[0];
      const imageUrl = typeof firstImg === "string" ? firstImg : firstImg.url;
      if (imageUrl) {
        const imageFetch = await fetch(imageUrl);
        if (imageFetch.ok) {
          const contentType = imageFetch.headers.get("content-type") || "image/png";
          const buffer = await imageFetch.arrayBuffer();
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=3600");
          return res.send(Buffer.from(buffer));
        }
      }
    }

    throw new Error("Gagal mengambil gambar hasil generate atau tidak ditemukan gambar.");
  } catch (error: any) {
    console.error("Text to Image error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: error.message || "Gagal menghasilkan gambar dari teks.",
    });
  }
});

// ImageGPT helpers
function generateRandomIPForImageGPT() {
  const ranges = [
    [1, 1], [2, 2], [5, 5], [23, 23], [27, 27], [31, 31], [36, 36], [37, 37], [39, 39], [42, 42],
    [46, 46], [49, 49], [50, 50], [60, 60], [114, 114], [117, 117], [118, 118], [119, 119], [120, 120],
    [121, 121], [122, 122], [123, 123], [124, 124], [125, 125], [126, 126], [180, 180], [182, 182], [183, 183]
  ];
  const range = ranges[Math.floor(Math.random() * ranges.length)];
  const ip = [
    range[0],
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256)
  ].join('.');
  return ip;
}

async function getGuestIdForImageGPT(spoofedIp: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 9; CPH2083 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36',
    'X-Forwarded-For': spoofedIp,
    'X-Real-IP': spoofedIp,
    'Client-IP': spoofedIp,
    'True-Client-IP': spoofedIp,
    'X-Originating-IP': spoofedIp,
    'X-Cluster-Client-IP': spoofedIp,
    'Forwarded': `for=${spoofedIp}`
  };
  try {
    const response = await fetch('https://imagegpt.org/app/photo/generator', { headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/guest_id=([^;]+)/);
      if (match) {
        return match[1];
      }
    }
    if (typeof response.headers.getSetCookie === 'function') {
      const cookies = response.headers.getSetCookie();
      for (const cookie of cookies) {
        const match = cookie.match(/guest_id=([^;]+)/);
        if (match) return match[1];
      }
    }
  } catch (e) {
    console.error("Gagal mendapatkan Guest ID ImageGPT:", e);
  }
  return null;
}

async function imageUrlToBase64ForImageGPT(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh gambar untuk edit. Status: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

// AI Endpoint: ImageGPT
app.get(["/api/ai/imagegpt", "/ai/imagegpt"], async (req, res) => {
  const start = Date.now();
  const action = (req.query.action as string) || "generate";
  const prompt = req.query.prompt as string;
  const negative_prompt = (req.query.negative_prompt as string) || "";
  const model = (req.query.model as string) || "flux-schnell";
  const widthStr = req.query.width as string;
  const heightStr = req.query.height as string;
  const image = req.query.image as string; // URL gambar untuk edit
  const raw = req.query.raw === "true";

  const spoofedIp = generateRandomIPForImageGPT();

  if (action === "model_list") {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; CPH2083 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36',
        'Referer': 'https://imagegpt.org/app/photo/generator',
        'X-Forwarded-For': spoofedIp,
        'X-Real-IP': spoofedIp,
        'Client-IP': spoofedIp,
        'True-Client-IP': spoofedIp,
        'X-Originating-IP': spoofedIp,
        'X-Cluster-Client-IP': spoofedIp,
        'Forwarded': `for=${spoofedIp}`
      };
      const response = await fetch('https://imagegpt.org/api/models', { headers });
      if (!response.ok) {
        throw new Error(`Gagal mengambil model: ${response.status}`);
      }
      const data = await response.json();
      const duration = Date.now() - start;
      return res.json({
        status: true,
        statusCode: 200,
        author: "@cmnty - Public-api",
        result: data,
        responseTimeMs: duration,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      return res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: error.message || "Gagal mengambil daftar model ImageGPT."
      });
    }
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'prompt' is required",
    });
  }

  let width = 1024;
  let height = 1024;
  if (widthStr) {
    const val = parseInt(widthStr, 10);
    if (!isNaN(val)) width = val;
  }
  if (heightStr) {
    const val = parseInt(heightStr, 10);
    if (!isNaN(val)) height = val;
  }

  if (action === "edit" && !image) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'image' URL is required for 'edit' action",
    });
  }

  try {
    const guestId = await getGuestIdForImageGPT(spoofedIp);
    const cookie = guestId ? `guest_id=${guestId};` : '';
    const endpoint = action === 'edit' ? 'https://imagegpt.org/api/edit' : 'https://imagegpt.org/api/generate';

    const body: Record<string, any> = {
      prompt,
      negative_prompt,
      model,
      style: "none",
      width: width,
      height: height,
      num_images: 1,
      quality: "auto"
    };

    if (action === 'edit' && image) {
      body.image = await imageUrlToBase64ForImageGPT(image);
    }

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 9; CPH2083 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36',
      'Referer': 'https://imagegpt.org/app/photo/generator',
      'X-Forwarded-For': spoofedIp,
      'X-Real-IP': spoofedIp,
      'Client-IP': spoofedIp,
      'True-Client-IP': spoofedIp,
      'X-Originating-IP': spoofedIp,
      'X-Cluster-Client-IP': spoofedIp,
      'Forwarded': `for=${spoofedIp}`,
      'Cookie': cookie
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gagal generate image. Status: ${response.status}. Detail: ${errorText}`);
    }

    const data: any = await response.json();
    
    if (!data.success || !data.images || data.images.length === 0) {
      throw new Error(data.error || 'Server tidak mengembalikan gambar.');
    }

    const imageStr = data.images[0];
    const base64Data = imageStr.includes(',') ? imageStr.split(',')[1] : imageStr;
    const buffer = Buffer.from(base64Data, 'base64');

    let mimeType = "image/png";
    const match = imageStr.match(/^data:([^;]+);base64,/);
    if (match) {
      mimeType = match[1];
    }
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  } catch (error: any) {
    console.error("ImageGPT error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: error.message || "Gagal memproses gambar menggunakan ImageGPT.",
    });
  }
});

// AI Endpoint: image2prompt
app.get(["/api/ai/image2prompt", "/ai/image2prompt"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/image2prompt?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Image2Prompt error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: dreamanalyze
app.get(["/api/ai/dreamanalyze", "/ai/dreamanalyze"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/dreamanalyze?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Dream Analyze error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: felo
app.get(["/api/ai/felo", "/ai/felo"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/felo?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Felo error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: gemini-tts
app.get(["/api/ai/gemini-tts", "/ai/gemini-tts"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/gemini-tts?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite target URLs to use local proxy
    if (typeof cleanedData.result === "string" && cleanedData.result.includes("api.nexray.eu.cc/tmp/")) {
       const url = new URL(cleanedData.result);
       const protocol = req.headers["x-forwarded-proto"] || req.protocol;
       const host = req.headers["x-forwarded-host"] || req.get("host");
       cleanedData.result = `${protocol}://${host}${url.pathname}`;
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Gemini TTS error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: dolphin
app.get(["/api/ai/dolphin", "/ai/dolphin"], async (req, res) => {
  const start = Date.now();
  const { text, template } = req.query;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/dolphin?text=${encodeURIComponent(text as string)}&template=${encodeURIComponent((template as string) || "logical")}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Dolphin error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: andisearch
app.get(["/api/ai/andisearch", "/ai/andisearch"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/andisearch?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Andisearch error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: deepseek
app.get(["/api/ai/deepseek", "/ai/deepseek"], async (req, res) => {
  const start = Date.now();
  const question = req.query.question as string;
  
  if (!question) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'question' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/ai/deepseek?apikey=cuki-x&question=${encodeURIComponent(question)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Deepseek error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

app.get(["/api/ai/deepsearch", "/ai/deepsearch"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/deepsearch?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Deepsearch error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

app.get(["/api/ai/copilot", "/ai/copilot"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/copilot?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Copilot error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: claude
app.get(["/api/ai/claude", "/ai/claude"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/claude?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Claude error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: overchat
app.get(["/api/ai/overchat", "/ai/overchat"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/overchat?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://api.nexray.eu.cc/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const duration = Date.now() - start;
    
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Upstream API returned an HTML page (Cookie check / Anti-bot challenge). Please try again in a few moments."
      });
    }

    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Overchat error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: public
app.get(["/api/ai/public", "/ai/public"], async (req, res) => {
  const start = Date.now();
  const text = req.query.text as string;
  
  if (!text) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'text' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/ai/public?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://api.nexray.eu.cc/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const duration = Date.now() - start;
    
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Upstream API returned an HTML page (Cookie check / Anti-bot challenge). Please try again in a few moments."
      });
    }

    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Public AI error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: bibleai
app.get(["/api/ai/bibleai", "/ai/bibleai"], async (req, res) => {
  const start = Date.now();
  const { question } = req.query;
  
  if (!question) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'question' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/ai/bibleai?apikey=cuki-x&question=${encodeURIComponent(question as string)}&translation=TB`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Bible AI error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Endpoint: nanobanana (Image Editor / Change colors)
app.post(["/api/ai/nanobanana", "/ai/nanobanana"], (req, res) => {
  const start = Date.now();
  
  memoryUpload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: err.message || "Gagal mengunggah berkas gambar."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: "Silakan masukkan berkas gambar dalam field 'image'."
      });
    }

    const param = req.body.param || req.query.param;
    if (!param) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: "Parameter 'param' (instruksi edit gambar) diperlukan."
      });
    }

    try {
      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      formData.append("image", blob, req.file.originalname);
      formData.append("param", param);

      const response = await fetch("https://api.nexray.eu.cc/ai/nanobanana", {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://api.nexray.eu.cc/",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9"
        },
        body: formData
      });

      const contentType = response.headers.get("Content-Type") || "";

      if (contentType.includes("text/html")) {
        return res.status(502).json({
          status: false,
          statusCode: 502,
          author: "@cmnty - Public-api",
          message: "Upstream API returned an HTML page (Cookie check / Anti-bot challenge). Please try again in a few moments."
        });
      }

      if (!response.ok) {
        const status = response.status;
        let errorMessage = "Gagal memproses gambar menggunakan Nanobanana API.";
        try {
          const errData = await response.json();
          if (errData && errData.message) {
            errorMessage = errData.message;
          }
        } catch (_) {}
        return res.status(status).json({
          status: false,
          statusCode: status,
          author: "@cmnty - Public-api",
          message: errorMessage,
        });
      }

      if (contentType.includes("image/")) {
        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(Buffer.from(buffer));
      } else {
        const duration = Date.now() - start;
        const data = await response.json();
        const cleanedData = cleanAuthorFields(data);
        
        const host = req.headers["x-forwarded-host"] || req.get("host");
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        
        const stringified = JSON.stringify(cleanedData);
        const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);
        
        return res.json({
          ...JSON.parse(replaced),
          status: true,
          statusCode: response.status,
          author: "@cmnty - Public-api",
          responseTimeMs: duration,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error("Nanobanana error:", error.message);
      res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Bad Gateway. Gagal memproses gambar menggunakan Nanobanana API.",
      });
    }
  });
});

// GET /api/ai/nanobanana or /ai/nanobanana Guidelines
app.get(["/api/ai/nanobanana", "/ai/nanobanana"], (req, res) => {
  res.json({
    status: true,
    statusCode: 200,
    author: "@cmnty - Public-api",
    message: "Gunakan POST dengan body form-data 'image' (file gambar) dan 'param' (instruksi sunting gambar) untuk memproses menggunakan Nanobanana AI."
  });
});

// AI Endpoint: aimuslim
app.get(["/api/ai/aimuslim", "/ai/aimuslim"], async (req, res) => {
  const start = Date.now();
  const query = req.query.query as string;
  if (!query) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'query' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/ai/aimuslim?apikey=cuki-x&query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("AI Muslim error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// AI Chat: GLM 4.7 Flash
app.get(["/api/ai/glm47flash", "/ai/glm47flash"], async (req, res) => {
  const start = Date.now();
  const prompt = req.query.prompt as string;
  const system = (req.query.system as string) || "You are a helpful assistant.";
  const temperature = req.query.temperature || "0.7";

  if (!prompt) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'prompt' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/ai/glm47flash?prompt=${encodeURIComponent(prompt)}&system=${encodeURIComponent(system)}&temperature=${encodeURIComponent(temperature as string)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("GLM 4.7 Flash error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Canvas Endpoint: susu-taro
app.get(["/api/canvas/susu-taro", "/canvas/susu-taro"], async (req, res) => {
  const imageUrl = req.query.image as string;
  
  if (!imageUrl) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'image' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/canvas/susu-taro?apikey=cuki-x&image=${encodeURIComponent(imageUrl)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate image from source",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Canvas error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Canvas Endpoint: susu-original
app.get(["/api/canvas/susu-original", "/canvas/susu-original"], async (req, res) => {
  const imageUrl = req.query.image as string;
  
  if (!imageUrl) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'image' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/canvas/susu-original?apikey=cuki-x&image=${encodeURIComponent(imageUrl)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate image from source",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Canvas error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Canvas Endpoint: starboy
app.get(["/api/canvas/starboy", "/canvas/starboy"], async (req, res) => {
  const imageUrl = req.query.image as string;
  
  if (!imageUrl) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'image' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/canvas/starboy?apikey=cuki-x&image=${encodeURIComponent(imageUrl)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate image from source",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Starboy Canvas error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: fakedana
app.get(["/api/maker/fakedana", "/maker/fakedana"], async (req, res) => {
  const text = req.query.text as string || "200000";
  const targetUrl = `https://api-nanzz.my.id/docs/api/maker/fake-dana.php?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate DANA image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("FakeDANA Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: fakeovo
app.get(["/api/maker/fakeovo", "/maker/fakeovo"], async (req, res) => {
  const amount = req.query.amount as string || "200000";
  const targetUrl = `https://api.cuki.biz.id/api/maker/fakeovo?apikey=cuki-x&amount=${encodeURIComponent(amount)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate OVO image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("FakeOVO Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: fakeberita
app.get(["/api/maker/fakeberita", "/maker/fakeberita"], async (req, res) => {
  const text = req.query.text as string || "Viral! Jokowi mencuri 19jt lapangan pekerjaan dari anaknya";
  const url = req.query.url as string || "https://www.upload.ee/image/19400325/images.webp";
  const targetUrl = `https://api-nanzz.my.id/docs/api/maker/berita.php?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Berita image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Fake Berita Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: iqc-group
app.get(["/api/maker/iqc-group", "/maker/iqc-group"], async (req, res) => {
  const text = req.query.text as string || "hai kak 🥺👉🏻👈🏻";
  const name = req.query.name as string || "cmnty universe";
  const battery = req.query.battery as string || "100";
  const time = req.query.time as string || "00.00";
  const targetUrl = `https://api.cuki.biz.id/api/maker/iqc-group?apikey=cuki-x&text=${encodeURIComponent(text)}&name=${encodeURIComponent(name)}&battery=${encodeURIComponent(battery)}&time=${encodeURIComponent(time)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate IQC Group image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("IQC Group Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: iqc
app.get(["/api/maker/iqc", "/maker/iqc"], async (req, res) => {
  const text = req.query.text as string || "cmnty the api free";
  const targetUrl = `https://api.nexray.eu.cc/maker/iqc?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate IQC image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("IQC Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: iqc-image
app.get(["/api/maker/iqc-image", "/maker/iqc-image"], async (req, res) => {
  const image = req.query.image as string || "https://c.termai.cc/i176/VPoSY.png";
  const text = req.query.text as string || "https://api.cmnty.web.id";
  const battery = req.query.battery as string || "100";
  const time = req.query.time as string || "00.00";
  const provider = req.query.provider as string || "TELKOMSEL";
  const targetUrl = `https://api.cuki.biz.id/api/maker/iqc-image?apikey=cuki-x&image=${encodeURIComponent(image)}&text=${encodeURIComponent(text)}&battery=${encodeURIComponent(battery)}&time=${encodeURIComponent(time)}&provider=${encodeURIComponent(provider)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate IQC Image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("IQC Image Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: Nulis
app.get(["/api/maker/nulis", "/maker/nulis"], async (req, res) => {
  const text = req.query.text as string || "Detik tak pernah menunggu, Tapi selalu memberi ruang. Untuk mereka yang berani Memulai meski terlambat.";
  const targetUrl = `https://api.nexray.eu.cc/maker/nulis?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Nulis image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Nulis Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: brat
app.get(["/api/maker/brat", "/maker/brat"], async (req, res) => {
  const text = req.query.text as string || "cmnty universe";
  const targetUrl = `https://api.nexray.eu.cc/maker/brat?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Brat image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Brat Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: brathd
app.get(["/api/maker/brathd", "/maker/brathd"], async (req, res) => {
  const text = req.query.text as string || "api.cmnty.web.id aja";
  const targetUrl = `https://api.nexray.eu.cc/maker/brathd?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Brat HD image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Brat HD Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: bratvid
app.get(["/api/maker/bratvid", "/maker/bratvid"], async (req, res) => {
  const text = req.query.text as string || "halo semua, nyari api gratis? yg api.cmnty.web.id solusinya";
  const targetUrl = `https://api.nexray.eu.cc/maker/bratvid?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "video/mp4";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Bratvid",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Bratvid Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: bratvidhd
app.get(["/api/maker/bratvidhd", "/maker/bratvidhd"], async (req, res) => {
  const text = req.query.text as string || "halo semua, nyari api gratis? yg api.cmnty.web.id solusinya";
  const targetUrl = `https://api.nexray.eu.cc/maker/bratvidhd?text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "video/mp4";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Bratvid HD",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Bratvid HD Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: qc
app.get(["/api/maker/qc", "/maker/qc"], async (req, res) => {
  const text = req.query.text as string || "halo semua welcome to api cmnty";
  const name = req.query.name as string || "cmnty";
  const avatar = req.query.avatar as string || "https://c.termai.cc/i176/VPoSY.png";
  const color = req.query.color as string || "kuning";
  const targetUrl = `https://api.nexray.eu.cc/maker/qc?text=${encodeURIComponent(text)}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatar)}&color=${encodeURIComponent(color)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Qc image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Qc Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: smeme
app.get(["/api/maker/smeme", "/maker/smeme"], async (req, res) => {
  const text_atas = req.query.text_atas as string || "halo";
  const text_bawah = req.query.text_bawah as string || "apa kabar";
  const background = req.query.background as string || "https://c.termai.cc/i176/VPoSY.png";
  const targetUrl = `https://api.nexray.eu.cc/maker/smeme?text_atas=${encodeURIComponent(text_atas)}&text_bawah=${encodeURIComponent(text_bawah)}&background=${encodeURIComponent(background)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to generate Smeme image",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Smeme Maker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Maker Endpoint: Emoji-Mix
app.get(["/api/maker/emojimix", "/maker/emojimix"], async (req, res) => {
  const start = Date.now();
  const emoji1 = req.query.emoji1 as string;
  const emoji2 = req.query.emoji2 as string;

  if (!emoji1 || !emoji2) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameters 'emoji1' and 'emoji2' are required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/emojimix?emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "";

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to perform emojimix conversion",
      });
    }

    if (contentType.includes("image/")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(Buffer.from(buffer));
    } else {
      const duration = Date.now() - start;
      const data = await response.json();
      const cleanedData = cleanAuthorFields(data);
      
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      
      const stringified = JSON.stringify(cleanedData);
      const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/tools/tmp/$1`);
      
      const finalReplaced = replaced.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);

      return res.json({
        ...JSON.parse(finalReplaced),
        status: true,
        statusCode: response.status,
        author: "@cmnty - Public-api",
        responseTimeMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Emoji-Mix error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: "Bad Gateway. Server error or upstream timed out.",
    });
  }
});

// Maker Endpoint: Emoji to Gif
app.get(["/api/maker/emojigif", "/maker/emojigif"], async (req, res) => {
  const start = Date.now();
  const emoji = req.query.emoji as string;
  if (!emoji) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'emoji' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/emojigif?emoji=${encodeURIComponent(emoji)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "";

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to convert emoji to gif",
      });
    }

    if (contentType.includes("image/")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(Buffer.from(buffer));
    } else {
      const duration = Date.now() - start;
      const data = await response.json();
      const cleanedData = cleanAuthorFields(data);
      
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      
      const stringified = JSON.stringify(cleanedData);
      const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/tools/tmp/$1`);
      
      const finalReplaced = replaced.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);

      return res.json({
        ...JSON.parse(finalReplaced),
        status: true,
        statusCode: response.status,
        author: "@cmnty - Public-api",
        responseTimeMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Emoji to Gif error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: "Bad Gateway. Server error or upstream timed out.",
    });
  }
});

// Tools Endpoint: Web Phishing Check
app.get(["/api/tools/webphishing", "/tools/webphishing"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/webphishing?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("WebPhishing error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: Blur Face (Sensor Wajah)
app.get(["/api/tools/blurface", "/tools/blurface"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/blurface?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "";

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to blur face from image",
      });
    }

    if (contentType.includes("image/")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(Buffer.from(buffer));
    } else {
      const duration = Date.now() - start;
      const data = await response.json();
      const cleanedData = cleanAuthorFields(data);
      
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      
      const stringified = JSON.stringify(cleanedData);
      const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);
      
      return res.json({
        ...JSON.parse(replaced),
        status: true,
        statusCode: response.status,
        author: "@cmnty - Public-api",
        responseTimeMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Blur Face error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: "Bad Gateway. Server error or upstream timed out.",
    });
  }
});

// Tools Endpoint: Removebg (Hapus Background)
app.get(["/api/tools/removebg", "/tools/removebg"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/removebg?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("Content-Type") || "";

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to remove background from image",
      });
    }

    if (contentType.includes("image/")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(Buffer.from(buffer));
    } else {
      const duration = Date.now() - start;
      const data = await response.json();
      const cleanedData = cleanAuthorFields(data);
      
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      
      const stringified = JSON.stringify(cleanedData);
      const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);
      
      return res.json({
        ...JSON.parse(replaced),
        status: true,
        statusCode: response.status,
        author: "@cmnty - Public-api",
        responseTimeMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Removebg error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: "Bad Gateway. Server error or upstream timed out.",
    });
  }
});

// Downloader Endpoint: CapCut
app.get(["/api/downloader/capcut", "/downloader/capcut"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/capcut?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("CapCut Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: Douyin
app.get(["/api/downloader/douyin", "/downloader/douyin"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/douyin?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Douyin Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: Facebook
app.get(["/api/downloader/facebook", "/downloader/facebook"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Facebook Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: GDrive
app.get(["/api/downloader/gdrive", "/downloader/gdrive"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/gdrive?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("GDrive Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: GitHub
app.get(["/api/downloader/github", "/downloader/github"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/vnd.github.v3+json"
  };

  try {
    const gistRegex = /gist\.github(?:usercontent)?\.com\/(?:[^\/]+\/)?([a-f0-9]+)/i;
    const rawRegex = /raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/i;
    const fileRegex = /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/i;
    const treeRegex = /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/i;
    const repoRegex = /github\.com\/([^\/]+)\/([^\/]+)/i;

    let result: any = null;
    let type = "unknown";

    if (gistRegex.test(url)) {
      type = "gist";
      const match = url.match(gistRegex);
      const gistId = match ? match[1] : "";
      const apiResponse = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
      
      if (!apiResponse.ok) {
        throw new Error(`GitHub API returned status ${apiResponse.status}`);
      }

      const gistData = await apiResponse.json();
      
      const files: any = {};
      for (const [filename, fileObj] of Object.entries(gistData.files || {})) {
        const file = fileObj as any;
        files[filename] = {
          filename: file.filename,
          type: file.type,
          language: file.language,
          raw_url: file.raw_url,
          size: file.size,
          content: file.content
        };
      }

      result = {
        id: gistData.id,
        description: gistData.description,
        owner: gistData.owner ? {
          login: gistData.owner.login,
          avatar_url: gistData.owner.avatar_url,
          html_url: gistData.owner.html_url
        } : null,
        created_at: gistData.created_at,
        updated_at: gistData.updated_at,
        html_url: gistData.html_url,
        files: files
      };

    } else if (rawRegex.test(url)) {
      type = "raw";
      const match = url.match(rawRegex);
      const owner = match ? match[1] : "";
      const repo = match ? match[2] : "";
      const branch = match ? match[3] : "";
      const filePath = match ? match[4] : "";

      const contentRes = await fetch(url, { headers });
      let textContent = "";
      if (contentRes.ok) {
        textContent = await contentRes.text();
      }

      result = {
        owner,
        repo,
        branch,
        path: filePath,
        raw_url: url,
        filename: filePath.split("/").pop(),
        download_url: url,
        content: textContent.length < 50000 ? textContent : "[Truncated / File too large]"
      };

    } else if (fileRegex.test(url)) {
      type = "file";
      const match = url.match(fileRegex);
      const owner = match ? match[1] : "";
      const repo = match ? match[2] : "";
      const branch = match ? match[3] : "";
      const filePath = match ? match[4] : "";

      const apiResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, { headers });
      if (!apiResponse.ok) {
        throw new Error(`GitHub API returned status ${apiResponse.status}`);
      }

      const fileData = await apiResponse.json();
      let decodedContent = null;
      if (fileData.content && fileData.encoding === "base64") {
        decodedContent = Buffer.from(fileData.content, "base64").toString("utf-8");
      }

      result = {
        owner,
        repo,
        branch,
        path: fileData.path,
        name: fileData.name,
        size: fileData.size,
        sha: fileData.sha,
        download_url: fileData.download_url,
        html_url: fileData.html_url,
        content: decodedContent || fileData.content
      };

    } else if (treeRegex.test(url)) {
      type = "directory";
      const match = url.match(treeRegex);
      const owner = match ? match[1] : "";
      const repo = match ? match[2] : "";
      const branch = match ? match[3] : "";
      const dirPath = match ? match[4] : "";

      const apiResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`, { headers });
      if (!apiResponse.ok) {
        throw new Error(`GitHub API returned status ${apiResponse.status}`);
      }

      const files = await apiResponse.json();
      result = {
        owner,
        repo,
        branch,
        path: dirPath,
        files: Array.isArray(files) ? files.map((file: any) => ({
          name: file.name,
          path: file.path,
          type: file.type,
          size: file.size,
          sha: file.sha,
          download_url: file.download_url,
          html_url: file.html_url
        })) : []
      };

    } else if (repoRegex.test(url)) {
      type = "repository";
      const match = url.match(repoRegex);
      const owner = match ? match[1] : "";
      let repo = match ? match[2] : "";
      if (repo.endsWith(".git")) {
        repo = repo.substring(0, repo.length - 4);
      }

      const apiResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!apiResponse.ok) {
        throw new Error(`GitHub API returned status ${apiResponse.status}`);
      }

      const repoData = await apiResponse.json();
      result = {
        id: repoData.id,
        name: repoData.name,
        full_name: repoData.full_name,
        owner: {
          login: repoData.owner.login,
          avatar_url: repoData.owner.avatar_url,
          html_url: repoData.owner.html_url
        },
        description: repoData.description,
        created_at: repoData.created_at,
        updated_at: repoData.updated_at,
        pushed_at: repoData.pushed_at,
        homepage: repoData.homepage,
        size: repoData.size,
        stargazers_count: repoData.stargazers_count,
        watchers_count: repoData.watchers_count,
        language: repoData.language,
        forks_count: repoData.forks_count,
        default_branch: repoData.default_branch,
        license: repoData.license ? repoData.license.name : null,
        html_url: repoData.html_url,
        clone_url: repoData.clone_url,
        zip_download_url: `https://github.com/${owner}/${repo}/archive/refs/heads/${repoData.default_branch || "main"}.zip`
      };
    } else {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: "Invalid GitHub URL format"
      });
    }

    const duration = Date.now() - start;

    res.json({
      status: true,
      statusCode: 200,
      author: "@cmnty - Public-api",
      type: type,
      result: result,
      responseTimeMs: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("GitHub Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: error.message || getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: Lahelu
app.get(["/api/downloader/lahelu", "/downloader/lahelu"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/lahelu?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Lahelu Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: Snack Video
app.get(["/api/downloader/snackvideo", "/downloader/snackvideo"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/snackvideo?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("SnackVideo Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: TikTok
app.get(["/api/downloader/tiktok", "/downloader/tiktok"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("TikTok Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: TikTok V1
app.get(["/api/downloader/tiktokv1", "/downloader/tiktokv1"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/tiktok/v2?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("TikTok Downloader V1 error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: Twitter
app.get(["/api/downloader/twitter", "/downloader/twitter"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Twitter Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Downloader Endpoint: Ummy
app.get(["/api/downloader/ummy", "/downloader/ummy"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/d/ummy?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Ummy Downloader error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Asah Otak
app.get(["/api/game/asahotak", "/game/asahotak"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/asahotak";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Asah Otak error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Lirik
app.get(["/api/game/tebaklirik", "/game/tebaklirik"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebaklirik";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Lirik error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Kata
app.get(["/api/game/tebakkata", "/game/tebakkata"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakkata";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Kata error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Kimia
app.get(["/api/game/tebakkimia", "/game/tebakkimia"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakkimia";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Kimia error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Surah
app.get(["/api/game/surah", "/game/surah"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/surah";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Surah error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak-tebakan
app.get(["/api/game/tebaktebakan", "/game/tebaktebakan"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebaktebakan";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak-tebakan error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Cak Lontong
app.get(["/api/game/caklontong", "/game/caklontong"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/caklontong";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cak Lontong error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Cerdas Cermat SD
app.get(["/api/game/cc-sd", "/game/cc-sd"], async (req, res) => {
  const start = Date.now();
  const matapelajaran = (req.query.matapelajaran as string) || "matematika";
  const jumlahsoal = (req.query.jumlahsoal as string) || "5";
  const targetUrl = `https://api.siputzx.my.id/api/games/cc-sd?matapelajaran=${encodeURIComponent(matapelajaran)}&jumlahsoal=${encodeURIComponent(jumlahsoal)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cerdas Cermat error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Lengkapi Kalimat
app.get(["/api/game/lengkapikalimat", "/game/lengkapikalimat"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/lengkapikalimat";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Lengkapi Kalimat error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Teka Teki
app.get(["/api/game/tekateki", "/game/tekateki"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tekateki";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Teka Teki error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak JKT48
app.get(["/api/game/tebakjkt", "/game/tebakjkt"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakjkt";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite image URL to use our own domain via proxy
    if (cleanedData && cleanedData.data && typeof cleanedData.data.gambar === "string") {
      const origGambar = cleanedData.data.gambar;
      const fileName = origGambar.substring(origGambar.lastIndexOf("/") + 1);
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const baseUrl = `${protocol}://${host}`;
      cleanedData.data.gambar = `${baseUrl}/game/tebakjkt/image?file=${fileName}`;
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak JKT error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak JKT48 Image Proxy
app.get(["/api/game/tebakjkt/image", "/game/tebakjkt/image"], async (req, res) => {
  const file = req.query.file as string;
  if (!file) {
    return res.status(400).send("Parameter 'file' is required");
  }
  
  const safeFile = path.basename(file);
  const targetUrl = `https://raw.githubusercontent.com/siputzx/tebak-jkt/main/${safeFile}`;
  
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch image");
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("Tebak JKT image proxy error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

// Game Endpoint: Karakter Free Fire
app.get(["/api/game/karakter-freefire", "/game/karakter-freefire"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/karakter-freefire";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite image URL to use our own domain via proxy
    if (cleanedData && cleanedData.data && typeof cleanedData.data.gambar === "string") {
      const origGambar = cleanedData.data.gambar;
      const fileName = origGambar.substring(origGambar.lastIndexOf("/") + 1);
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const baseUrl = `${protocol}://${host}`;
      cleanedData.data.gambar = `${baseUrl}/game/karakter-freefire/image?file=${fileName}`;
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Karakter Free Fire error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Karakter Free Fire Image Proxy
app.get(["/api/game/karakter-freefire/image", "/game/karakter-freefire/image"], async (req, res) => {
  const file = req.query.file as string;
  if (!file) {
    return res.status(400).send("Parameter 'file' is required");
  }
  
  const safeFile = path.basename(file);
  const targetUrl = `https://raw.githubusercontent.com/siputzx/karakter-freefire/refs/heads/main/files/${safeFile}`;
  
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch image");
    }
    
    const contentType = response.headers.get("content-type") || "image/png";
    res.setHeader("Content-Type", contentType);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("Karakter Free Fire image proxy error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

// Game Endpoint: Tebak Hero ML
app.get(["/api/game/tebakheroml", "/game/tebakheroml"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakheroml";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Hero ML error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Gambar
app.get(["/api/game/tebakgambar", "/game/tebakgambar"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakgambar";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Gambar error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Family 100
app.get(["/api/game/family100", "/game/family100"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/family100";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Family 100 error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Lagu
app.get(["/api/game/tebaklagu", "/game/tebaklagu"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebaklagu";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Recursive URL proxy helper to rewrite any media/image/audio URL to our custom domain proxy
    const rewriteUrlsToProxy = (obj: any): any => {
      if (obj === null || typeof obj !== "object") {
        if (typeof obj === "string" && (obj.startsWith("http://") || obj.startsWith("https://"))) {
          const rawHost = req.headers["x-forwarded-host"] || req.get("host") || "";
          const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
          if (host && obj.includes(host)) {
            return obj;
          }
          const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
          const protocol = Array.isArray(rawProto) ? rawProto[0] : rawProto;
          const baseUrl = `${protocol}://${host}`;
          const fileName = obj.substring(obj.lastIndexOf("/") + 1);
          return `${baseUrl}/game/tebaklagu/audio?file=${fileName}`;
        }
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(item => rewriteUrlsToProxy(item));
      }
      const rewritten: any = {};
      for (const [key, value] of Object.entries(obj)) {
        rewritten[key] = rewriteUrlsToProxy(value);
      }
      return rewritten;
    };

    const proxiedData = rewriteUrlsToProxy(cleanedData);

    res.json({
      ...proxiedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Lagu error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(505),
    });
  }
});

// Game Endpoint: Tebak Lagu Media/Audio Proxy
app.get(["/api/game/tebaklagu/audio", "/game/tebaklagu/audio"], async (req, res) => {
  const file = req.query.file as string;
  if (!file) {
    return res.status(400).send("Parameter 'file' is required");
  }
  
  const safeFile = path.basename(file);
  const targetUrl = `https://raw.githubusercontent.com/Aiinne/scrape/main/song/${safeFile}`;
  
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch media");
    }
    
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("Tebak Lagu media proxy error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

// Game Endpoint: Tebak Logo
app.get(["/api/game/tebaklogo", "/game/tebaklogo"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebaklogo";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite image URL to use our own domain via proxy
    if (cleanedData && cleanedData.data && typeof cleanedData.data.gambar === "string") {
      const origGambar = cleanedData.data.gambar;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const baseUrl = `${protocol}://${host}`;
      cleanedData.data.gambar = `${baseUrl}/game/tebaklogo/image?url=${encodeURIComponent(origGambar)}`;
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Logo error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Logo Image Proxy
app.get(["/api/game/tebaklogo/image", "/game/tebaklogo/image"], async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).send("Parameter 'url' is required");
  }
  
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch image");
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("Tebak Logo image proxy error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

// Game Endpoint: Tebak Warna
app.get(["/api/game/tebakwarna", "/game/tebakwarna"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakwarna";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite image/gambar URL to use our own domain via proxy if present
    if (cleanedData && cleanedData.data) {
      const rawHost = req.headers["x-forwarded-host"] || req.get("host") || "";
      const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
      const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const protocol = Array.isArray(rawProto) ? rawProto[0] : rawProto;
      const baseUrl = `${protocol}://${host}`;

      if (typeof cleanedData.data.image === "string") {
        const fileName = cleanedData.data.image.substring(cleanedData.data.image.lastIndexOf("/") + 1);
        cleanedData.data.image = `${baseUrl}/game/tebakwarna/image?file=${fileName}`;
      }
      if (typeof cleanedData.data.gambar === "string") {
        const fileName = cleanedData.data.gambar.substring(cleanedData.data.gambar.lastIndexOf("/") + 1);
        cleanedData.data.gambar = `${baseUrl}/game/tebakwarna/image?file=${fileName}`;
      }
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Warna error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Warna Image Proxy
app.get(["/api/game/tebakwarna/image", "/game/tebakwarna/image"], async (req, res) => {
  const file = req.query.file as string;
  if (!file) {
    return res.status(400).send("Parameter 'file' is required");
  }
  
  const safeFile = path.basename(file);
  const targetUrl = `https://raw.githubusercontent.com/siputzx/databasee/refs/heads/main/images/${safeFile}`;
  
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch image");
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("Tebak Warna image proxy error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

// Game Endpoint: Tebak Bendera
app.get(["/api/game/tebakbendera", "/game/tebakbendera"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakbendera";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Bendera error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Kartun
app.get(["/api/game/tebakkartun", "/game/tebakkartun"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakkartun";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Kartun error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Game
app.get(["/api/game/tebakgame", "/game/tebakgame"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakgame";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Game error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Tebak Kalimat
app.get(["/api/game/tebakkalimat", "/game/tebakkalimat"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/tebakkalimat";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tebak Kalimat error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Game Endpoint: Susun Kata
app.get(["/api/game/susunkata", "/game/susunkata"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.siputzx.my.id/api/games/susunkata";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Susun Kata error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Information Endpoint: Cuaca
app.get(["/api/information/cuaca", "/information/cuaca"], async (req, res) => {
  const start = Date.now();
  const kota = req.query.kota as string || "jakarta";
  const targetUrl = `https://api.nexray.eu.cc/information/cuaca?kota=${encodeURIComponent(kota)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite target image URLs to use local proxy/domain for custom domain requirement
    if (cleanedData && cleanedData.result && Array.isArray(cleanedData.result.forecasts)) {
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const baseUrl = `${protocol}://${host}`;
      
      cleanedData.result.forecasts = cleanedData.result.forecasts.map((forecast: any) => {
        if (typeof forecast.image_url === "string" && (forecast.image_url.includes("api.nexray.eu.cc/tmp/") || forecast.image_url.includes("nexray.eu.cc/tmp/"))) {
          try {
            const url = new URL(forecast.image_url);
            forecast.image_url = `${baseUrl}${url.pathname}${url.search}`;
          } catch (e) {
            const matches = forecast.image_url.match(/\/tmp\/[a-zA-Z0-9_\-\.]+/);
            if (matches) {
              forecast.image_url = `${baseUrl}${matches[0]}`;
            }
          }
        }
        return forecast;
      });
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cuaca information error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Information Endpoint: Grow A Garden
app.get(["/api/information/growagarden", "/information/growagarden"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.nexray.eu.cc/information/growagarden";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Grow A Garden error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Information Endpoint: Jadwal Sepakbola
app.get(["/api/information/jadwalbola", "/information/jadwalbola"], async (req, res) => {
  const start = Date.now();
  const targetUrl = `https://api.nexray.eu.cc/information/jadwalbola`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Jadwal Bola information error:", error.message);
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal mengambil data jadwal sepakbola pihak ketiga.",
      responseTimeMs: Date.now() - start
    });
  }
});

// Information Endpoint: Hari Libur
app.get(["/api/information/hari-libur", "/information/hari-libur"], async (req, res) => {
  const start = Date.now();
  const targetUrl = `https://api.nexray.eu.cc/information/hari-libur`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Hari Libur information error:", error.message);
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal mengambil data hari libur nasional.",
      responseTimeMs: Date.now() - start
    });
  }
});

// Information Endpoint: Jadwal TV
app.get(["/api/information/jadwaltv", "/information/jadwaltv"], async (req, res) => {
  const start = Date.now();
  const channel = (req.query.channel as string) || "mnctv";
  const targetUrl = `https://api.nexray.eu.cc/information/jadwaltv?channel=${encodeURIComponent(channel)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Jadwal TV information error:", error.message);
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal mengambil data jadwal TV pihak ketiga.",
      responseTimeMs: Date.now() - start
    });
  }
});

// Information Endpoint: Jadwal Sholat
app.get(["/api/information/jadwalsholat", "/information/jadwalsholat"], async (req, res) => {
  const start = Date.now();
  const kota = (req.query.kota as string) || "purwokerto";
  const targetUrl = `https://api.nexray.eu.cc/information/jadwalsholat?kota=${encodeURIComponent(kota)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Jadwal Sholat information error:", error.message);
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal mengambil data jadwal sholat pihak ketiga.",
      responseTimeMs: Date.now() - start
    });
  }
});

// Information Endpoint: Gempa
app.get(["/api/information/gempa", "/information/gempa"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://api.nexray.eu.cc/information/gempa";

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Gempa information error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Random Endpoint: Blue Archive
app.get(["/api/random/blue-archive", "/random/blue-archive"], async (req, res) => {
  const targetUrl = `https://api.nexray.eu.cc/random/ba`;
  
  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Blue Archive error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Random Endpoint: Cecan Indonesia
app.get(["/api/random/cecan/indonesia", "/random/cecan/indonesia"], async (req, res) => {
  const targetUrl = `https://api.siputzx.my.id/api/r/cecan/indonesia`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://api.siputzx.my.id/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    
    const contentType = response.headers.get("content-type") || "image/png";
    
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Upstream API returned an HTML page instead of an image. Please try again."
      });
    }

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Cecan Indonesia error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Random Endpoint: Cecan China
app.get(["/api/random/cecan/china", "/random/cecan/china"], async (req, res) => {
  const urls = [
    "https://api.nexray.eu.cc/random/cecan/china",
    "https://api.siputzx.my.id/api/r/cecan/china"
  ];
  const targetUrl = urls[Math.floor(Math.random() * urls.length)];
  const isNexray = targetUrl.includes("nexray");
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": isNexray ? "https://api.nexray.eu.cc/" : "https://api.siputzx.my.id/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    
    const contentType = response.headers.get("content-type") || "image/png";
    
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Upstream API returned an HTML page instead of an image. Please try again."
      });
    }

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Cecan China error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Random Endpoint: Cecan Japan
app.get(["/api/random/cecan/japan", "/random/cecan/japan"], async (req, res) => {
  const urls = [
    "https://api.nexray.eu.cc/random/cecan/japan",
    "https://api.siputzx.my.id/api/r/cecan/japan"
  ];
  const targetUrl = urls[Math.floor(Math.random() * urls.length)];
  const isNexray = targetUrl.includes("nexray");
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": isNexray ? "https://api.nexray.eu.cc/" : "https://api.siputzx.my.id/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    
    const contentType = response.headers.get("content-type") || "image/png";
    
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Upstream API returned an HTML page instead of an image. Please try again."
      });
    }

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Cecan Japan error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Apple Music
app.get(["/api/search/applemusic", "/search/applemusic"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "Jogja istimewa";
  const targetUrl = `https://api.nexray.eu.cc/search/applemusic?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Apple Music search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Bilibili
app.get(["/api/search/bilibili", "/search/bilibili"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "anime";
  const targetUrl = `https://api.nexray.eu.cc/search/bilibili?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Bilibili search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Bing Image
app.get(["/api/search/bingimage", "/search/bingimage"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "kucing";
  const targetUrl = `https://api.nexray.eu.cc/search/bingimage?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Bing Image search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Resep Koki
app.get(["/api/search/resep", "/search/resep"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "rendang";
  const targetUrl = `https://api.nexray.eu.cc/search/resep?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Resep Koki search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: SFile
app.get(["/api/search/sfile", "/search/sfile"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "scrape";
  const targetUrl = `https://api.nexray.eu.cc/search/sfile?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("SFile search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Lyrics
app.get(["/api/search/lyrics", "/search/lyrics"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "someone like you";
  const targetUrl = `https://api.nexray.eu.cc/search/lyrics?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Lyrics search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: CapCut
app.get(["/api/search/capcut", "/search/capcut"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "jj";
  const targetUrl = `https://api.nexray.eu.cc/search/capcut?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("CapCut search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: GitHub
app.get(["/api/search/github", "/search/github"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "Bot whatsapp";
  const targetUrl = `https://api.nexray.eu.cc/search/github?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("GitHub search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: HappyMood
app.get(["/api/search/happymood", "/search/happymood"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "Mobile legend";
  const targetUrl = `https://api.nexray.eu.cc/search/happymood?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("HappyMood search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: NPM-Package
app.get(["/api/search/npmjs", "/search/npmjs"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "api";
  const targetUrl = `https://api.nexray.eu.cc/search/npmjs?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("NPM Package search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Pinterest
app.get(["/api/search/pinterest", "/search/pinterest"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "pp couple";
  const targetUrl = `https://api.nexray.eu.cc/search/pinterest?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Pinterest search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: SoundCloud
app.get(["/api/search/soundcloud", "/search/soundcloud"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "mangu";
  const targetUrl = `https://api.nexray.eu.cc/search/soundcloud?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("SoundCloud search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: Spotify
app.get(["/api/search/spotify", "/search/spotify"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "jakarta hari ini";
  const targetUrl = `https://api.nexray.eu.cc/search/spotify?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Spotify search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Search Endpoint: TikTok
app.get(["/api/search/tiktok", "/search/tiktok"], async (req, res) => {
  const start = Date.now();
  const q = req.query.q as string || "vilmei";
  const targetUrl = `https://api.nexray.eu.cc/search/tiktok?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("TikTok search error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: Website Screenshot
app.get(["/api/tools/ssweb", "/tools/ssweb"], async (req, res) => {
  const url = req.query.url as string;
  const device = req.query.device as string || "desktop";
  const theme = req.query.theme as string || "dark";
  const fullPage = req.query.fullPage as string || "false";
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(url)}&device=${device}&theme=${theme}&fullPage=${fullPage}`;

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "image/png";
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: "Failed to capture screenshot",
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("SSWeb error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});



// Tools Endpoint: Current Visitor Info (Dynamic Real-time lookup with user-specific fallback/defaults)
app.get(["/api/tools/visitor", "/tools/visitor"], async (req, res) => {
  const start = Date.now();
  
  // Detect remote client IP address or use target IP from query
  let clientIp = (req.query.ip as string) || (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  if (clientIp.startsWith("::ffff:")) {
    clientIp = clientIp.substring(7);
  }
  
  // If local or private IP, dynamically query the public IP of the hosting environment
  if (!clientIp || clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("10.") || clientIp.startsWith("192.168.") || clientIp.startsWith("172.16.") || clientIp.startsWith("169.254.")) {
    try {
      const publicIpRes = await fetch("https://api.ipify.org?format=json");
      if (publicIpRes.ok) {
        const body = await publicIpRes.json();
        if (body && body.ip) {
          clientIp = body.ip;
        }
      }
    } catch (e) {
      clientIp = "1.1.1.1"; // Secondary dynamic resolver fallback
    }
  }

  try {
    let geo = {
      status: "success",
      country: "",
      regionName: "",
      city: "",
      lat: -6.2088, // Neutral default (Jakarta) just to prevent error before load
      lon: 106.8456, // Neutral default
      isp: "",
      query: clientIp
    };

    let fetchSuccess = false;

    // 1. Try ipwho.is (HTTPS, highly reliable)
    try {
      const geoController = new AbortController();
      const geoTimeoutId = setTimeout(() => geoController.abort(), 5000);
      try {
        const ipRes = await fetch(`https://ipwho.is/${clientIp}`, { signal: geoController.signal });
        if (ipRes.ok) {
          const data = await ipRes.json();
          if (data && data.success) {
            geo = {
              status: "success",
              country: data.country || "",
              regionName: data.region || "",
              city: data.city || "",
              lat: data.latitude || -6.2088,
              lon: data.longitude || 106.8456,
              isp: data.connection?.isp || "",
              query: clientIp
            };
            fetchSuccess = true;
          }
        }
      } finally {
        clearTimeout(geoTimeoutId);
      }
    } catch (e) {
      console.warn("ipwho.is fetch failed, trying ip-api.com", e);
    }

    // 2. Try ip-api.com if ipwho.is failed
    if (!fetchSuccess) {
      try {
        const geoController = new AbortController();
        const geoTimeoutId = setTimeout(() => geoController.abort(), 5000);
        try {
          const ipRes = await fetch(`http://ip-api.com/json/${clientIp}`, { signal: geoController.signal });
          if (ipRes.ok) {
            const data = await ipRes.json();
            if (data && data.status === "success") {
              geo = data;
              fetchSuccess = true;
            }
          }
        } finally {
          clearTimeout(geoTimeoutId);
        }
      } catch (e) {
        console.warn("ip-api.com fetch failed, trying freeipapi.com", e);
      }
    }

    // 3. Try freeipapi.com if both failed
    if (!fetchSuccess) {
      try {
        const geoController = new AbortController();
        const geoTimeoutId = setTimeout(() => geoController.abort(), 5000);
        try {
          const ipRes = await fetch(`https://freeipapi.com/api/json/${clientIp}`, { signal: geoController.signal });
          if (ipRes.ok) {
            const data = await ipRes.json();
            if (data && data.cityName) {
              geo = {
                status: "success",
                country: data.countryName || "",
                regionName: data.regionName || "",
                city: data.cityName || "",
                lat: data.latitude || -6.2088,
                lon: data.longitude || 106.8456,
                isp: "",
                query: clientIp
              };
              fetchSuccess = true;
            }
          }
        } finally {
          clearTimeout(geoTimeoutId);
        }
      } catch (e) {
        console.warn("freeipapi.com fetch failed, using default values", e);
      }
    }

    // 2. Get Weather Info from open-meteo (free, no sign-up) with 6 second timeout
    let temp = 26.5; // General global average default
    let weatherCode = 1;
    let weatherText = "Berawan";

    const weatherController = new AbortController();
    const weatherTimeoutId = setTimeout(() => {
      try {
        weatherController.abort();
      } catch (err) {}
    }, 6000);

    try {
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current_weather=true`, { signal: weatherController.signal });
      clearTimeout(weatherTimeoutId);
      if (weatherRes.ok) {
        const weatherData = await weatherRes.json();
        if (weatherData && weatherData.current_weather) {
          temp = weatherData.current_weather.temperature;
          weatherCode = weatherData.current_weather.weathercode;
          
          // translate weather code to Indonesian, prioritizing Mendung/Weather mapping
          if (weatherCode === 0) weatherText = "Cerah";
          else if (weatherCode === 1) weatherText = "Cerah Berawan";
          else if (weatherCode === 2) weatherText = "Berawan Sebagian";
          else if (weatherCode === 3) weatherText = "Mendung";
          else if (weatherCode >= 45 && weatherCode <= 48) weatherText = "Berkabut";
          else if (weatherCode >= 51 && weatherCode <= 55) weatherText = "Gerimis";
          else if (weatherCode >= 61 && weatherCode <= 65) weatherText = "Hujan";
          else if (weatherCode >= 80 && weatherCode <= 82) weatherText = "Hujan Ringan";
          else if (weatherCode >= 95 && weatherCode <= 99) weatherText = "Badai Guntur";
          else weatherText = "Berawan";
        }
      }
    } catch (e: any) {
      clearTimeout(weatherTimeoutId);
      if (e.name === "AbortError") {
        console.warn("Weather fetch timed out (6s), using default values");
      } else {
        console.warn("Weather fetch failed, using default values", e?.message || e);
      }
    }

    const duration = Date.now() - start;

    res.json({
      status: true,
      statusCode: 200,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      result: {
        ip: geo.query,
        city: geo.city || "",
        region: geo.regionName || "",
        country: geo.country || "",
        lat: geo.lat,
        lon: geo.lon,
        isp: geo.isp || "Internet Network Provider",
        weather: weatherText || "Berawan",
        temperature: `${temp || 26.5}°C`
      }
    });
  } catch (error: any) {
    console.error("Visitor detection error:", error.message);
    const duration = Date.now() - start;
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal mendeteksi informasi kunjungan",
      responseTimeMs: duration
    });
  }
});

// Stalker Endpoint: GitHub
app.get(["/api/stalker/github", "/stalker/github"], async (req, res) => {
  const start = Date.now();
  const username = (req.query.username as string) || "Creatorsitee";

  const targetUrl = `https://api.nexray.eu.cc/stalker/github?username=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("GitHub Stalker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Stalker Endpoint: Mobile Legends
app.get(["/api/stalker/mlbb", "/stalker/mlbb"], async (req, res) => {
  const start = Date.now();
  const { id, zone } = req.query;
  
  if (!id || !zone) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameters 'id' and 'zone' are required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/stalker/mlbb?id=${id}&zone=${zone}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("MLBB Stalker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Stalker Endpoint: Mobile Legends v1
app.get(["/api/stalker/v1/mlbb", "/stalker/v1/mlbb"], async (req, res) => {
  const start = Date.now();
  const { id, zone } = req.query;
  
  if (!id || !zone) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameters 'id' and 'zone' are required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/stalker/v1/mlbb?id=${id}&zone=${zone}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("MLBB Stalker v1 error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Stalker Endpoint: NPM Package
app.get(["/api/stalker/npmjs", "/stalker/npmjs"], async (req, res) => {
  const start = Date.now();
  const name = (req.query.name as string) || "baileys";

  const targetUrl = `https://api.nexray.eu.cc/stalker/npmjs?name=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("NPM Package Stalker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Stalker Endpoint: Roblox
app.get(["/api/stalker/roblox", "/stalker/roblox"], async (req, res) => {
  const start = Date.now();
  const username = (req.query.username as string) || "Builderman";

  const targetUrl = `https://api.nexray.eu.cc/stalker/roblox?username=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Roblox Stalker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Stalker Endpoint: TikTok
app.get(["/api/stalker/tiktok", "/stalker/tiktok"], async (req, res) => {
  const start = Date.now();
  const username = (req.query.username as string) || "cmnty.official";

  const targetUrl = `https://api.nexray.eu.cc/stalker/tiktok?username=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("TikTok Stalker error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: BentoSnap Record
app.post(["/api/tools/record", "/tools/record"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://shinana-bentosnap.hf.space/api/record";
  
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(req.body)
    });
    
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({
        status: false,
        statusCode: response.status,
        author: "@cmnty - Public-api",
        message: data.detail || getErrorMessage(response.status)
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Proxy the output URL if present
    const upstreamDomain = "shinana-bentosnap.hf.space";
    if (cleanedData.url && typeof cleanedData.url === "string") {
       if (cleanedData.url.includes(`${upstreamDomain}/output/`) || cleanedData.url.includes(`${upstreamDomain}/recordings/`)) {
          const url = new URL(cleanedData.url);
          const protocol = req.headers["x-forwarded-proto"] || req.protocol;
          const host = req.headers["x-forwarded-host"] || req.get("host");
          cleanedData.url = `${protocol}://${host}${url.pathname}`;
       }
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("BentoSnap Record error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500)
    });
  }
});

// Proxy for BentoSnap output files
app.get(["/output/:filename", "/recordings/:filename"], async (req, res) => {
  const { filename } = req.params;
  const isRecording = req.path.startsWith("/recordings/");
  const targetUrl = `https://shinana-bentosnap.hf.space${isRecording ? "/recordings/" : "/output/"}${filename}`;
  
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
       return res.status(response.status).json({
         status: false,
         message: "File tidak ditemukan atau telah kedaluwarsa."
       });
    }
    
    const contentType = response.headers.get("content-type") || (isRecording ? "video/mp4" : "image/png");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300"); 
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("BentoSnap proxy error:", error.message);
    res.status(502).json({
      status: false,
      message: "Proxy error: " + error.message
    });
  }
});

// Proxy for WebToZip files
app.get("/api/downloadArchive/:filename", async (req, res) => {
  const { filename } = req.params;
  const targetUrl = `https://copier.saveweb2zip.com/api/downloadArchive/${filename}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://saveweb2zip.com/"
      }
    });
    
    if (!response.ok) {
       return res.status(response.status).json({
         status: false,
         statusCode: response.status,
         author: "@cmnty - Public-api",
         message: "Berkas tidak ditemukan atau telah kedaluwarsa."
       });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.zip"`);
    
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    res.status(502).json({
      status: false,
      author: "@cmnty - Public-api",
      message: "Gagal mengambil data dari upstream."
    });
  }
});

// Tools Endpoint: Web to ZIP
app.get(["/api/tools/webtozip", "/tools/webtozip"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/webtozip?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Rewrite downloadUrl to use local proxy
    if (cleanedData.result && cleanedData.result.downloadUrl) {
       const upstreamUrl = cleanedData.result.downloadUrl;
       if (upstreamUrl.includes("copier.saveweb2zip.com/api/downloadArchive/")) {
          const urlObj = new URL(upstreamUrl);
          const protocol = req.headers["x-forwarded-proto"] || req.protocol;
          const host = req.headers["x-forwarded-host"] || req.get("host");
          cleanedData.result.downloadUrl = `${protocol}://${host}/api/downloadArchive${urlObj.pathname.replace("/api/downloadArchive", "")}`;
       }
    }

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Web to ZIP error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: Wink HDR
app.get(["/api/tools/wink", "/tools/wink"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  const type = req.query.type as string; // image or video
  
  if (!url || !type) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameters 'url' and 'type' are required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/wink?url=${encodeURIComponent(url)}&type=${encodeURIComponent(type)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Custom domain rewrite for results if they contain nexray tmp links
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const stringified = JSON.stringify(cleanedData);
    const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);
    const finalData = JSON.parse(replaced);

    res.json({
      ...finalData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Wink HDR error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: Colorize
app.get(["/api/tools/colorize", "/tools/colorize"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/colorize?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    
    // Custom domain rewrite for results
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const stringified = JSON.stringify(cleanedData);
    const replaced = stringified.replace(/https:\/\/api\.nexray\.eu\.cc\/tmp\/([a-zA-Z0-9_\-\.]+)/g, `${protocol}://${host}/api/tmp/$1`);
    const finalData = JSON.parse(replaced);

    res.json({
      ...finalData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Colorize error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: NGL Spam
app.get(["/api/tools/spamngl", "/tools/spamngl"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  const pesan = req.query.pesan as string;
  const jumlah = req.query.jumlah as string;
  
  if (!url || !pesan || !jumlah) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameters 'url', 'pesan', and 'jumlah' are required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/spamngl?url=${encodeURIComponent(url)}&pesan=${encodeURIComponent(pesan)}&jumlah=${encodeURIComponent(jumlah)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("NGL Spam error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: YouTube Recap
app.get(["/api/tools/ytrecap", "/tools/ytrecap"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.cuki.biz.id/api/tools/ytrecap?apikey=cuki-x&url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const rawResults = data.results || data.result || data;
    const cleanedResults = cleanAuthorFields(rawResults);

    res.json({
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      results: cleanedResults,
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("YouTube Recap error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Tools Endpoint: YouTube Summarize
app.get(["/api/tools/youtube-summarize", "/tools/youtube-summarize"], async (req, res) => {
  const start = Date.now();
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/v1/youtube-summarize?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);

    // Structure the result to present clean customized data
    const result = cleanedData.result || cleanedData.results || cleanedData;

    res.json({
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      result: result,
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("YouTube Summarize error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Payment Endpoint: Saweria Create
app.get(["/api/payment/saweria/create", "/payment/saweria/create"], async (req, res) => {
  const start = Date.now();
  const { username, amount, sender, email, pesan } = req.query;

  if (!username || !amount || !sender || !email || !pesan) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameters username, amount, sender, email, and pesan are required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/payment/saweria/create?username=${encodeURIComponent(username as string)}&amount=${encodeURIComponent(amount as string)}&sender=${encodeURIComponent(sender as string)}&email=${encodeURIComponent(email as string)}&pesan=${encodeURIComponent(pesan as string)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Saweria Create error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Payment Endpoint: Saweria Check
app.get(["/api/payment/saweria/check", "/payment/saweria/check"], async (req, res) => {
  const start = Date.now();
  const { transactionid } = req.query;

  if (!transactionid) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter transactionid is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/payment/saweria/check?transactionid=${encodeURIComponent(transactionid as string)}`;

  try {
    const response = await fetch(targetUrl);
    const duration = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      return res.status(status).json({
        status: false,
        statusCode: status,
        author: "@cmnty - Public-api",
        message: getErrorMessage(status),
      });
    }

    const cleanedData = cleanAuthorFields(data);
    res.json({
      ...cleanedData,
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Saweria Check error:", error.message);
    res.status(502).json({
      status: false,
      statusCode: 502,
      author: "@cmnty - Public-api",
      message: getErrorMessage(500),
    });
  }
});

// Mount Static File serving for uploaded user files
app.use("/cfiles", express.static(cfilesDir));

// GET /api/uploader/upload or /uploader/upload Guidelines
app.get(["/api/uploader/upload", "/uploader/upload"], (req, res) => {
  res.json({
    status: true,
    statusCode: 200,
    author: "@cmnty - Public-api",
    message: "Gunakan POST dengan body form-data 'file' untuk mengunggah berkas apa saja."
  });
});

// POST /api/uploader/upload or /uploader/upload (multipart form)
app.post(["/api/uploader/upload", "/uploader/upload"], (req, res) => {
  const start = Date.now();
  
  // Limit check to max 30 files in cfiles directory
  try {
    const existingFiles = fs.readdirSync(cfilesDir).filter(f => !f.startsWith("."));
    if (existingFiles.length >= 30) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: "Batas penyimpanan maksimal 30 berkas pada server ini telah tercapai. Tidak dapat mengunggah berkas baru."
      });
    }
  } catch (error: any) {
    console.error("Storage count check error:", error.message);
  }

  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: err.message || "Gagal mengunggah berkas."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: "Silakan masukkan berkas dalam field 'file'."
      });
    }

    const duration = Date.now() - start;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const fileUrl = `${protocol}://${host}/cfiles/${req.file.filename}`;
    
    res.json({
      status: true,
      statusCode: 200,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      result: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: fileUrl
      }
    });
  });
});

// GET /api/uploader/upload-v1 or /uploader/upload-v1 Guidelines
app.get(["/api/uploader/upload-v1", "/uploader/upload-v1"], (req, res) => {
  res.json({
    status: true,
    statusCode: 200,
    author: "@cmnty - Public-api",
    message: "Gunakan POST dengan body form-data 'file' untuk mengunggah berkas menggunakan Upload V1."
  });
});

// POST /api/uploader/upload-v1 or /uploader/upload-v1 (forwarded to c.termai.cc with custom domain)
app.post(["/api/uploader/upload-v1", "/uploader/upload-v1"], (req, res) => {
  const start = Date.now();
  memoryUpload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: err.message || "Gagal mengunggah berkas."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        statusCode: 400,
        author: "@cmnty - Public-api",
        message: "Silakan masukkan berkas dalam field 'file'."
      });
    }

    try {
      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      formData.append("file", blob, req.file.originalname);

      // default key for c.termai.cc upload
      const key = "AIzaBj7z2z3xBjsk";
      const targetUrl = `https://c.termai.cc/api/upload?key=${key}`;

      const response = await fetch(targetUrl, {
        method: "POST",
        body: formData,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });

      const duration = Date.now() - start;

      if (!response.ok) {
        return res.status(response.status).json({
          status: false,
          statusCode: response.status,
          author: "@cmnty - Public-api",
          message: "Failed to upload file to the V1 storage backend"
        });
      }

      const data = await response.json();

      if (!data || !data.path) {
        return res.status(502).json({
          status: false,
          statusCode: 502,
          author: "@cmnty - Public-api",
          message: "Invalid response from the V1 storage backend"
        });
      }

      const host = req.headers["x-forwarded-host"] || req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      
      let customPath = data.path;
      if (customPath && customPath.startsWith("https://c.termai.cc/")) {
        customPath = customPath.replace("https://c.termai.cc/", `${protocol}://${host}/view-v1/`);
      }

      res.json({
        status: true,
        statusCode: 200,
        author: "@cmnty - Public-api",
        responseTimeMs: duration,
        result: {
          path: customPath,
          mimetype: data.mimetype || data.mimeType || req.file.mimetype,
          size: data.size || req.file.size
        }
      });
    } catch (error: any) {
      console.error("Upload V1 error:", error.message);
      res.status(502).json({
        status: false,
        statusCode: 502,
        author: "@cmnty - Public-api",
        message: "Bad Gateway. Server error or upstream timed out."
      });
    }
  });
});

// Proxy for Upload V1 files (bypassing c.termai.cc and showing custom domain)
app.get("/view-v1/:type/:filename", async (req, res) => {
  const { type, filename } = req.params;
  const targetUrl = `https://c.termai.cc/${type}/${encodeURIComponent(filename)}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://c.termai.cc/"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: false,
        message: "File tidak ditemukan atau telah kedaluwarsa pada server Upload V1."
      });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache v1 files heavily, 1 year

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("View V1 error:", error.message);
    res.status(502).json({
      status: false,
      message: "Proxy error: " + error.message
    });
  }
});

// Admin endpoints for /oji
// List all files
app.get("/api/oji/files", (req, res) => {
  const password = req.query.password || req.headers["x-admin-password"];
  if (password !== "cmntyapi10081") {
    return res.status(403).json({
      status: false,
      statusCode: 403,
      author: "@cmnty - Public-api",
      message: "Akses ditolak. Kata sandi tidak valid."
    });
  }

  try {
    const files = fs.readdirSync(cfilesDir);
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const fileList = files.map(file => {
      const filePath = path.join(cfilesDir, file);
      const stat = fs.statSync(filePath);
      const fileUrl = `${protocol}://${host}/cfiles/${file}`;
      return {
        filename: file,
        size: stat.size,
        createdAt: stat.birthtime || stat.mtime,
        url: fileUrl
      };
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      status: true,
      statusCode: 200,
      author: "@cmnty - Public-api",
      result: fileList
    });
  } catch (error: any) {
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal membaca direktori berkas: " + error.message
    });
  }
});

// Delete a file
app.delete("/api/oji/delete", (req, res) => {
  const password = req.query.password || req.headers["x-admin-password"] || req.body.password;
  if (password !== "cmntyapi10081") {
    return res.status(403).json({
      status: false,
      statusCode: 403,
      author: "@cmnty - Public-api",
      message: "Akses ditolak. Kata sandi tidak valid."
    });
  }

  const filename = req.query.filename || req.body.filename;
  if (!filename) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Nama berkas tidak boleh kosong."
    });
  }

  // Prevent Directory Traversal / Escape attempts
  const safeFilename = path.basename(filename as string);
  const filePath = path.join(cfilesDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      status: false,
      statusCode: 404,
      author: "@cmnty - Public-api",
      message: "Berkas tidak ditemukan."
    });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({
      status: true,
      statusCode: 200,
      author: "@cmnty - Public-api",
      message: `Berkas ${safeFilename} berhasil dihapus.`
    });
  } catch (error: any) {
    res.status(500).json({
      status: false,
      statusCode: 500,
      author: "@cmnty - Public-api",
      message: "Gagal menghapus berkas: " + error.message
    });
  }
});

// GET /sitemap.xml and /googled682f72610ad7e5d.html endpoints
app.get("/sitemap.xml", (req, res) => {
  const filePatch = path.join(process.cwd(), "public", "sitemap.xml");
  if (fs.existsSync(filePatch)) {
    res.header("Content-Type", "application/xml");
    res.sendFile(filePatch);
  } else {
    res.status(404).send("Sitemap not found");
  }
});

app.get("/googled682f72610ad7e5d.html", (req, res) => {
  const filePatch = path.join(process.cwd(), "public", "googled682f72610ad7e5d.html");
  if (fs.existsSync(filePatch)) {
    res.header("Content-Type", "text/html");
    res.sendFile(filePatch);
  } else {
    res.status(404).send("Verification file not found");
  }
});


// Serve frontend build static files in production, mount Vite in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });

  wss = new WebSocketServer({ server });
  
  let connectedClients = 0;

  wss.on("connection", (ws) => {
    connectedClients++;
    broadcast({ type: "VISITOR_COUNT", count: connectedClients });

    // Send current logs to new connections
    ws.send(JSON.stringify({ type: "INIT_LOGS", logs: requestLogs }));

    ws.on("close", () => {
      connectedClients--;
      broadcast({ type: "VISITOR_COUNT", count: connectedClients });
    });
  });
}

startServer().catch((err) => {
  console.error("Critical error starting server:", err);
  process.exit(1);
});
