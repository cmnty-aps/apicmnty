import { useState, useEffect, useRef } from "react";
import { LandingHero } from "./components/LandingHero";
import {
  ArrowLeft,
  LayoutGrid,
  Newspaper,
  Wrench,
  Layers,
  Palette,
  BrainCircuit,
  Terminal,
  Copy,
  Check,
  Activity,
  FileText,
  RefreshCw,
  Cpu,
  ChevronDown,
  ChevronUp,
  Search,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FolderOpen,
  Folder,
  Trash2,
  Clock,
  ArrowUpRight,
  Globe,
  MoreHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ApiResponse {
  success?: boolean;
  status?: boolean;
  statusCode?: number;
  author?: string;
  provider?: string;
  responseTimeMs?: number;
  timestamp?: string;
  isCachedFallback?: boolean;
  message?: string;
  data?: any;
}

interface TrafficLog {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
}

interface QueryParamSpec {
  name: string;
  placeholder: string;
  defaultValue: string;
  options?: string[];
}

interface EndpointSpec {
  id: string;
  category: string;
  name: string;
  provider: string;
  path: string;
  method: string;
  description: string;
  queryParams?: QueryParamSpec[];
}

const ENDPOINTS: EndpointSpec[] = [
  {
    id: "ai-aimuslim",
    category: "ai",
    name: "AI Muslim",
    provider: "cuki",
    path: "/ai/aimuslim",
    method: "GET",
    description: "Dapatkan jawaban cerdas seputar Islam dan Al-Qur'an menggunakan teknologi AI.",
    queryParams: [
      { name: "query", placeholder: "Pertanyaan Anda (contoh: apa itu puasa)", defaultValue: "apa itu puasa" }
    ]
  },
  {
    id: "ai-andisearch",
    category: "ai",
    name: "Andisearch AI",
    provider: "nexray",
    path: "/ai/andisearch",
    method: "GET",
    description: "Layanan pencarian cerdas berbasis AI untuk menjawab berbagai pertanyaan dengan cepat dan akurat.",
    queryParams: [
      { name: "text", placeholder: "Pertanyaan atau topik (contoh: api developer)", defaultValue: "api developer" }
    ]
  },
  {
    id: "ai-bibleai",
    category: "ai",
    name: "Bible AI",
    provider: "cuki",
    path: "/ai/bibleai",
    method: "GET",
    description: "Tanyakan hal-hal seputar Alkitab menggunakan kecerdasan AI. Mendukung berbagai versi terjemahan Alkitab.",
    queryParams: [
      { name: "question", placeholder: "Pertanyaan Anda (contoh: apa arti kasih)", defaultValue: "apa arti kasih dalam Alkitab" }
    ]
  },
  {
    id: "ai-claude",
    category: "ai",
    name: "Claude AI",
    provider: "nexray",
    path: "/ai/claude",
    method: "GET",
    description: "Layanan asisten AI cerdas berbasis Claude untuk membantu menjawab pertanyaan dan menyelesaikan tugas secara natural.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: halo)", defaultValue: "halo" }
    ]
  },
  {
    id: "ai-copilot",
    category: "ai",
    name: "Copilot AI",
    provider: "nexray",
    path: "/ai/copilot",
    method: "GET",
    description: "Asisten AI Copilot yang siap membantu menjawab pertanyaan, mencari informasi, dan memberikan saran secara cerdas.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: halo)", defaultValue: "halo" }
    ]
  },
  {
    id: "ai-deepsearch",
    category: "ai",
    name: "DeepSearch AI",
    provider: "nexray",
    path: "/ai/deepsearch",
    method: "GET",
    description: "Layanan pencarian mendalam yang ditenagai oleh kecerdasan buatan untuk hasil yang lebih spesifik dan komprehensif.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: halo)", defaultValue: "halo" }
    ]
  },
  {
    id: "ai-deepseek",
    category: "ai",
    name: "DeepSeek AI",
    provider: "cuki",
    path: "/ai/deepseek",
    method: "GET",
    description: "Chat dengan DeepSeek AI yang mendukung pemahaman konteks mendalam untuk menjawab berbagai pertanyaan kompleks.",
    queryParams: [
      { name: "question", placeholder: "Pertanyaan Anda (contoh: halo)", defaultValue: "halo" }
    ]
  },
  {
    id: "ai-dolphin",
    category: "ai",
    name: "Dolphin AI",
    provider: "nexray",
    path: "/ai/dolphin",
    method: "GET",
    description: "Berkomunikasi dengan Dolphin AI. Mendukung berbagai template respon.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: hai salam kenal)", defaultValue: "hai salam kenal" },
      { 
        name: "template", 
        placeholder: "Template: logical, creative, summarize, etc", 
        defaultValue: "logical",
        options: ["logical", "creative", "summarize", "code-beginner", "code-advanced"]
      }
    ]
  },
  {
    id: "ai-ideogram",
    category: "ai",
    name: "Ideogram AI",
    provider: "nexray",
    path: "/ai/ideogram",
    method: "GET",
    description: "Hasilkan gambar berkualitas tinggi dengan teks yang jelas dan desain estetis menggunakan model Ideogram AI.",
    queryParams: [
      { name: "prompt", placeholder: "Contoh: kucing lucu pake topi", defaultValue: "kucing" }
    ]
  },
  {
    id: "ai-image-to-prompt",
    category: "ai",
    name: "Image to Prompt",
    provider: "nexray",
    path: "/ai/image2prompt",
    method: "GET",
    description: "Hasilkan deskripsi prompt yang detail dari sebuah gambar melalui URL. Berguna untuk memahami konten gambar atau generasi karya serupa.",
    queryParams: [
      { name: "url", placeholder: "https://example.com/image.jpg", defaultValue: "https://uploader.zenzxz.dpdns.org/uploads/1766513795520.jpeg" }
    ]
  },
  {
    id: "ai-dreamanalyze",
    category: "ai",
    name: "Dream Analyze",
    provider: "nexray",
    path: "/ai/dreamanalyze",
    method: "GET",
    description: "Analisis mimpi Anda menggunakan kecerdasan buatan untuk mendapatkan interpretasi dan makna di baliknya.",
    queryParams: [
      { name: "text", placeholder: "Ceritakan mimpi Anda (contoh: I had a dream about flying)", defaultValue: "I had a dream about flying" }
    ]
  },
  {
    id: "ai-felo",
    category: "ai",
    name: "Felo AI",
    provider: "nexray",
    path: "/ai/felo",
    method: "GET",
    description: "Mulai percakapan cerdas dengan Felo AI untuk mendapatkan jawaban yang natural dan membantu.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: hi)", defaultValue: "hi" }
    ]
  },
  {
    id: "ai-gpt-3-5-turbo",
    category: "ai",
    name: "GPT-3.5 Turbo",
    provider: "nexray",
    path: "/ai/gpt-3.5-turbo",
    method: "GET",
    description: "Gunakan model GPT-3.5 Turbo yang cepat dan efisien untuk berbagai tugas pemrosesan bahasa alami dan percakapan interaktif.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: hai)", defaultValue: "hai" }
    ]
  },
  {
    id: "ai-gemini",
    category: "ai",
    name: "Gemini AI",
    provider: "nexray",
    path: "/ai/gemini",
    method: "GET",
    description: "Chat dengan Google Gemini AI untuk mendapatkan asisten cerdas yang mampu memahami konteks dan menjawab berbagai pertanyaan Anda.",
    queryParams: [
      { name: "text", placeholder: "Pesan Anda (contoh: halo)", defaultValue: "halo" }
    ]
  },
  {
    id: "ai-gemini-tts",
    category: "ai",
    name: "Gemini TTS",
    provider: "nexray",
    path: "/ai/gemini-tts",
    method: "GET",
    description: "Ubah teks menjadi suara menggunakan teknologi Gemini TTS murni.",
    queryParams: [
      { name: "text", placeholder: "Teks yang ingin diubah (contoh: halo apa kabar)", defaultValue: "halo apa kabar" }
    ]
  },
  {
    id: "berita-antara",
    category: "berita",
    name: "Antara",
    provider: "antara",
    path: "/berita/antara",
    method: "GET",
    description: "Mendapatkan rangkuman informasi berita terbaru dari LKBN Antara News Feed secara real-time."
  },
  {
    id: "berita-cnbcindonesia",
    category: "berita",
    name: "CNBC Indonesia",
    provider: "cnbcindonesia",
    path: "/berita/cnbcindonesia",
    method: "GET",
    description: "Mendapatkan liputan terkini berita ekonomi, pasar saham, finansial, dan investasi terkini."
  },
  {
    id: "berita-cnn",
    category: "berita",
    name: "CNN",
    provider: "cnn",
    path: "/berita/cnn",
    method: "GET",
    description: "Mengambil berita harian terpopuler, peristiwa terhangat nasional dan internasional asinkron."
  },
  {
    id: "berita-ffnews",
    category: "berita",
    name: "Free Fire News",
    provider: "ffnews",
    path: "/berita/ffnews",
    method: "GET",
    description: "Mendapatkan rangkuman informasi berita game Free Fire terbaru secara real-time."
  },
  {
    id: "information-gempa",
    category: "information",
    name: "Informasi Gempa BMKG",
    provider: "nexray",
    path: "/information/gempa",
    method: "GET",
    description: "Mendapatkan data real-time informasi gempa bumi terkini dari BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)."
  },
  {
    id: "canvas-ektp",
    category: "canvas",
    name: "EKTP Generator",
    provider: "siputzx",
    path: "/canvas/ektp",
    method: "GET",
    description: "Generate gambar EKTP kustom dengan parameter yang lengkap (provinsi, nik, nama, dll) untuk keperluan sandbox. Mengembalikan response dalam bentuk buffer gambar.",
    queryParams: [
      { name: "provinsi", placeholder: "JAWA BARAT", defaultValue: "JAWA BARAT" },
      { name: "kota", placeholder: "BANDUNG", defaultValue: "BANDUNG" },
      { name: "nik", placeholder: "1234567890123456", defaultValue: "1234567890123456" },
      { name: "nama", placeholder: "John Doe", defaultValue: "John Doe" },
      { name: "ttl", placeholder: "Bandung, 01-01-1990", defaultValue: "Bandung, 01-01-1990" },
      { name: "jenis_kelamin", placeholder: "Laki-laki", defaultValue: "Laki-laki" },
      { name: "golongan_darah", placeholder: "O", defaultValue: "O" },
      { name: "alamat", placeholder: "Jl. Contoh No. 123", defaultValue: "Jl. Contoh No. 123" },
      { name: "rt/rw", placeholder: "001/002", defaultValue: "001/002" },
      { name: "kel/desa", placeholder: "Sukajadi", defaultValue: "Sukajadi" },
      { name: "kecamatan", placeholder: "Sukajadi", defaultValue: "Sukajadi" },
      { name: "agama", placeholder: "Islam", defaultValue: "Islam" },
      { name: "status", placeholder: "Belum Kawin", defaultValue: "Belum Kawin" },
      { name: "pekerjaan", placeholder: "Pegawai Swasta", defaultValue: "Pegawai Swasta" },
      { name: "kewarganegaraan", placeholder: "WNI", defaultValue: "WNI" },
      { name: "masa_berlaku", placeholder: "Seumur Hidup", defaultValue: "Seumur Hidup" },
      { name: "terbuat", placeholder: "01-01-2023", defaultValue: "01-01-2023" },
      { name: "pas_photo", placeholder: "https://...", defaultValue: "https://i.pinimg.com/736x/0b/9f/0a/0b9f0a92a598e6c22629004c1027d23f.jpg" }
    ]
  },
  {
    id: "maker-fakedana",
    category: "canvas",
    name: "Fake DANA Maker",
    provider: "nan-z",
    path: "/maker/fakedana",
    method: "GET",
    description: "Hasilkan gambar bukti saldo DANA palsu dengan nominal kustom. Mengembalikan response dalam bentuk gambar.",
    queryParams: [
      { name: "text", placeholder: "Nominal (contoh: 200000)", defaultValue: "200000" }
    ]
  },
  {
    id: "maker-fakeovo",
    category: "canvas",
    name: "Fake OVO Maker",
    provider: "cuki",
    path: "/maker/fakeovo",
    method: "GET",
    description: "Hasilkan gambar bukti saldo OVO palsu dengan nominal kustom. Mengembalikan response dalam bentuk gambar.",
    queryParams: [
      { name: "amount", placeholder: "Nominal (contoh: 200000)", defaultValue: "200000" }
    ]
  },
  {
    id: "canvas-starboy",
    category: "canvas",
    name: "Starboy Canvas",
    provider: "cuki",
    path: "/canvas/starboy",
    method: "GET",
    description: "Hasilkan gambar gaya 'Starboy' dari URL gambar dengan penghapusan latar belakang otomatis secara instan.",
    queryParams: [
      { name: "image", placeholder: "URL Gambar (https://...)", defaultValue: "https://uploader.zenzxz.dpdns.org/uploads/1775993980606.jpeg" }
    ]
  },
  {
    id: "canvas-susu-original",
    category: "canvas",
    name: "Susu Original Template",
    provider: "cuki",
    path: "/canvas/susu-original",
    method: "GET",
    description: "Memasukkan subjek ke dalam template susu kedua menggunakan penghapusan latar belakang otomatis. Mengembalikan response dalam bentuk image buffer.",
    queryParams: [
      { name: "image", placeholder: "URL Gambar (https://...)", defaultValue: "https://uploader.zenzxz.dpdns.org/uploads/1777998261437.jpeg" }
    ]
  },
  {
    id: "canvas-susu-taro",
    category: "canvas",
    name: "Susu Taro Template",
    provider: "cuki",
    path: "/canvas/susu-taro",
    method: "GET",
    description: "Memasukkan subjek ke dalam template susu taro menggunakan penghapusan latar belakang otomatis. Mengembalikan response dalam bentuk image buffer.",
    queryParams: [
      { name: "image", placeholder: "URL Gambar (https://...)", defaultValue: "https://uploader.zenzxz.dpdns.org/uploads/1777998261437.jpeg" }
    ]
  },
  {
    id: "tools-webphishing",
    category: "tools",
    name: "Web Phishing Check",
    provider: "nexray",
    path: "/tools/webphishing",
    method: "GET",
    description: "Cek apakah sebuah URL situs web terindikasi sebagai situs phishing atau berbahaya untuk keamanan data.",
    queryParams: [
      { name: "url", placeholder: "https://api.cmnty.web.id", defaultValue: "https://api.cmnty.web.id" }
    ]
  },
  {
    id: "tools-ssweb",
    category: "tools",
    name: "Website Screenshot",
    provider: "nexray",
    path: "/tools/ssweb",
    method: "GET",
    description: "Ambil tangkapan layar (screenshot) dari URL situs web yang diberikan secara instan.",
    queryParams: [
      { name: "url", placeholder: "https://google.com", defaultValue: "https://google.com" }
    ]
  },
  {
    id: "tools-bentosnap-record",
    category: "tools",
    name: "Web Record",
    provider: "shinana",
    path: "/tools/record",
    method: "POST",
    description: "Rekam kunjungan halaman web menjadi video MP4 dengan auto-scroll halus. Masukkan URL dan konfigurasi lainnya.",
    queryParams: [
      { name: "url", placeholder: "api.cmnty.web.id", defaultValue: "api.cmnty.web.id" },
      { 
        name: "device", 
        placeholder: "Pilih Perangkat", 
        defaultValue: "desktop_fhd",
        options: [
          "desktop_hd", "desktop_fhd", "desktop_4k", "desktop_wide",
          "laptop_13", "laptop_15", "macbook_air", "macbook_pro",
          "ipad", "ipad_pro", "ipad_mini", "samsung_tab",
          "iphone_se", "iphone_14", "iphone_14_pro", "iphone_15_pro",
          "samsung_s24", "pixel_8", "xiaomi_14"
        ]
      },
      { name: "duration_ms", placeholder: "8000", defaultValue: "8000" },
      { 
        name: "scroll", 
        placeholder: "Pilih", 
        defaultValue: "true",
        options: ["true", "false"]
      },
      { 
        name: "dark_mode", 
        placeholder: "Pilih", 
        defaultValue: "false",
        options: ["true", "false"]
      },
      { name: "wait_ms", placeholder: "1000", defaultValue: "1000" }
    ]
  },
  {
    id: "tools-kodepos",
    category: "tools",
    name: "Pencarian Kode Pos",
    provider: "kodepos",
    path: "/tools/kodepos",
    method: "GET",
    description: "Layanan pencarian kode pos wilayah administratif Republik Indonesia secara instan dengan parameter pencarian daerah.",
    queryParams: [
      { name: "form", placeholder: "Nama daerah (contoh: purbalingga)", defaultValue: "jakarta" }
    ]
  },
  {
    id: "stalker-mlbb",
    category: "stalker",
    name: "Mobile Legends Stalker",
    provider: "nexray",
    path: "/stalker/mlbb",
    method: "GET",
    description: "Dapatkan informasi detail akun Mobile Legends: Bang Bang melalui User ID dan Zone ID. Menampilkan nickname dan status akun.",
    queryParams: [
      { name: "id", placeholder: "User ID (contoh: 11111)", defaultValue: "11111" },
      { name: "zone", placeholder: "Zone ID (contoh: 11111)", defaultValue: "11111" }
    ]
  }
];

