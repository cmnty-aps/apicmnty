import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";

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
    const isApiCall = req.path.startsWith("/api/") || 
                      req.path.startsWith("/berita/") || 
                      req.path.startsWith("/tools/") ||
                      req.path.startsWith("/canvas/") ||
                      req.path.startsWith("/tmp/") ||
                      req.path.startsWith("/output/") ||
                      req.path.startsWith("/recordings/") ||
                      req.path.startsWith("/ai/");
    
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
  return ERROR_MESSAGES[status] || `Terjadi kesalahan pada sistem hulu (HTTP ${status}). Mohon hubungi administrator jika masalah berlanjut.`;
}

/**
 * Helper to recursively remove branding/author fields from upstream data
 * to ensure strictly custom authorship.
 */
function cleanAuthorFields(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanAuthorFields);

  const cleaned: any = {};
  const forbiddenKeys = ["creator", "author", "signature", "signature_api", "copyright", "status", "statusCode", "response_time", "responsetime", "exectime", "runtime", "executiontime"];

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
      status: true,
      statusCode: targetRes.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
            description: "Gateway CMNTY API berhasil menghubungkan portal informasi ke dalam arsitektur berkinerja tinggi, dilengkapi sistem pemantauan latensi real-time.",
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData,
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
      status: true,
      statusCode: response.status,
      author: "@cmnty - Public-api",
      responseTimeMs: duration,
      timestamp: new Date().toISOString(),
      ...cleanedData
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
  
  wss.on("connection", (ws) => {
    // Send current logs to new connections
    ws.send(JSON.stringify({ type: "INIT_LOGS", logs: requestLogs }));
  });
}

startServer().catch((err) => {
  console.error("Critical error starting server:", err);
  process.exit(1);
});
