import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import net from "net";

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
  if (requestLogs.length > 50) {
    requestLogs.pop();
  }
  
  // Broadcast the new log to all connected clients
  broadcast({ type: "TRAFFIC_LOG", log });
}

// Global logger middleware for API routes
app.use((req, res, next) => {
  const start = Date.now();
  
  // Listen for the finish event to log the request once completed
  res.on("finish", () => {
    const isApiCall = (
      req.path.startsWith("/api/") || 
      req.path.startsWith("/ai/") || 
      req.path.startsWith("/berita/") || 
      req.path.startsWith("/tools/") || 
      req.path.startsWith("/canvas/") || 
      req.path.startsWith("/information/") || 
      req.path.startsWith("/stalker/") || 
      req.path.startsWith("/maker/") ||
      req.path.startsWith("/game/")
    ) && !req.path.includes("visitor") && !req.path.includes("/v1/logs");
    
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
  berita: ["antara", "cnn", "cnbc", "cnbcindonesia", "ffnews", "tempo", "republika", "okezone"],
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
    "exectime", "runtime", "executiontime", "timestamp", "time"
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

  const targetUrl = `https://api.nexray.eu.cc/berita/${targetProvider}`;

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
            title: "CMNTY API Sukses Mengintegrasikan Layanan",
            link: "#",
            image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=500",
            isoDate: new Date().toISOString(),
            description: "Gateway CMNTY API berhasil menghubungkan portal informasi ke dalam arsitektur berkinerja tinggi, dilengkapi sistem pemantauan latensi.",
          },
          {
            title: "Pengembang CMNTY Merilis Dashboard API Minimalis Hitam Putih",
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
app.get("/tmp/:filename", async (req, res) => {
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
  
  if (!url) {
    return res.status(400).json({
      status: false,
      statusCode: 400,
      author: "@cmnty - Public-api",
      message: "Parameter 'url' is required",
    });
  }

  const targetUrl = `https://api.nexray.eu.cc/tools/ssweb?url=${encodeURIComponent(url)}`;

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
      const geoTimeoutId = setTimeout(() => geoController.abort(), 2500);
      const ipRes = await fetch(`https://ipwho.is/${clientIp}`, { signal: geoController.signal });
      clearTimeout(geoTimeoutId);
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
    } catch (e) {
      console.warn("ipwho.is fetch failed, trying ip-api.com", e);
    }

    // 2. Try ip-api.com if ipwho.is failed
    if (!fetchSuccess) {
      try {
        const geoController = new AbortController();
        const geoTimeoutId = setTimeout(() => geoController.abort(), 2500);
        const ipRes = await fetch(`http://ip-api.com/json/${clientIp}`, { signal: geoController.signal });
        clearTimeout(geoTimeoutId);
        if (ipRes.ok) {
          const data = await ipRes.json();
          if (data && data.status === "success") {
            geo = data;
            fetchSuccess = true;
          }
        }
      } catch (e) {
        console.warn("ip-api.com fetch failed, trying freeipapi.com", e);
      }
    }

    // 3. Try freeipapi.com if both failed
    if (!fetchSuccess) {
      try {
        const geoController = new AbortController();
        const geoTimeoutId = setTimeout(() => geoController.abort(), 2500);
        const ipRes = await fetch(`https://freeipapi.com/api/json/${clientIp}`, { signal: geoController.signal });
        clearTimeout(geoTimeoutId);
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
app.all(["/api/tools/record", "/tools/record"], async (req, res) => {
  const start = Date.now();
  const targetUrl = "https://shinana-bentosnap.hf.space/api/record";
  
  // Use query params for GET, body for POST
  const payload = req.method === "GET" ? req.query : req.body;

  // Convert string values from query params to numbers/booleans where appropriate
  const processedPayload: any = { ...payload };
  if (req.method === "GET") {
    if (processedPayload.duration_ms) processedPayload.duration_ms = parseInt(processedPayload.duration_ms);
    if (processedPayload.wait_ms) processedPayload.wait_ms = parseInt(processedPayload.wait_ms);
    if (processedPayload.scroll === "true") processedPayload.scroll = true;
    if (processedPayload.scroll === "false") processedPayload.scroll = false;
    if (processedPayload.dark_mode === "true") processedPayload.dark_mode = true;
    if (processedPayload.dark_mode === "false") processedPayload.dark_mode = false;
  }
  
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(processedPayload)
    });
    
    const duration = Date.now() - start;
    const textData = await response.text();
    let data;
    try {
      data = JSON.parse(textData);
    } catch (e) {
      data = { error: "Invalid JSON response from upstream", raw: textData };
    }
    
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