export default function App() {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCodeLang, setSelectedCodeLang] = useState<"curl" | "javascript" | "python">("curl");
  
  // Per-endpoint UI interactive States
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [customPath, setCustomPath] = useState<string>("/ai/aimuslim");
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to response when result arrives
  useEffect(() => {
    if (hasAttempted && !isLoading && (apiResponse || imageUrl || errorText)) {
      setTimeout(() => {
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isLoading, apiResponse, imageUrl, errorText, hasAttempted]);

  // Application View State
  const [currentView, setCurrentView] = useState<"landing" | "explorer">("landing");

  // General Application Copy helpers
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Metrics monitoring
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [stats, setStats] = useState({
    totalCalls: 0,
    averageLatency: 0,
    successRate: 100,
  });

  const appBaseUrl = window.location.origin;

  // metrics effects
  useEffect(() => {
    if (trafficLogs.length > 0) {
      const total = trafficLogs.length;
      const validMs = trafficLogs.map(l => l.durationMs);
      const sumMs = validMs.reduce((a, b) => a + b, 0);
      const avg = Math.round(sumMs / total) || 0;
      const successCount = trafficLogs.filter(l => l.status >= 200 && l.status < 400).length;
      const rate = Math.round((successCount / total) * 100) || 100;

      setStats({
        totalCalls: total,
        averageLatency: avg,
        successRate: rate,
      });
    }
  }, [trafficLogs]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "INIT_LOGS") {
          setTrafficLogs(data.logs);
        } else if (data.type === "TRAFFIC_LOG") {
          setTrafficLogs((prev) => {
            const next = [data.log, ...prev];
            return next.slice(0, 30);
          });
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // Fetch initial Baseline response when switching to a different expanded card
  const selectEndpoint = (ep: EndpointSpec) => {
    setApiResponse(null);
    setErrorText(null);
    setHasAttempted(false);
    setExpandedCardId(ep.id === expandedCardId ? null : ep.id);
    
    // Set parameter defaults
    const defaults: Record<string, string> = {};
    if (ep.queryParams) {
      ep.queryParams.forEach(q => {
        defaults[q.name] = q.defaultValue;
      });
    }
    setQueryParams(defaults);

    const paramString = ep.queryParams && Object.keys(defaults).length > 0 
      ? `?${new URLSearchParams(defaults).toString()}` 
      : "";
    const pathStr = `${ep.path}${paramString}`;
    setCustomPath(pathStr);
  };

  // Run a custom request to path
  const sendRequestDirect = async (pathStr: string) => {
    setHasAttempted(true);
    setIsLoading(true);
    setApiResponse(null); // Reset response to trigger the loading state in UI
    setImageUrl(null);
    setErrorText(null);
    setExecutionTime(null);
    const start = Date.now();

    // Find the current endpoint for method handling
    const endpoint = ENDPOINTS.find(e => expandedCardId === e.id);
    const method = endpoint?.method || "GET";

    try {
      let response;
      if (method === "POST") {
        const body: Record<string, any> = {};
        Object.entries(queryParams).forEach(([key, val]) => {
          const sVal = val as string;
          if (sVal === "true") body[key] = true;
          else if (sVal === "false") body[key] = false;
          else if (!isNaN(Number(sVal)) && sVal.trim() !== "" && !key.includes("url")) {
            // Only convert to number if it's not a URL or specifically needed as string
            body[key] = Number(sVal);
          } else {
            body[key] = sVal;
          }
        });

        response = await fetch(endpoint?.path || pathStr.split("?")[0], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(body)
        });
      } else {
        response = await fetch(pathStr);
      }

      const contentType = response.headers.get("content-type") || "";
      const isImage = contentType.includes("image");
      const isVideo = contentType.includes("video");
      
      if (isImage) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const durationMs = Date.now() - start;
        setExecutionTime(durationMs);
        setImageUrl(url);
      } else {
        const data: any = await response.json();
        // Record duration if server doesn't provide it, but prioritize server's responseTimeMs
        const durationMs = data.responseTimeMs || (Date.now() - start);
        setExecutionTime(durationMs);
        setApiResponse(data);
      }
    } catch (err: any) {
      const durationMs = Date.now() - start;
      setExecutionTime(durationMs);
      console.error(err);
      setErrorText(`Gagal melakukan request: ${err.message || "Unknown error"}`);
      setApiResponse({
        status: false,
        author: "@cmnty - Public-api",
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic parameter changes on typing
  const handleQueryParamChange = (ep: EndpointSpec, name: string, value: string) => {
    const nextParams = {
      ...queryParams,
      [name]: value
    };
    setQueryParams(nextParams);
    setApiResponse(null);
    setImageUrl(null);
    setErrorText(null);

    const paramString = ep.queryParams && Object.keys(nextParams).length > 0
      ? `?${new URLSearchParams(nextParams).toString()}`
      : "";
    setCustomPath(`${ep.path}${paramString}`);
  };

  const sendRequest = async () => {
    if (!customPath) return;
    await sendRequestDirect(customPath);
  };

  // Copy managers
  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [id]: false }));
    }, 2000);
  };

  const getCodeSnippet = (ep: EndpointSpec, currentCustomPath: string) => {
    const fullApiPath = `${appBaseUrl}${currentCustomPath}`;
    if (selectedCodeLang === "curl") {
      const method = ep.method || "GET";
      const headers = `-H "Accept: application/json"`;
      
      if (method === "POST") {
        const body: Record<string, any> = {};
        Object.entries(queryParams).forEach(([key, val]) => {
          const sVal = val as string;
          if (sVal === "true") body[key] = true;
          else if (sVal === "false") body[key] = false;
          else if (!isNaN(Number(sVal)) && sVal.trim() !== "" && !key.includes("url")) body[key] = Number(sVal);
          else body[key] = sVal;
        });
        return `curl -X POST "${appBaseUrl}${ep.path}" \\
  ${headers} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
      }

      return `curl -X GET "${fullApiPath}" \\
  ${headers}`;
    }
    if (selectedCodeLang === "javascript") {
      const method = ep.method || "GET";
      if (method === "POST") {
        const body: Record<string, any> = {};
        Object.entries(queryParams).forEach(([key, val]) => {
          const sVal = val as string;
          if (sVal === "true") body[key] = true;
          else if (sVal === "false") body[key] = false;
          else if (!isNaN(Number(sVal)) && sVal.trim() !== "" && !key.includes("url")) body[key] = Number(sVal);
          else body[key] = sVal;
        });
        return `fetch("${appBaseUrl}${ep.path}", {
  method: "POST",
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${JSON.stringify(body, null, 2)})
})
.then(response => response.json())
.then(data => console.log(data));`;
      }
      return `fetch("${fullApiPath}", {
  method: "GET",
  headers: {
    "Accept": "application/json"
  }
})
.then(response => response.json())
.then(data => console.log(data));`;
    }
    if (selectedCodeLang === "python") {
      const method = ep.method || "GET";
      const headers = `headers = {"Accept": "application/json"}`;
      
      if (method === "POST") {
        const body: Record<string, any> = {};
        Object.entries(queryParams).forEach(([key, val]) => {
          const sVal = val as string;
          if (sVal === "true") body[key] = true;
          else if (sVal === "false") body[key] = false;
          else if (!isNaN(Number(sVal)) && sVal.trim() !== "" && !key.includes("url")) body[key] = Number(sVal);
          else body[key] = sVal;
        });
        return `import requests
import json

url = "${appBaseUrl}${ep.path}"
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}
payload = ${JSON.stringify(body, null, 4)}

response = requests.post(url, headers=headers, json=payload)
print(response.json())`;
      }

      return `import requests

url = "${fullApiPath}"
headers = {"Accept": "application/json"}

response = requests.get(url, headers=headers)
print(response.json())`;
    }
    return "";
  };

  // Local folder categories grouping filter
  const filteredEndpoints = ENDPOINTS.filter(ep => {
    const matchCategory = activeFolder === "all" || ep.category === activeFolder;
    const matchSearch = ep.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        ep.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="min-h-screen bg-[#040405] text-[#fafafa] selection:bg-white selection:text-black">
      {/* Visual background grid layout - styled exactly like the screenshot */}
      <div className="absolute inset-0 bg-[#040405] bg-[linear-gradient(to_right,#0f0f12_1px,transparent_1px),linear-gradient(to_bottom,#0f0f12_1px,transparent_1px)] bg-[size:30px_30px] opacity-25 pointer-events-none text-left" />

      {/* Decorative Top Glowing Line */}
      <div className="fixed top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_30px_rgba(255,255,255,0.8)] z-[100] pointer-events-none" />

      {/* Navbar Header exactly matching screenshot layout */}
      <header className="border-b border-zinc-900 bg-[#040405]/75 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setCurrentView("landing")}
              className="text-xl font-bold text-white tracking-tight hover:opacity-90 transition-opacity"
            >
              Cmnty API
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 text-zinc-400 text-xs font-semibold">
              <div className="relative inline-flex h-[18px] w-9 flex-shrink-0 cursor-pointer rounded-full bg-zinc-600 transition-colors duration-200">
                <span className="translate-x-[18px] pointer-events-none inline-block h-[14px] w-[14px] transform rounded-full bg-white transition duration-200 mt-[2px] ml-[2px]"></span>
              </div>
              <span className="text-zinc-300">Dark</span>
            </div>
            
            <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1 hover:text-white transition-all rounded-md"
              title="Menu"
            >
              <MoreHorizontal className="h-6 w-6" />
            </button>

            {/* Float menu containing instant telemetry */}
            {showMoreMenu && (
              <div className="absolute right-0 mt-2 w-52 bg-[#08080a] border border-[#242429] rounded-lg p-3.5 shadow-2xl z-50 text-left space-y-2">
                <div className="text-[9px] uppercase font-mono tracking-widest text-zinc-500 border-b border-zinc-800 pb-1 flex items-center justify-between">
                  <span>TELEMETRY</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="space-y-1.5 text-[10px] font-mono text-zinc-400">
                  <div className="flex justify-between"><span>Status:</span><span className="text-emerald-400 font-bold">ONLINE</span></div>
                  <div className="flex justify-between"><span>Latency:</span><span className="text-white font-semibold">{stats.averageLatency > 0 ? `${stats.averageLatency}ms` : "Active"}</span></div>
                  <div className="flex justify-between"><span>Success:</span><span className="text-zinc-300">{stats.successRate}%</span></div>
                  <div className="flex justify-between"><span>Total API:</span><span className="text-zinc-300">{ENDPOINTS.length} items</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

      {/* Main Grid Wrapper */}
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-8 relative">
        <AnimatePresence mode="wait">
          {currentView === "landing" ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 w-full pt-12"
            >
              <div className="flex items-center justify-center">
                <LandingHero 
                  onGetStarted={() => setCurrentView("explorer")}
                  onViewVitals={() => {
                    document.getElementById("traffic-monitor")?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              </div>

              {/* Live Traffic Monitor Dashboard inside Landing View */}
              <section id="traffic-monitor" className="bg-black border border-zinc-800 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.03)] text-left scroll-mt-20 max-w-2xl mx-auto w-full">
                <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-end">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.location.reload()}
                      className="p-1 px-2 text-[9px] font-mono text-zinc-500 hover:text-white border border-zinc-800 bg-zinc-950 transition-all rounded flex items-center gap-1"
                      title="Refresh"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/40 font-mono text-xs divide-y divide-zinc-900 text-left">
                  {trafficLogs.length === 0 ? (
                    <div className="text-center py-6 text-zinc-700 text-xs font-mono">
                      No active traffic recordings yet. Execute commands from Explorer to stream live traffic.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {trafficLogs.map((log) => {
                        const isSuccess = log.status >= 200 && log.status < 400;
                        return (
                          <div
                            key={log.id}
                            className="py-2 px-2.5 bg-black border border-zinc-900 hover:border-zinc-800 transition-all rounded flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.2 rounded font-bold text-[8px] ${isSuccess ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-500"}`}>
                                {log.status}
                              </span>
                              <span className="font-bold text-zinc-500 text-[9px]">{log.method}</span>
                              <span className="text-zinc-400 text-[11px] truncate select-all">{log.url}</span>
                            </div>
                            
                            <div className="flex items-center gap-2.5 text-zinc-600 text-[9px] flex-shrink-0">
                              <span className="text-zinc-400 font-bold">{log.durationMs}ms</span>
                              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="explorer"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <button
                onClick={() => setCurrentView("landing")}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-all text-xs font-bold uppercase tracking-widest group"
              >
                <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
                <span>Back</span>
              </button>

              {/* API Playground / Explorer Container */}
              <div id="api-explorer" className="pt-2 space-y-6 scroll-mt-20 text-left">
                
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                    <div>
                      <h3 className="text-sm font-extrabold uppercase tracking-widest text-zinc-400 font-mono">API Sandbox</h3>
                    <p className="text-[11px] text-zinc-500 font-mono">Pilih endpoint di bawah untuk uji coba langsung</p>
                  </div>
                  
                  {/* Folder categories selector - Horizontal Scrollable */}
                  <div className="flex overflow-x-auto gap-2 pb-1.5 text-xs font-mono scrollbar-hide snap-x no-scrollbar">
                    <button
                      onClick={() => { setActiveFolder("all"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "all"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span>Semua ({ENDPOINTS.length})</span>
                    </button>
                    
                    <button
                      onClick={() => { setActiveFolder("ai"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "ai"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <BrainCircuit className="h-3.5 w-3.5" />
                      <span>AI ({ENDPOINTS.filter(e => e.category === "ai").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("berita"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "berita"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Newspaper className="h-3.5 w-3.5" />
                      <span>Berita ({ENDPOINTS.filter(e => e.category === "berita").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("information"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "information"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Activity className="h-3.5 w-3.5" />
                      <span>Info ({ENDPOINTS.filter(e => e.category === "information").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("stalker"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "stalker"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Stalker ({ENDPOINTS.filter(e => e.category === "stalker").length})</span>
                    </button>
                    
                    <button
                      onClick={() => { setActiveFolder("canvas"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "canvas"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Palette className="h-3.5 w-3.5" />
                      <span>Canvas ({ENDPOINTS.filter(e => e.category === "canvas").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("tools"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "tools"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Tools ({ENDPOINTS.filter(e => e.category === "tools").length})</span>
                    </button>
                  </div>
                  </div>
                </div>

                {/* Global Search Input Box */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-zinc-500" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search endpoints..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#070709] border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-xs font-mono text-white placeholder-zinc-650 focus:outline-none focus:border-zinc-700 transition-all"
                  />
                </div>
              </div>

              {/* End of explorer div - will wrap the list and monitor next */}

        {/* Stack of collapsible accordion card list */}
        <div className="space-y-3">
          {filteredEndpoints.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-zinc-800 rounded bg-[#09090b]/40 text-zinc-500 font-mono text-xs">
              No matching endpoints found
            </div>
          ) : (
            filteredEndpoints.map((ep) => {
              const isExpanded = expandedCardId === ep.id;
              return (
                <div
                  key={ep.id}
                  className="bg-[#09090c] border border-zinc-800 rounded-lg overflow-hidden transition-all duration-200"
                >
                  {/* Card head bar */}
                  <button
                    onClick={() => selectEndpoint(ep)}
                    className="w-full px-4 py-3.5 hover:bg-zinc-950/40 transition-colors flex items-center justify-between text-left"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 border border-zinc-700 bg-zinc-950 text-neutral-300 rounded uppercase tracking-wide">
                          {ep.method}
                        </span>
                        <span className="text-sm font-semibold text-white tracking-wide">{ep.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 font-semibold">{ep.path}</div>
                    </div>
                    <div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-zinc-400" />
                      )}
                    </div>
                  </button>

                  {/* Inside expanded content */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-zinc-800 bg-black/60 overflow-hidden"
                      >
                        <div className="p-4 space-y-5 text-left text-xs font-mono">
                          
                          {/* Try it out Panel */}
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-2.5 text-zinc-300 font-bold uppercase text-[10px] tracking-wider">
                              <span className="text-xs text-zinc-400">▶</span>
                              <span>Try It Out</span>
                            </div>
                            <p className="text-zinc-400 font-sans leading-relaxed text-xs">
                              {ep.description}
                            </p>

                            {/* Dynamic input render segment */}
                            {ep.queryParams && (
                              <div className="bg-[#070709] border border-zinc-800 p-3 rounded-lg space-y-3 mt-3">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">Input Parameter</span>
                                <div className="grid grid-cols-1 gap-3">
                                  {ep.queryParams.map((q) => (
                                    <div key={q.name} className="flex flex-col gap-1.5">
                                      <label className="text-[10px] text-zinc-400 flex items-center justify-between bg-zinc-950 px-2 py-1 rounded border border-zinc-800/60 max-w-max">
                                        <span>{q.name} <span className="text-zinc-650">({q.options ? "select" : "string"})</span></span>
                                      </label>
                                      {q.options ? (
                                        <select
                                          value={queryParams[q.name] ?? ""}
                                          onChange={(e) => handleQueryParamChange(ep, q.name, e.target.value)}
                                          className="w-full bg-[#050507] border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-zinc-700 transition-all appearance-none cursor-pointer"
                                        >
                                          {q.options.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          placeholder={q.placeholder}
                                          value={queryParams[q.name] ?? ""}
                                          onChange={(e) => handleQueryParamChange(ep, q.name, e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              sendRequest();
                                            }
                                          }}
                                          className="w-full bg-[#050507] border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-700 transition-all"
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Execute Command Bar */}
                            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                              <div className="flex-1 flex items-center font-mono text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                                <span className="pl-3 text-zinc-600 select-none text-[10px] truncate max-w-[130px] sm:max-w-none">
                                  {appBaseUrl}
                                </span>
                                <input
                                  type="text"
                                  value={customPath}
                                  onChange={(e) => setCustomPath(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      sendRequest();
                                    }
                                  }}
                                  className="flex-1 bg-transparent px-2 py-2.5 text-white font-medium focus:outline-none placeholder-zinc-800 text-[11px] font-mono"
                                  placeholder="/api/v1/..."
                                />
                                <button
                                  onClick={() => handleCopyText(`url-${ep.id}`, `${appBaseUrl}${customPath}`)}
                                  className="p-3 text-zinc-500 hover:text-white transition-colors"
                                  title="Copy URL"
                                >
                                  {copiedStates[`url-${ep.id}`] ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>

                              <button
                                onClick={sendRequest}
                                disabled={isLoading}
                                className="px-5 py-2.5 bg-white text-black font-semibold rounded text-xs flex items-center justify-center gap-2 transition-all hover:bg-neutral-200 disabled:opacity-50"
                              >
                                {isLoading ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 fill-black" />
                                )}
                                <span>Execute</span>
                              </button>
                            </div>
                          </div>

                          {/* HTTP STATUS CODES spec list */}
                          <div className="space-y-2.5 pt-2 border-t border-zinc-800/40">
                            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest block">HTTP STATUS CODES</span>
                            <div className="border border-zinc-800 rounded overflow-hidden bg-[#070709]/30">
                              <table className="w-full text-left text-[11px] font-mono leading-relaxed">
                                <thead className="bg-[#08080b] border-b border-zinc-900 text-zinc-500">
                                  <tr>
                                    <th className="px-3 py-1.5 font-bold font-mono">Code</th>
                                    <th className="px-3 py-1.5 font-bold font-mono">Description</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900 text-zinc-400">
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-emerald-400 flex items-center gap-1.5">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                                      200
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500">OK - Request successfull</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-red-400 flex items-center gap-1.5">
                                      <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                                      400
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500">Bad Request - Invalid parameters or missing required fields</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-red-400 flex items-center gap-1.5">
                                      <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                                      405
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500">Method Not Allowed - HTTP method not supported</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-amber-500 flex items-center gap-1.5">
                                      <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                                      429
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500 font-mono">Too Many Requests - Rate limit exceeded</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-red-500 flex items-center gap-1.5">
                                      <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                                      500
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500">Internal Server Error - Server encountered an error</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>                          {/* Interactive live executed data display panel */}
                          {hasAttempted && (
                            <div 
                              ref={responseRef}
                              className="space-y-4 pt-4 border-t border-zinc-800/60 animate-in fade-in slide-in-from-top-2 duration-500 scroll-mt-24"
                            >
                              
                              {isLoading ? (
                                <div className="py-16 flex flex-col items-center justify-center text-zinc-500 gap-3">
                                  <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
                                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] animate-pulse">Mengeksekusi Permintaan...</span>
                                </div>
                              ) : (
                                <>
                                  {/* Inline Command Snippet selectors */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-zinc-500">
                                      <span className="text-[10px] font-bold uppercase tracking-wider">COMMAND</span>
                                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                        {(["curl", "javascript", "python"] as const).map((lang) => (
                                          <button
                                            key={lang}
                                            onClick={() => setSelectedCodeLang(lang)}
                                            className={`px-2 py-0.5 rounded transition-all capitalize ${
                                              selectedCodeLang === lang
                                                ? "bg-zinc-800 text-white font-bold"
                                                : "text-zinc-500 hover:text-zinc-300"
                                            }`}
                                          >
                                            {lang === "curl" ? "cURL" : lang === "javascript" ? "Node.JS" : "Python"}
                                          </button>
                                        ))}
                                        <button
                                          onClick={() => handleCopyText(`code-${ep.id}`, getCodeSnippet(ep, customPath))}
                                          className="ml-2 px-2 py-0.5 bg-zinc-800/50 border border-zinc-700 rounded text-zinc-400 hover:text-white transition-all flex items-center gap-1"
                                        >
                                          {copiedStates[`code-${ep.id}`] ? (
                                            <Check className="h-2.5 w-2.5 text-emerald-400" />
                                          ) : (
                                            <Copy className="h-2.5 w-2.5" />
                                          )}
                                          <span className="text-[9px]">Menyalin</span>
                                        </button>
                                      </div>
                                    </div>

                                    <div className="bg-[#050507] border border-zinc-800 rounded-lg p-3 relative group">
                                      <pre className="text-zinc-300 font-mono text-[11px] overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
                                        {getCodeSnippet(ep, customPath)}
                                      </pre>
                                    </div>
                                  </div>

                                  {/* Live response window pane */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-zinc-500">
                                      <span className="text-[10px] font-bold uppercase tracking-wider">TANGGAPAN</span>
                                      <button
                                        onClick={() => handleCopyText(`json-${ep.id}`, JSON.stringify(apiResponse, null, 2))}
                                        className="text-[10px] text-zinc-500 hover:text-white flex items-center gap-1"
                                        disabled={!apiResponse}
                                      >
                                        {copiedStates[`json-${ep.id}`] ? (
                                          <Check className="h-3 w-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                        <span>Salin JSON</span>
                                      </button>
                                    </div>

                                    <div className="bg-[#050510] border border-zinc-800 rounded-lg p-3 relative h-max min-h-[100px]">
                                      {errorText && (
                                        <div className="text-red-500 text-[11px] font-mono leading-relaxed">
                                          {errorText}
                                        </div>
                                      )}

                                      {!apiResponse && !errorText && !imageUrl && (
                                        <div className="py-8 flex flex-col items-center justify-center text-zinc-600 gap-2 border border-dashed border-zinc-800/60 rounded bg-black/40">
                                          <Terminal className="h-4 w-4 text-zinc-500 animate-pulse" />
                                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 font-mono">Siap Laksanakan</span>
                                          <span className="text-[11px] text-zinc-500 text-center px-4 font-sans max-w-sm">
                                            Sesuaikan parameter di atas jika ada, lalu klik tombol <strong className="text-zinc-400 font-mono text-[10px] border border-zinc-700 bg-zinc-800 px-1 py-0.5 rounded">Execute</strong> atau tekan <strong className="text-zinc-400 font-mono text-[10px] border border-zinc-700 bg-zinc-800 px-1 py-0.5 rounded">Enter</strong> untuk mengirim permintaan otomatis.
                                          </span>
                                        </div>
                                      )}

                                      {apiResponse && (
                                        <pre className="text-zinc-300 font-mono text-[11px] max-h-72 overflow-y-auto overflow-x-auto select-all leading-relaxed whitespace-pre pr-4">
                                          {JSON.stringify(apiResponse, null, 2)}
                                        </pre>
                                      )}

                                      {imageUrl && (
                                        <div className="space-y-3">
                                          <div className="relative group">
                                            <img 
                                              src={imageUrl} 
                                              alt="API Result" 
                                              className="w-full rounded-lg border border-zinc-800 shadow-lg"
                                            />
                                            <div className="absolute top-2 right-2 flex gap-2">
                                              <a 
                                                href={imageUrl} 
                                                download={`canvas-result-${ep.id}.png`}
                                                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md backdrop-blur-md transition-all border border-zinc-700/50"
                                                title="Download Image"
                                              >
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                              </a>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>


                                  </div>
                                </>
                              )}

                            </div>
                          )}

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modern Centered Footer */}
      <footer className="mt-16 border-t border-zinc-800 bg-black/80 py-8 font-sans text-[11px] text-zinc-500 text-center">
        <div className="max-w-4xl mx-auto px-4 space-y-2">
          <p className="tracking-wide">
            © 2026 Cmnty API, All rights reserved.
          </p>
          <p className="text-zinc-700 select-none">
            All requests securely aggregated without third-party exposure. Powered by Node.JS Express & React.
          </p>
        </div>
      </footer>
    </div>
  );
}
