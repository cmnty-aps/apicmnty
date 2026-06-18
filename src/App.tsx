import { useState, useEffect, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { LandingHero } from "./components/LandingHero";
import {
  ArrowLeft,
  LayoutGrid,
  Newspaper,
  Wrench,
  CreditCard,
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
  MoreHorizontal,
  MapPin,
  Cloud,
  Thermometer,
  Wifi,
  MessageCircle,
  Info,
  Gamepad2,
  Music,
  UserSearch,
  Shuffle,
  Download,
  Upload
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
  responseType?: "json" | "image" | "audio";
}

const ENDPOINTS: EndpointSpec[] = [
  // AI CATEGORY
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
    responseType: "audio",
    description: "Ubah teks menjadi suara menggunakan teknologi Gemini TTS murni.",
    queryParams: [
      { name: "text", placeholder: "Teks yang ingin diubah (contoh: halo apa kabar)", defaultValue: "halo apa kabar" }
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
    id: "ai-ideogram",
    category: "ai",
    name: "Ideogram AI",
    provider: "nexray",
    path: "/ai/ideogram",
    method: "GET",
    responseType: "image",
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

  // BERITA CATEGORY
  {
    id: "berita-antara",
    category: "berita",
    name: "Antara",
    provider: "antara",
    path: "/berita/antara",
    method: "GET",
    description: "Mendapatkan rangkuman informasi berita terbaru dari LKBN Antara News Feed."
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
    description: "Mendapatkan rangkuman informasi berita game Free Fire terbaru."
  },

  // CANVAS CATEGORY
  {
    id: "maker-brathd",
    category: "canvas",
    name: "Brat HD Maker",
    provider: "nexray",
    path: "/maker/brathd",
    method: "GET",
    responseType: "image",
    description: "Hasilkan gambar teks bergaya Brat dengan kualitas tinggi yang tajam.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks (contoh: api.cmnty.web.id aja)",
        defaultValue: "api.cmnty.web.id aja"
      }
    ]
  },
  {
    id: "maker-brat",
    category: "canvas",
    name: "Brat Maker",
    provider: "nexray",
    path: "/maker/brat",
    method: "GET",
    responseType: "image",
    description: "Hasilkan gambar teks bergaya Brat kustom dengan kata-kata pilihan Anda.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks (contoh: cmnty universe)",
        defaultValue: "cmnty universe"
      }
    ]
  },
  {
    id: "maker-bratvidhd",
    category: "canvas",
    name: "Bratvid HD Maker",
    provider: "nexray",
    path: "/maker/bratvidhd",
    method: "GET",
    description: "Hasilkan video teks bergaya Brat dengan kualitas HD kustom.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks (contoh: halo semua, nyari api gratis? yg api.cmnty.web.id solusinya)",
        defaultValue: "halo semua, nyari api gratis? yg api.cmnty.web.id solusinya"
      }
    ]
  },
  {
    id: "maker-bratvid",
    category: "canvas",
    name: "Bratvid Maker",
    provider: "nexray",
    path: "/maker/bratvid",
    method: "GET",
    description: "Hasilkan video teks bergaya Brat kustom dengan kata-kata pilihan Anda.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks (contoh: halo semua, nyari api gratis? yg api.cmnty.web.id solusinya)",
        defaultValue: "halo semua, nyari api gratis? yg api.cmnty.web.id solusinya"
      }
    ]
  },
  {
    id: "canvas-ektp",
    category: "canvas",
    name: "EKTP Generator",
    provider: "siputzx",
    path: "/canvas/ektp",
    method: "GET",
    responseType: "image",
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
    responseType: "image",
    description: "Hasilkan gambar bukti saldo DANA palsu dengan nominal kustom. Mengembalikan response dalam bentuk gambar.",
    queryParams: [
      { name: "text", placeholder: "Nominal (contoh: 200000)", defaultValue: "200000" }
    ]
  },
  {
    id: "maker-fakeberita",
    category: "canvas",
    name: "Fake News Maker",
    provider: "nan-z",
    path: "/maker/fakeberita",
    method: "GET",
    responseType: "image",
    description: "Hasilkan gambar parodi berita televisi (Fake News) dengan Headline dan gambar kustom.",
    queryParams: [
      {
        name: "text",
        placeholder: "Headline Berita",
        defaultValue: "Viral! Jokowi mencuri 19jt lapangan pekerjaan dari anaknya"
      },
      {
        name: "url",
        placeholder: "URL Gambar",
        defaultValue: "https://www.upload.ee/image/19400325/images.webp"
      }
    ]
  },
  {
    id: "maker-fakeovo",
    category: "canvas",
    name: "Fake OVO Maker",
    provider: "cuki",
    path: "/maker/fakeovo",
    method: "GET",
    responseType: "image",
    description: "Hasilkan gambar bukti saldo OVO palsu dengan nominal kustom. Mengembalikan response dalam bentuk gambar.",
    queryParams: [
      { name: "amount", placeholder: "Nominal (contoh: 200000)", defaultValue: "200000" }
    ]
  },
  {
    id: "maker-iqc",
    category: "canvas",
    name: "iqc",
    provider: "nexray",
    path: "/maker/iqc",
    method: "GET",
    responseType: "image",
    description: "Membuat gambar IQC kustom dari input dokumen teks atau pesan pilihan Anda.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks Informasi (contoh: cmnty the api free)",
        defaultValue: "cmnty the api free"
      }
    ]
  },
  {
    id: "maker-iqc-group",
    category: "canvas",
    name: "iqc group",
    provider: "cuki",
    path: "/maker/iqc-group",
    method: "GET",
    responseType: "image",
    description: "Hasilkan gambar parodi grup chat QC iPhone kustom dengan setting nama, pesan, baterai, dan waktu.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks Pesan",
        defaultValue: "hai kak 🥺👉🏻👈🏻"
      },
      {
        name: "name",
        placeholder: "Nama",
        defaultValue: "cmnty universe"
      },
      {
        name: "battery",
        placeholder: "Persentase Baterai",
        defaultValue: "100"
      },
      {
        name: "time",
        placeholder: "Waktu (00.00)",
        defaultValue: "00.00"
      }
    ]
  },
  {
    id: "maker-iqc-image",
    category: "canvas",
    name: "iqc-image",
    provider: "cuki",
    path: "/maker/iqc-image",
    method: "GET",
    responseType: "image",
    description: "Hasilkan gambar parodi bukti QC iPhone dengan kustomisasi gambar, teks, baterai, waktu, dan pilihan operator seluler.",
    queryParams: [
      {
        name: "image",
        placeholder: "URL Gambar (https://...)",
        defaultValue: "https://c.termai.cc/i176/VPoSY.png"
      },
      {
        name: "text",
        placeholder: "Teks Pesan",
        defaultValue: "https://api.cmnty.web.id"
      },
      {
        name: "battery",
        placeholder: "Persentase Baterai",
        defaultValue: "100"
      },
      {
        name: "time",
        placeholder: "Waktu (00.00)",
        defaultValue: "00.00"
      },
      {
        name: "provider",
        placeholder: "Pilih Provider",
        defaultValue: "TELKOMSEL",
        options: ["INDOSAT", "XL", "TELKOMSEL", "SMARTFREN", "TRI", "AXIS", "LIVE.ON", "BY.U"]
      }
    ]
  },
  {
    id: "maker-nulis",
    category: "canvas",
    name: "Nulis",
    provider: "nexray",
    path: "/maker/nulis",
    method: "GET",
    responseType: "image",
    description: "Membuat gambar tulisan dengan gaya buku tulis.",
    queryParams: [
      {
        name: "text",
        placeholder: "Masukkan teks untuk ditulis di buku tulis",
        defaultValue: "Detik tak pernah menunggu, Tapi selalu memberi ruang. Untuk mereka yang berani Memulai meski terlambat."
      }
    ]
  },
  {
    id: "maker-qc",
    category: "canvas",
    name: "Qc Maker",
    provider: "nexray",
    path: "/maker/qc",
    method: "GET",
    responseType: "image",
    description: "Membuat gambar quoted chat dari teks.",
    queryParams: [
      {
        name: "text",
        placeholder: "Teks",
        defaultValue: "halo semua welcome to api cmnty"
      },
      {
        name: "name",
        placeholder: "Nama",
        defaultValue: "cmnty"
      },
      {
        name: "avatar",
        placeholder: "URL Avatar",
        defaultValue: "https://c.termai.cc/i176/VPoSY.png"
      },
      {
        name: "color",
        placeholder: "Warna (misal: kuning)",
        defaultValue: "kuning"
      }
    ]
  },
  {
    id: "maker-smeme",
    category: "canvas",
    name: "Smeme Maker",
    provider: "nexray",
    path: "/maker/smeme",
    method: "GET",
    responseType: "image",
    description: "Membuat meme dengan teks atas dan bawah.",
    queryParams: [
      {
        name: "text_atas",
        placeholder: "Teks Atas",
        defaultValue: "halo"
      },
      {
        name: "text_bawah",
        placeholder: "Teks Bawah",
        defaultValue: "apa kabar"
      },
      {
        name: "background",
        placeholder: "URL Latar Belakang",
        defaultValue: "https://c.termai.cc/i176/VPoSY.png"
      }
    ]
  },
  {
    id: "canvas-starboy",
    category: "canvas",
    name: "Starboy Canvas",
    provider: "cuki",
    path: "/canvas/starboy",
    method: "GET",
    responseType: "image",
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
    responseType: "image",
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
    responseType: "image",
    description: "Memasukkan subjek ke dalam template susu taro menggunakan penghapusan latar belakang otomatis. Mengembalikan response dalam bentuk image buffer.",
    queryParams: [
      { name: "image", placeholder: "URL Gambar (https://...)", defaultValue: "https://uploader.zenzxz.dpdns.org/uploads/1777998261437.jpeg" }
    ]
  },

  // DOWNLOADER CATEGORY
  {
    id: "downloader-capcut",
    category: "downloader",
    name: "CapCut Downloader",
    provider: "siputzx",
    path: "/downloader/capcut",
    method: "GET",
    description: "Mengunduh video CapCut tanpa watermark menggunakan URL CapCut.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL video CapCut", defaultValue: "https://www.capcut.com/tv2/ZSmm1R7Sd/" }
    ]
  },
  {
    id: "downloader-douyin",
    category: "downloader",
    name: "Douyin Downloader",
    provider: "siputzx",
    path: "/downloader/douyin",
    method: "GET",
    description: "Mengunduh video Douyin menggunakan URL video Douyin.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL video Douyin", defaultValue: "https://www.douyin.com/video/7256984651137289483" }
    ]
  },
  {
    id: "downloader-facebook",
    category: "downloader",
    name: "Facebook Downloader",
    provider: "siputzx",
    path: "/downloader/facebook",
    method: "GET",
    description: "Mengunduh video dari Facebook dalam berbagai kualitas (SD, HD, 4K) menggunakan layanan SnapVid.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL video Facebook", defaultValue: "https://www.facebook.com/share/r/1CbPCn9MQw/" }
    ]
  },
  {
    id: "downloader-gdrive",
    category: "downloader",
    name: "GDrive Downloader",
    provider: "siputzx",
    path: "/downloader/gdrive",
    method: "GET",
    description: "Mendapatkan link download langsung untuk file Google Drive menggunakan URL publik file tersebut.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL file Google Drive", defaultValue: "https://drive.google.com/file/d/1YTD7Ymux9puFNqu__5WPlYdFZHcGI3Wz/view?usp=drivesdk" }
    ]
  },
  {
    id: "downloader-github",
    category: "downloader",
    name: "GitHub Downloader",
    provider: "GitHub",
    path: "/downloader/github",
    method: "GET",
    description: "Mengunduh atau memperoleh data terstruktur (repositori, file, raw, atau gist) secara langsung dari GitHub.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL GitHub (Repo, File, Raw, atau Gist)", defaultValue: "https://github.com/octocat/Spoon-Knife" }
    ]
  },
  {
    id: "downloader-lahelu",
    category: "downloader",
    name: "Lahelu Downloader",
    provider: "siputzx",
    path: "/downloader/lahelu",
    method: "GET",
    description: "Mengambil informasi media dan metadata dari post Lahelu.com menggunakan URL post.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL post Lahelu.com", defaultValue: "https://lahelu.com/post/PMujNAfxy" }
    ]
  },
  {
    id: "downloader-snackvideo",
    category: "downloader",
    name: "SnackVideo Downloader",
    provider: "siputzx",
    path: "/downloader/snackvideo",
    method: "GET",
    description: "Mengunduh informasi detail dan link unduhan langsung dari video SnackVideo.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL video SnackVideo", defaultValue: "https://s.snackvideo.com/p/dwlMd51U" }
    ]
  },
  {
    id: "downloader-tiktok",
    category: "downloader",
    name: "TikTok Downloader",
    provider: "siputzx",
    path: "/downloader/tiktok",
    method: "GET",
    description: "Mengunduh video atau slideshow TikTok menggunakan engine SnapTik.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL video TikTok", defaultValue: "https://vt.tiktok.com/ZSjXNEnbC/" }
    ]
  },
  {
    id: "downloader-tiktokv1",
    category: "downloader",
    name: "TikTok Downloader V1",
    provider: "siputzx",
    path: "/downloader/tiktokv1",
    method: "GET",
    description: "Mengunduh video dan foto TikTok menggunakan URL TikTok.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL video atau foto TikTok", defaultValue: "https://vt.tiktok.com/ZSjXNEnbC/" }
    ]
  },
  {
    id: "downloader-twitter",
    category: "downloader",
    name: "Twitter Downloader",
    provider: "siputzx",
    path: "/downloader/twitter",
    method: "GET",
    description: "Mengunduh video dari Twitter/X menggunakan URL postingan.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL postingan Twitter/X", defaultValue: "https://twitter.com/9GAG/status/1661175429859012608" }
    ]
  },
  {
    id: "downloader-ummy",
    category: "downloader",
    name: "Ummy Downloader",
    provider: "siputzx",
    path: "/downloader/ummy",
    method: "GET",
    description: "Downloader universal dan pengambil informasi profil/stalker Instagram melalui engine ummy.net.",
    queryParams: [
      { name: "url", placeholder: "Masukkan URL atau username Instagram", defaultValue: "nasaartemis" }
    ]
  },

  // GAME CATEGORY
  {
    id: "game-asahotak",
    category: "game",
    name: "Asah Otak (Kuis)",
    provider: "siputzx",
    path: "/game/asahotak",
    method: "GET",
    description: "Mendapatkan kuis game Asah Otak acak untuk mengasah otak Anda dengan pertanyaan cerdas dan kunci jawabannya."
  },
  {
    id: "game-caklontong",
    category: "game",
    name: "Cak Lontong (Kuis)",
    provider: "siputzx",
    path: "/game/caklontong",
    method: "GET",
    description: "Mendapatkan kuis game Cak Lontong acak dengan pertanyaan, deskripsi deskriptif, dan kunci jawaban."
  },
  {
    id: "game-cc-sd",
    category: "game",
    name: "Cerdas Cermat SD (Kuis)",
    provider: "siputzx",
    path: "/game/cc-sd",
    method: "GET",
    description: "Mendapatkan soal cerdas cermat SD dengan mata pelajaran kustom (Matematika, IPA, IPS, Bahasa Indonesia, dll) dan jumlah soal kustom.",
    queryParams: [
      {
        name: "matapelajaran",
        placeholder: "Pilih mapel (matematika, ipa, ips, bindo, dll)",
        defaultValue: "matematika",
        options: ["bindo", "tik", "pkn", "bing", "penjas", "pai", "matematika", "jawa", "ips", "ipa"]
      },
      {
        name: "jumlahsoal",
        placeholder: "Jumlah soal (contoh: 5)",
        defaultValue: "5"
      }
    ]
  },
  {
    id: "game-family100",
    category: "game",
    name: "Family 100 (Kuis)",
    provider: "siputzx",
    path: "/game/family100",
    method: "GET",
    description: "Mendapatkan kuis game Family 100 acak lengkap dengan pertanyaan dan jawaban survei populer."
  },
  {
    id: "game-lengkapikalimat",
    category: "game",
    name: "Lengkapi Kalimat (Kuis)",
    provider: "siputzx",
    path: "/game/lengkapikalimat",
    method: "GET",
    description: "Mendapatkan kuis game Lengkapi Kalimat acak dengan pertanyaan, opsi kunci jawaban, dan petunjuk bantuan."
  },
  {
    id: "game-susunkata",
    category: "game",
    name: "Susun Kata (Kuis)",
    provider: "siputzx",
    path: "/game/susunkata",
    method: "GET",
    description: "Mendapatkan kuis game Susun Kata acak dengan pertanyaan, petunjuk bantuan, dan kunci jawaban."
  },
  {
    id: "game-tebakjkt",
    category: "game",
    name: "Tebak JKT48 (Kuis)",
    provider: "siputzx",
    path: "/game/tebakjkt",
    method: "GET",
    description: "Mendapatkan kuis tebak member JKT48 acak yang berisi foto siluet/petunjuk member dan jawabannya."
  },
  {
    id: "game-karakterff",
    category: "game",
    name: "Karakter Free Fire (Kuis)",
    provider: "siputzx",
    path: "/game/karakter-freefire",
    method: "GET",
    description: "Mendapatkan kuis game gratis tebak Karakter Free Fire acak lengkap dengan petunjuk gambar dan jawaban."
  },
  {
    id: "game-tebakbendera",
    category: "game",
    name: "Tebak Bendera (Kuis)",
    provider: "siputzx",
    path: "/game/tebakbendera",
    method: "GET",
    description: "Mendapatkan kuis tebak bendera negara acak lengkap dengan gambar bendera dan kunci jawabannya."
  },
  {
    id: "game-tebakkartun",
    category: "game",
    name: "Tebak Kartun (Kuis)",
    provider: "siputzx",
    path: "/game/tebakkartun",
    method: "GET",
    description: "Mendapatkan kuis tebak kartun populer acak lengkap dengan petunjuk gambar dan kunci jawabannya."
  },
  {
    id: "game-tebakgambar",
    category: "game",
    name: "Tebak Gambar (Kuis)",
    provider: "siputzx",
    path: "/game/tebakgambar",
    method: "GET",
    description: "Mendapatkan kuis game gratis tebak gambar acak lengkap dengan petunjuk gambar dan jawaban."
  },
  {
    id: "game-tebakgame",
    category: "game",
    name: "Tebak Game (Kuis)",
    provider: "siputzx",
    path: "/game/tebakgame",
    method: "GET",
    description: "Mendapatkan kuis game gratis tebak judul game acak lengkap dengan petunjuk gambar/deskripsi dan kunci jawaban."
  },
  {
    id: "game-tebakheroml",
    category: "game",
    name: "Tebak Hero ML (Kuis)",
    provider: "siputzx",
    path: "/game/tebakheroml",
    method: "GET",
    description: "Mendapatkan kuis game tebak nama Hero Mobile Legends: Bang Bang acak berdasarkan siluet, deskripsi, atau gambar."
  },
  {
    id: "game-tebaklagu",
    category: "game",
    name: "Tebak Lagu (Kuis)",
    provider: "siputzx",
    path: "/game/tebaklagu",
    method: "GET",
    description: "Mendapatkan kuis tebak judul lagu acak yang berisi petunjuk audio/deskripsi lagu dan jawaban."
  },
  {
    id: "game-tebaklirik",
    category: "game",
    name: "Tebak Lirik (Kuis)",
    provider: "siputzx",
    path: "/game/tebaklirik",
    method: "GET",
    description: "Mendapatkan kuis game gratis tebak lirik lagu acak dengan penggalan lirik lagu dan jawaban lengkap."
  },
  {
    id: "game-tebakkata",
    category: "game",
    name: "Tebak Kata (Kuis)",
    provider: "siputzx",
    path: "/game/tebakkata",
    method: "GET",
    description: "Mendapatkan kuis tebak kata acak lengkap dengan petunjuk pemicu pemikiran dan solusi jawaban."
  },
  {
    id: "game-tebakkimia",
    category: "game",
    name: "Tebak Kimia (Kuis)",
    provider: "siputzx",
    path: "/game/tebakkimia",
    method: "GET",
    description: "Mendapatkan kuis tebak unsur atau senyawa kimia secara acak yang berisi lambang/nama beserta jawaban lengkap."
  },
  {
    id: "game-tebakkalimat",
    category: "game",
    name: "Tebak Kalimat (Kuis)",
    provider: "siputzx",
    path: "/game/tebakkalimat",
    method: "GET",
    description: "Mendapatkan kuis game Tebak Kalimat acak dengan pertanyaan, petunjuk bantuan, dan kunci jawaban."
  },
  {
    id: "game-tebaklogo",
    category: "game",
    name: "Tebak Logo (Kuis)",
    provider: "siputzx",
    path: "/game/tebaklogo",
    method: "GET",
    description: "Mendapatkan kuis tebak logo perusahaan/organisasi acak yang berisi gambar logo dan kunci jawaban."
  },
  {
    id: "game-tebaksurah",
    category: "game",
    name: "Tebak Surah (Kuis)",
    provider: "siputzx",
    path: "/game/surah",
    method: "GET",
    description: "Mendapatkan kuis game Tebak Surah acak dari Al-Qur'an untuk menebak nama surah berdasarkan ayat."
  },
  {
    id: "game-tebaktebakan",
    category: "game",
    name: "Tebak-tebakan (Kuis)",
    provider: "siputzx",
    path: "/game/tebaktebakan",
    method: "GET",
    description: "Mendapatkan kuis Tebak-tebakan jenaka dan teka-teki lucu acak lengkap dengan kunci jawabannya."
  },
  {
    id: "game-tebakwarna",
    category: "game",
    name: "Tebak Warna (Kuis)",
    provider: "siputzx",
    path: "/game/tebakwarna",
    method: "GET",
    description: "Mendapatkan kuis game Tebak Warna acak yang berisi gambar/deskripsi warna dan kunci jawaban."
  },
  {
    id: "game-tekateki",
    category: "game",
    name: "Teka Teki (Kuis)",
    provider: "siputzx",
    path: "/game/tekateki",
    method: "GET",
    description: "Mendapatkan kuis game Teka Teki acak dengan pertanyaan, petunjuk, dan kunci jawaban."
  },

  // INFORMATION CATEGORY
  {
    id: "information-cuaca",
    category: "information",
    name: "Informasi Cuaca BMKG",
    provider: "nexray",
    path: "/information/cuaca",
    method: "GET",
    description: "Mendapatkan data prakiraan cuaca dari BMKG untuk kota/lokasi spesifik.",
    queryParams: [
      {
        name: "kota",
        placeholder: "Pilih kota (contoh: jakarta)",
        defaultValue: "Cendana, kutasari, Jawa tengah"
      }
    ]
  },
  {
    id: "information-gempa",
    category: "information",
    name: "Informasi Gempa BMKG",
    provider: "nexray",
    path: "/information/gempa",
    method: "GET",
    description: "Mendapatkan data informasi gempa bumi terkini dari BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)."
  },
  {
    id: "information-growagarden",
    category: "information",
    name: "Grow A Garden Stock",
    provider: "nexray",
    path: "/information/growagarden",
    method: "GET",
    description: "Mendapatkan informasi data stok dari merchant Grow A Garden."
  },
  {
    id: "information-harilibur",
    category: "information",
    name: "Hari Libur Nasional",
    provider: "nexray",
    path: "/information/hari-libur",
    method: "GET",
    description: "Mendapatkan data informasi jadwal hari libur nasional."
  },
  {
    id: "information-jadwalbola",
    category: "information",
    name: "Jadwal Sepakbola",
    provider: "nexray",
    path: "/information/jadwalbola",
    method: "GET",
    description: "Mendapatkan jadwal pertandingan sepakbola terkini."
  },
  {
    id: "information-jadwalsholat",
    category: "information",
    name: "Jadwal Sholat",
    provider: "nexray",
    path: "/information/jadwalsholat",
    method: "GET",
    description: "Mendapatkan jadwal sholat untuk kota spesifik.",
    queryParams: [
      { name: "kota", placeholder: "purwokerto", defaultValue: "purwokerto" }
    ]
  },
  {
    id: "information-jadwaltv",
    category: "information",
    name: "Jadwal TV",
    provider: "nexray",
    path: "/information/jadwaltv",
    method: "GET",
    description: "Mendapatkan Jadwal TV untuk channel spesifik.",
    queryParams: [
      { name: "channel", placeholder: "mnctv", defaultValue: "mnctv" }
    ]
  },

  // PAYMENT CATEGORY
  {
    id: "payment-saweriacreate",
    category: "payment",
    name: "Saweria Create",
    provider: "nexray",
    path: "/payment/saweria/create",
    method: "GET",
    description: "Membuat detail transaksi pembayaran saweria menggunakan parameter username, nominal, sender, email, dan pesan.",
    queryParams: [
      { name: "username", placeholder: "Username Saweria (contoh: ojixcmnty)", defaultValue: "ojixcmnty" },
      { name: "amount", placeholder: "Nominal saldo (contoh: 10000)", defaultValue: "10000" },
      { name: "sender", placeholder: "Nama pengirim (contoh: oji)", defaultValue: "oji" },
      { name: "email", placeholder: "Email pengirim (contoh: cmnty.api@gmail.com)", defaultValue: "cmnty.api@gmail.com" },
      { name: "pesan", placeholder: "Pesan untuk penerima (contoh: halo)", defaultValue: "halo" }
    ]
  },
  {
    id: "payment-saweriacheck",
    category: "payment",
    name: "Saweria Check",
    provider: "nexray",
    path: "/payment/saweria/check",
    method: "GET",
    description: "Cek status pembayaran saweria menggunakan ID transaksi.",
    queryParams: [
      { name: "transactionid", placeholder: "ID Transaksi (contoh: 2a277a97-c9b2-4fc3-a27d-72fd89025124)", defaultValue: "2a277a97-c9b2-4fc3-a27d-72fd89025124" }
    ]
  },

  // RANDOM CATEGORY
  {
    id: "random-hentai",
    category: "random",
    name: "Random Hentai",
    provider: "ourin",
    path: "/random/hentai",
    method: "GET",
    responseType: "image",
    description: "Mendapatkan gambar anime hentai secara acak untuk keperluan koleksi atau referensi.",
  },
  {
    id: "random-kasedaiki",
    category: "random",
    name: "Random Kasedaiki",
    provider: "ourin",
    path: "/random/kasedaiki",
    method: "GET",
    responseType: "image",
    description: "Mendapatkan gambar anime Kasedaiki secara acak.",
  },
  {
    id: "random-animegangbang",
    category: "random",
    name: "Anime Gangbang",
    provider: "ourin",
    path: "/random/animegangbang",
    method: "GET",
    responseType: "image",
    description: "Mendapatkan gambar Anime Gangbang secara acak.",
  },

  // SEARCH CATEGORY
  {
    id: "search-applemusic",
    category: "search",
    name: "Apple Music",
    provider: "nexray",
    path: "/search/applemusic",
    method: "GET",
    description: "Mencari musik atau lagu favorit Anda secara langsung di Apple Music.",
    queryParams: [
      { name: "q", placeholder: "Jogja istimewa", defaultValue: "Jogja istimewa" }
    ]
  },
  {
    id: "search-bilibili",
    category: "search",
    name: "Bilibili Search",
    provider: "nexray",
    path: "/search/bilibili",
    method: "GET",
    description: "Mencari video menarik di platform Bilibili berdasarkan kata kunci.",
    queryParams: [
      { name: "q", placeholder: "anime", defaultValue: "anime" }
    ]
  },
  {
    id: "search-bingimage",
    category: "search",
    name: "Bing Image Search",
    provider: "nexray",
    path: "/search/bingimage",
    method: "GET",
    description: "Mencari dan menampilkan berbagai gambar berkualitas tinggi menggunakan Bing Image Search.",
    queryParams: [
      { name: "q", placeholder: "kucing", defaultValue: "kucing" }
    ]
  },
  {
    id: "search-capcut",
    category: "search",
    name: "CapCut Search",
    provider: "nexray",
    path: "/search/capcut",
    method: "GET",
    description: "Mencari template video CapCut populer dan menarik rasa ingin tahu Anda.",
    queryParams: [
      { name: "q", placeholder: "jj", defaultValue: "jj" }
    ]
  },
  {
    id: "search-github",
    category: "search",
    name: "GitHub Search",
    provider: "nexray",
    path: "/search/github",
    method: "GET",
    description: "Mencari berkas, kode, atau repositori di GitHub berdasarkan kata kunci.",
    queryParams: [
      { name: "q", placeholder: "Bot whatsapp", defaultValue: "Bot whatsapp" }
    ]
  },
  {
    id: "search-happymood",
    category: "search",
    name: "HappyMood Search",
    provider: "nexray",
    path: "/search/happymood",
    method: "GET",
    description: "Mencari game dan aplikasi modifikasi pilihan Anda di HappyMod secara gratis.",
    queryParams: [
      { name: "q", placeholder: "Mobile legend", defaultValue: "Mobile legend" }
    ]
  },
  {
    id: "search-lyrics",
    category: "search",
    name: "Lyrics Search",
    provider: "nexray",
    path: "/search/lyrics",
    method: "GET",
    description: "Mencari lirik lagu lengkap berdasarkan judul lagu pilihan Anda.",
    queryParams: [
      { name: "q", placeholder: "someone like you", defaultValue: "someone like you" }
    ]
  },
  {
    id: "search-npmjs",
    category: "search",
    name: "NPM Package",
    provider: "nexray",
    path: "/search/npmjs",
    method: "GET",
    description: "Mencari dan menemukan berkas package langsung dari NPM registry.",
    queryParams: [
      { name: "q", placeholder: "api", defaultValue: "api" }
    ]
  },
  {
    id: "search-pinterest",
    category: "search",
    name: "Pinterest Search",
    provider: "nexray",
    path: "/search/pinterest",
    method: "GET",
    description: "Mencari foto, ide kreatif, atau wallpaper estetika di Pinterest.",
    queryParams: [
      { name: "q", placeholder: "pp couple", defaultValue: "pp couple" }
    ]
  },
  {
    id: "search-resep",
    category: "search",
    name: "Resep Koki",
    provider: "nexray",
    path: "/search/resep",
    method: "GET",
    description: "Mencari resep makanan lezat nusantara langsung dari ResepKoki.id.",
    queryParams: [
      { name: "q", placeholder: "rendang", defaultValue: "rendang" }
    ]
  },
  {
    id: "search-sfile",
    category: "search",
    name: "SFile Search",
    provider: "nexray",
    path: "/search/sfile",
    method: "GET",
    description: "Mencari dan menemukan file yang di-upload di SFile.mobi.",
    queryParams: [
      { name: "q", placeholder: "scrape", defaultValue: "scrape" }
    ]
  },
  {
    id: "search-soundcloud",
    category: "search",
    name: "SoundCloud Search",
    provider: "nexray",
    path: "/search/soundcloud",
    method: "GET",
    description: "Mencari dan mendengarkan berbagai lagu menarik di SoundCloud.",
    queryParams: [
      { name: "q", placeholder: "mangu", defaultValue: "mangu" }
    ]
  },
  {
    id: "search-spotify",
    category: "search",
    name: "Spotify Search",
    provider: "nexray",
    path: "/search/spotify",
    method: "GET",
    description: "Mencari lagu atau album favorit di Spotify.",
    queryParams: [
      { name: "q", placeholder: "jakarta hari ini", defaultValue: "jakarta hari ini" }
    ]
  },
  {
    id: "search-tiktok",
    category: "search",
    name: "TikTok Search",
    provider: "nexray",
    path: "/search/tiktok",
    method: "GET",
    description: "Mencari video, pengguna, atau konten populer di TikTok.",
    queryParams: [
      { name: "q", placeholder: "vilmei", defaultValue: "vilmei" }
    ]
  },

  // STALKER CATEGORY
  {
    id: "stalker-github",
    category: "stalker",
    name: "GitHub Stalker",
    provider: "nexray",
    path: "/stalker/github",
    method: "GET",
    description: "Mendapatkan rincian detail akun GitHub berdasarkan username.",
    queryParams: [
      { name: "username", placeholder: "Creatorsitee", defaultValue: "Creatorsitee" }
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
  },
  {
    id: "stalker-v1-mlbb",
    category: "stalker",
    name: "Mobile Legends Stalker v1",
    provider: "nexray",
    path: "/stalker/v1/mlbb",
    method: "GET",
    description: "Mendapatkan informasi detail akun Mobile Legends: Bang Bang v1 dengan User ID dan Zone ID.",
    queryParams: [
      { name: "id", placeholder: "User ID (contoh: 11111)", defaultValue: "11111" },
      { name: "zone", placeholder: "Zone ID (contoh: 11111)", defaultValue: "11111" }
    ]
  },
  {
    id: "stalker-npmjs",
    category: "stalker",
    name: "NPM Package",
    provider: "nexray",
    path: "/stalker/npmjs",
    method: "GET",
    description: "Mendapatkan rincian informasi dan detail versi dari paket NPM.",
    queryParams: [
      { name: "name", placeholder: "baileys", defaultValue: "baileys" }
    ]
  },
  {
    id: "stalker-roblox",
    category: "stalker",
    name: "Roblox Stalker",
    provider: "nexray",
    path: "/stalker/roblox",
    method: "GET",
    description: "Mendapatkan rincian detail akun Roblox berdasarkan username.",
    queryParams: [
      { name: "username", placeholder: "Builderman", defaultValue: "Builderman" }
    ]
  },
  {
    id: "stalker-tiktok",
    category: "stalker",
    name: "TikTok Stalker",
    provider: "nexray",
    path: "/stalker/tiktok",
    method: "GET",
    description: "Mendapatkan rincian detail profil akun TikTok berdasarkan username.",
    queryParams: [
      { name: "username", placeholder: "cmnty.official", defaultValue: "cmnty.official" }
    ]
  },

  // TOOLS CATEGORY
  {
    id: "tools-infonegara",
    category: "tools",
    name: "Info Negara",
    provider: "cuki",
    path: "/tools/infonegara",
    method: "GET",
    description: "Mendapatkan informasi detail mengenai suatu negara termasuk bendera, mata uang, bahasa, dan data lainnya.",
    queryParams: [
      { name: "name", placeholder: "Nama negara (contoh: Indonesia)", defaultValue: "Indonesia" }
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
    id: "tools-blurface",
    category: "tools",
    name: "Blur Face (Sensor Wajah)",
    provider: "nexray",
    path: "/tools/blurface",
    method: "GET",
    responseType: "image",
    description: "Mendeteksi wajah dalam gambar secara otomatis dan memberikan efek blur/sensor yang rapi.",
    queryParams: [
      { name: "url", placeholder: "https://uploader.zenzxz.dpdns.org/uploads/1766513795520.jpeg", defaultValue: "https://uploader.zenzxz.dpdns.org/uploads/1766513795520.jpeg" }
    ]
  },
  {
    id: "tools-removebg",
    category: "tools",
    name: "Removebg (Hapus Background)",
    provider: "nexray",
    path: "/tools/removebg",
    method: "GET",
    responseType: "image",
    description: "Menghapus background dari gambar dengan rapi menggunakan teknologi AI canggih.",
    queryParams: [
      { name: "url", placeholder: "https://api.cmnty.web.id/view-v1/i147/8EoJeQ.jpg", defaultValue: "https://api.cmnty.web.id/view-v1/i147/8EoJeQ.jpg" }
    ]
  },
  {
    id: "tools-ssweb",
    category: "tools",
    name: "Website Screenshot",
    provider: "siputzx",
    path: "/tools/ssweb",
    method: "GET",
    responseType: "image",
    description: "Mengambil tangkapan layar (screenshot) dari sebuah website berdasarkan URL yang diberikan dengan pilihan perangkat, tema, dan mode satu halaman penuh.",
    queryParams: [
      { name: "url", placeholder: "https://example.com", defaultValue: "https://api.cmnty.web.id" },
      { 
        name: "device", 
        placeholder: "Pilih Perangkat", 
        defaultValue: "desktop",
        options: ["desktop", "mobile", "tablet"]
      },
      { 
        name: "theme", 
        placeholder: "Pilih Tema", 
        defaultValue: "dark",
        options: ["dark", "light"]
      },
      { 
        name: "fullPage", 
        placeholder: "Halaman Penuh?", 
        defaultValue: "false",
        options: ["true", "false"]
      }
    ]
  },
  {
    id: "tools-translate",
    category: "tools",
    name: "Translate",
    provider: "siputzx",
    path: "/tools/translate",
    method: "GET",
    description: "Menerjemahkan teks dari satu bahasa ke bahasa lain secara akurat menggunakan layanan penerjemahan instan.",
    queryParams: [
      { name: "text", placeholder: "Teks yang ingin diterjemahkan", defaultValue: "I love you" },
      { 
        name: "source", 
        placeholder: "Bahasa asal", 
        defaultValue: "en",
        options: ["en", "id", "ja", "ko", "zh", "fr", "de", "es", "ar", "ru"]
      },
      { 
        name: "target", 
        placeholder: "Bahasa tujuan", 
        defaultValue: "id",
        options: ["id", "en", "ja", "ko", "zh", "fr", "de", "es", "ar", "ru"]
      }
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
    id: "uploader-upload",
    category: "uploader",
    name: "Uploader File",
    provider: "cfiles",
    path: "/uploader/upload",
    method: "POST",
    description: "Mengunggah berkas apa saja (gambar, audio, dokumen, video, dll) secara gratis dan aman, lalu mendapatkan URL publik yang dapat diakses langsung.",
    queryParams: [
      { name: "file", placeholder: "Pilih berkas untuk diunggah", defaultValue: "" }
    ]
  },
  {
    id: "uploader-upload-v1",
    category: "uploader",
    name: "Uploader File V1",
    provider: "termai",
    path: "/uploader/upload-v1",
    method: "POST",
    description: "Mengunggah berkas apa saja (gambar, audio, dokumen, video, dll) secara gratis dan aman, lalu mendapatkan URL publik yang dapat diakses langsung.",
    queryParams: [
      { name: "file", placeholder: "Pilih berkas untuk diunggah", defaultValue: "" }
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

  // Custom upload file hook/state
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Oji Administration state
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem("oji_admin_auth") === "true";
  });
  const [adminFiles, setAdminFiles] = useState<any[]>([]);
  const [adminFilesLoading, setAdminFilesLoading] = useState(false);
  const [adminFilesError, setAdminFilesError] = useState<string | null>(null);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [deleteConfirmationFile, setDeleteConfirmationFile] = useState<string | null>(null);

  // Clean-up file selection on card expand change
  useEffect(() => {
    setUploadFile(null);
  }, [expandedCardId]);

  const fetchAdminFiles = async () => {
    setAdminFilesLoading(true);
    setAdminFilesError(null);
    try {
      const pass = sessionStorage.getItem("oji_admin_pass") || "";
      const res = await fetch(`/api/oji/files?password=${encodeURIComponent(pass)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setAdminFiles(data.result);
        } else {
          setAdminFilesError(data.message || "Gagal mengambil data berkas.");
        }
      } else {
        const errData = await res.json().catch(() => ({ message: "Akses ditolak." }));
        setAdminFilesError(errData.message || "Gagal berkomunikasi dengan server.");
      }
    } catch (err) {
      setAdminFilesError("Kesalahan jaringan.");
    } finally {
      setAdminFilesLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchAdminFiles();
    }
  }, [isAdminAuthenticated]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFilesLoading(true);
    setAdminFilesError(null);
    try {
      const res = await fetch(`/api/oji/files?password=${encodeURIComponent(adminPassword)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          sessionStorage.setItem("oji_admin_auth", "true");
          sessionStorage.setItem("oji_admin_pass", adminPassword);
          setIsAdminAuthenticated(true);
          setAdminFiles(data.result);
        } else {
          setAdminFilesError("Kata sandi salah. Coba lagi.");
        }
      } else {
        const errData = await res.json().catch(() => ({ message: "Akses ditolak." }));
        setAdminFilesError(errData.message || "Kata sandi salah atau tidak diizinkan.");
      }
    } catch (err) {
      setAdminFilesError("Kesalahan jaringan.");
    } finally {
      setAdminFilesLoading(false);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("oji_admin_auth");
    sessionStorage.removeItem("oji_admin_pass");
    setIsAdminAuthenticated(false);
    setAdminFiles([]);
  };

  const handleAdminDeleteFile = async (filename: string) => {
    try {
      const pass = sessionStorage.getItem("oji_admin_pass") || "";
      const res = await fetch(`/api/oji/delete?password=${encodeURIComponent(pass)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ filename })
      });
      if (res.ok) {
        // Refresh files
        fetchAdminFiles();
        setDeleteConfirmationFile(null);
      } else {
        const data = await res.json().catch(() => ({ message: "Gagal menghapus berkas." }));
        alert(data.message || "Gagal menghapus berkas.");
      }
    } catch (err) {
      alert("Terjadi kesalahan koneksi.");
    }
  };

  // Auto-scroll to response when result arrives
  useEffect(() => {
    if (hasAttempted && !isLoading && (apiResponse || imageUrl || errorText)) {
      setTimeout(() => {
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isLoading, apiResponse, imageUrl, errorText, hasAttempted]);

  // Application View State
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = location.pathname === "/docs" 
    ? "explorer" 
    : location.pathname === "/oji" 
    ? "admin" 
    : "landing";

  const navigateTo = (view: "landing" | "explorer" | "admin") => {
    navigate(view === "explorer" ? "/docs" : view === "admin" ? "/oji" : "/");
  };

  // General Application Copy helpers
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("isDarkMode");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem("isDarkMode", isDarkMode.toString());
    const themeColor = isDarkMode ? "#040405" : "#ffffff";
    const statusBarStyle = isDarkMode ? "black-translucent" : "default";

    const updateMetaContent = (nameSelector: string, content: string) => {
        const meta = document.querySelector(`meta[name="${nameSelector}"]`);
        if (meta) meta.setAttribute("content", content);
    };

    updateMetaContent("theme-color", themeColor);
    updateMetaContent("msapplication-TileColor", themeColor);
    updateMetaContent("msapplication-navbutton-color", themeColor);
    updateMetaContent("apple-mobile-web-app-status-bar-style", statusBarStyle);

    if (isDarkMode) {
      document.documentElement.classList.remove("light-theme");
    } else {
      document.documentElement.classList.add("light-theme");
    }
  }, [isDarkMode]);

  // Visitor monitoring
  const [visitorInfo, setVisitorInfo] = useState<any>(null);
  const [visitorLoading, setVisitorLoading] = useState<boolean>(true);
  const [visitorError, setVisitorError] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(14);
  const [appIsLoading, setAppIsLoading] = useState(true);

  useEffect(() => {
    // Reveal app after short delay for loading animation
    const timer = setTimeout(() => {
      setAppIsLoading(false);
    }, 3500); // 3.5s loading time
    return () => clearTimeout(timer);
  }, []);

  const fetchVisitorInfo = async () => {
    setVisitorLoading(true);
    setVisitorError(null);
    try {
      let clientIp = "";
      // Pre-detect real client IP from public external browser API for 100% dynamic device compatibility
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (ipRes.ok) {
          const body = await ipRes.json();
          if (body && body.ip) {
            clientIp = body.ip;
          }
        }
      } catch (err) {
        console.warn("Client-side IP pre-fetch timed out, system will detect via request headers", err);
      }

      const url = clientIp ? `/api/tools/visitor?ip=${clientIp}` : "/api/tools/visitor";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status) {
          setVisitorInfo(data.result);
        } else {
          setVisitorError("Gagal mendeteksi informasi kunjungan.");
        }
      } else {
        setVisitorError("Server mengembalikan status error.");
      }
    } catch (err) {
      setVisitorError("Kesalahan jaringan.");
    } finally {
      setVisitorLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitorInfo();
  }, []);

  // Webtozip & Content Theft Protection System
  useEffect(() => {
    // 1. Block offline file execution (e.g., double clicking downloaded index.html)
    if (window.location.protocol === "file:") {
      document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #040405; color: #ef4444; font-family: sans-serif; text-align: center; padding: 20px;">
          <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 12px; letter-spacing: -0.025em;">AKSES DITOLAK (ACCESS DENIED)</h1>
          <p style="color: #a1a1aa; font-size: 14px; max-width: 500px; line-height: 1.6;">Pencurian atau penggandaan file/kode web terdeteksi. Berkas lokal tidak diizinkan untuk dijalankan secara langsung. Seluruh sistem dilindungi oleh keamanan anti-cloning @cmnty.</p>
        </div>
      `;
      return;
    }

    // 2. Block theft from running on unauthorized domains
    const hostname = window.location.hostname;
    const isAuthorized = 
      hostname === "" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "api.cmnty.web.id" ||
      hostname.endsWith(".run.app"); // Diperlukan agar pratinjau di dalam Google AI Studio tetap berfungsi dengan baik

    if (!isAuthorized && hostname !== "") {
      document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #040405; color: #ef4444; font-family: sans-serif; text-align: center; padding: 20px;">
          <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 12px; letter-spacing: -0.025em;">DOMAIN TIDAK DIIZINKAN</h1>
          <p style="color: #a1a1aa; font-size: 14px; max-width: 500px; line-height: 1.6;">Domain <strong>${hostname}</strong> telah diblokir secara otomatis karena terindikasi menggunakan kode ilegal. Silakan hubungi @cmnty.official untuk akses terverifikasi.</p>
        </div>
      `;
      return;
    }

    // Security copy and inspect prevention systems removed per requested
    return () => {};
  }, []);

  // Metrics monitoring
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [stats, setStats] = useState({
    totalCalls: 0,
    averageLatency: 0,
    successRate: 100,
  });
  const [liveVisitors, setLiveVisitors] = useState<number>(0);

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
            return next.slice(0, 15);
          });
        } else if (data.type === "VISITOR_COUNT") {
          setLiveVisitors(data.count);
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
        if (endpoint?.id === "uploader-upload" || endpoint?.id === "uploader-upload-v1") {
          if (!uploadFile) {
            setErrorText("Silakan pilih file terlebih dahulu untuk diunggah.");
            setIsLoading(false);
            return;
          }
          const formData = new FormData();
          formData.append("file", uploadFile);

          response = await fetch(endpoint.path, {
            method: "POST",
            body: formData,
            headers: {
              "Accept": "application/json"
            }
          });
        } else {
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
        }
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
    const isJsonResponse = !ep.responseType || ep.responseType === "json";

    if (selectedCodeLang === "curl") {
      const method = ep.method || "GET";
      const headers = isJsonResponse ? `-H "Accept: application/json"` : "";
      
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
  ${headers ? `${headers} \\\n  ` : ""}-H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
      }

      return `curl -X GET "${fullApiPath}"${headers ? ` \\\n  ${headers}` : ""}`;
    }
    if (selectedCodeLang === "javascript") {
      const method = ep.method || "GET";
      const acceptHeader = isJsonResponse ? `\n    "Accept": "application/json",` : "";
      const thenBlock = isJsonResponse 
        ? `.then(response => response.json())
.then(data => console.log(data));`
        : (ep.responseType === "image" 
            ? `.then(response => response.blob())
.then(blob => {
  const url = URL.createObjectURL(blob);
  console.log("Image URL:", url);
});` 
            : `.then(response => response.blob())
.then(blob => console.log("Blob received:", blob));`);

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
  headers: {${acceptHeader}
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${JSON.stringify(body, null, 2)})
})
${thenBlock}`;
      }
      return `fetch("${fullApiPath}", {
  method: "GET"${isJsonResponse ? `,
  headers: {
    "Accept": "application/json"
  }` : ""}
})
${thenBlock}`;
    }
    if (selectedCodeLang === "python") {
      const method = ep.method || "GET";
      const acceptHeader = isJsonResponse ? `"Accept": "application/json"` : "";
      const printBlock = isJsonResponse 
        ? `print(response.json())`
        : (ep.responseType === "image" 
            ? `with open("result.png", "wb") as f:
    f.write(response.content)
print("Image saved to result.png")`
            : `print("Response content received:", response.content[:100])`);

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
headers = {${acceptHeader ? `\n    ${acceptHeader},` : ""}
    "Content-Type": "application/json"
}
payload = ${JSON.stringify(body, null, 4)}

response = requests.post(url, headers=headers, json=payload)
${printBlock}`;
      }

      return `import requests

url = "${fullApiPath}"
${acceptHeader ? `headers = {${acceptHeader}}\n` : ""}
response = requests.get(url${acceptHeader ? ", headers=headers" : ""})
${printBlock}`;
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
      <AnimatePresence>
        {appIsLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center pointer-events-auto loading-screen-container"
          >
            <div className="relative w-full max-w-sm aspect-video overflow-hidden">
              {/* Invisible protection layer to prevent direct interaction/theft */}
              <div 
                className="absolute inset-0 z-20 cursor-default" 
                onContextMenu={(e) => e.preventDefault()}
              />
              <video
                src="https://c.termai.cc/v138/eyH.mp4"
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                className="w-full h-full object-cover z-10 loading-screen-video"
                onContextMenu={(e) => e.preventDefault()}
              />
              <div className="absolute bottom-4 left-0 right-0 z-30 flex flex-col items-center">
                <div className="w-48 h-[2px] bg-zinc-900 rounded-full overflow-hidden mb-3.5">
                  <motion.div 
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-full h-full bg-zinc-300"
                  />
                </div>
                <span className="text-xs uppercase tracking-[0.3em] font-bold font-mono text-zinc-100 animate-pulse">Welcome Developer</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual background grid layout - styled exactly like the screenshot with subtle elegant grid lines */}
      <div className="absolute inset-0 bg-[#040405] bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px] opacity-40 pointer-events-none text-left" />

      {/* Decorative Top Glowing Line */}
      <div className="fixed top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_30px_rgba(255,255,255,0.8)] z-[100] pointer-events-none" />

      {/* Navbar Header exactly matching screenshot layout */}
      <header className="border-b border-zinc-900 bg-[#040405]/75 backdrop-blur-md sticky top-0 z-40">
        {/* Video Background Section - Right Side Slanted */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div 
            className="absolute right-0 top-0 bottom-0 w-[60%] overflow-hidden"
            style={{ clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0% 100%)' }}
          >
            <video 
              src="https://c.termai.cc/v104/N1zu.mp4" 
              autoPlay 
              loop 
              muted 
              playsInline 
              className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-700"
            />
            {/* Subtle overlay to enhance text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#040405] via-transparent to-transparent opacity-60" />
            <div className="absolute inset-0 bg-zinc-950/20" />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigateTo("landing")}
              className="text-xl font-bold text-white tracking-tight hover:opacity-90 transition-opacity"
            >
              Cmnty API
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div 
              className="flex items-center gap-2.5 text-zinc-400 text-xs font-semibold cursor-pointer"
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              <div className="relative inline-flex h-[18px] w-9 flex-shrink-0 rounded-full transition-colors duration-200 bg-zinc-600">
                <span className={`pointer-events-none inline-block h-[14px] w-[14px] transform rounded-full bg-white transition duration-200 mt-[2px] ml-[2px] ${isDarkMode ? 'translate-x-[18px]' : 'translate-x-[0px]'}`}></span>
              </div>
              <span className="text-zinc-300 w-8">{isDarkMode ? "Dark" : "Light"}</span>
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
                <div className="pt-2 border-t border-zinc-800">
                  <a
                    href="https://whatsapp.com/channel/0029VbCox0f17Emr10Bdlj0V"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono rounded transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className="h-3.5 w-3.5 fill-zinc-400 group-hover:fill-white transition-colors"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      <span>Saluran WhatsApp</span>
                    </div>
                    <ArrowUpRight className="h-3 w-3 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
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
              className="space-y-4 w-full pt-4"
            >
              <div className="flex items-center justify-center">
                <LandingHero 
                  onGetStarted={() => navigateTo("explorer")}
                  onViewVitals={() => {
                    document.getElementById("traffic-monitor")?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              </div>

              {/* Live Traffic Monitor Dashboard inside Landing View */}
              <section id="traffic-monitor" className="bg-black border border-zinc-800 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.03)] text-left scroll-mt-20 max-w-2xl mx-auto w-full">
                <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-mono">
                      Visitor: {liveVisitors}
                    </h2>
                  </div>
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

              {/* Dynamic Real-Time "Current Visitor" Widget - Dark Cyber Theme with White Glow */}
              <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.03)] text-left max-w-2xl mx-auto w-full relative my-5">
                
                {/* Header */}
                <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-mono">
                      Current Visitor
                    </h2>
                  </div>
                  <div>
                    <button
                      onClick={fetchVisitorInfo}
                      disabled={visitorLoading}
                      className="p-1 px-2.5 text-[9px] font-mono text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-950 transition-all rounded flex items-center gap-1.5 disabled:opacity-50"
                      title="Refresh Visitor Data"
                    >
                      <RefreshCw className={`h-3 w-3 ${visitorLoading ? "animate-spin" : ""}`} />
                      <span>{visitorLoading ? "Refreshing..." : "Refresh"}</span>
                    </button>
                  </div>
                </div>

                {/* Location Bar & Status Badge */}
                <div className="px-4 py-3 border-b border-zinc-900/40 bg-zinc-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 font-mono">
                  {visitorLoading ? (
                    <div className="h-5 flex items-center text-[11px] text-zinc-500 animate-pulse">
                      <span>Mendeteksi Lokasi Pengunjung...</span>
                    </div>
                  ) : visitorError ? (
                    <div className="text-[11px] text-zinc-500">
                      Gagal mendeteksi lokasi - Menggunakan fallback sensor
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="text-zinc-200 font-bold text-xs">
                        {visitorInfo?.city || "Mendeteksi kota..."}
                      </span>
                      <span className="text-zinc-500 text-xs">
                        {visitorInfo?.region ? `— ${visitorInfo.region}, ` : ""}
                        {visitorInfo?.country || ""}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center">
                    {!visitorLoading && visitorInfo?.lat && (
                      <span className="bg-zinc-900/60 border border-zinc-800 text-zinc-400 text-[9px] tracking-widest px-1.5 py-0.5 rounded font-medium font-mono text-right">
                        {visitorInfo.lat.toFixed(4)}, {visitorInfo.lon.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Map Display Container */}
                <div className="p-4 bg-zinc-950/10">
                  <div className="border border-zinc-850 bg-zinc-950 relative overflow-hidden h-60 sm:h-64 rounded-lg shadow-inner">
                    {visitorLoading || !visitorInfo?.lat ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/90 gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 font-mono">Loading dynamic grid...</span>
                      </div>
                    ) : (
                      <>
                        <iframe
                          title="Visitor Location Map"
                          src={`https://maps.google.com/maps?q=${visitorInfo.lat},${visitorInfo.lon}&z=${mapZoom}&output=embed`}
                          className="w-full h-full border-none rounded-lg z-0 relative"
                          allowFullScreen
                          loading="lazy"
                        />
                        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10 bg-zinc-900/80 p-1 rounded-md border border-zinc-800 backdrop-blur-sm shadow-lg">
                          <button
                            onClick={() => setMapZoom(prev => Math.min(prev + 1, 21))}
                            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-300 w-7 h-7 rounded flex items-center justify-center font-bold text-lg transition-colors border border-zinc-800/50"
                            title="Zoom In"
                          >
                            +
                          </button>
                          <button
                            onClick={() => setMapZoom(prev => Math.max(prev - 1, 1))}
                            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-300 w-7 h-7 rounded flex items-center justify-center font-bold text-lg transition-colors border border-zinc-800/50"
                            title="Zoom Out"
                          >
                            -
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Metric grid */}
                <div className="grid grid-cols-2 gap-3 px-4 pb-5">
                  
                  {/* IP Card */}
                  <div className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 p-3 rounded-lg flex flex-col items-center justify-center text-center transition-all">
                    <div className="text-xs font-bold text-zinc-100 font-mono tracking-tight truncate max-w-full">
                      {visitorLoading ? "Mendeteksi..." : visitorInfo?.ip || "-"}
                    </div>
                    <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mt-1 flex items-center gap-1 font-mono">
                      <Globe className="h-3 w-3 text-zinc-500" />
                      <span>IP Address</span>
                    </div>
                  </div>

                  {/* Temperature Card */}
                  <div className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 p-3 rounded-lg flex flex-col items-center justify-center text-center transition-all">
                    <div className="text-xs font-bold text-zinc-100 font-mono tracking-tight truncate max-w-full">
                      {visitorLoading ? "26.5°C" : visitorInfo?.temperature || "-"}
                    </div>
                    <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mt-1 flex items-center gap-1 font-mono">
                      <Thermometer className="h-3 w-3 text-zinc-500" />
                      <span>Temperature</span>
                    </div>
                  </div>

                </div>

              </div>
            </motion.div>
          ) : currentView === "admin" ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 w-full max-w-4xl mx-auto"
            >
              <button
                onClick={() => navigateTo("landing")}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-all text-xs font-bold uppercase tracking-widest group"
              >
                <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
                <span>Back</span>
              </button>

              <div className="bg-[#050508] border border-zinc-850 rounded-lg p-6 shadow-xl relative text-left">
                {!isAdminAuthenticated ? (
                  <form onSubmit={handleAdminLogin} className="space-y-4 max-w-md mx-auto py-8">
                    <div className="text-center space-y-2">
                      <div className="mx-auto w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800/60 flex items-center justify-center">
                        <Terminal className="h-4 w-4 text-zinc-400" />
                      </div>
                      <h3 className="text-sm font-extrabold uppercase tracking-widest text-zinc-200 font-mono">Oji Admin Gate</h3>
                      <p className="text-[11px] text-zinc-500 font-mono">Input secure credentials below to manage files</p>
                    </div>

                    <div className="space-y-1.5 font-mono text-xs">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">Admin Passphrase</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full bg-[#09090c] border border-zinc-850/60 rounded px-3.5 py-2.5 text-xs text-center text-white focus:outline-none focus:border-zinc-700 font-mono tracking-widest transition-all"
                        required
                      />
                    </div>

                    {adminFilesError && (
                      <div className="text-red-500 font-mono text-[11px] text-center bg-red-955/20 border border-red-900/40 p-2.5 rounded">
                        {adminFilesError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={adminFilesLoading}
                      className="w-full bg-white hover:bg-zinc-200 text-black text-xs font-bold py-2.5 rounded transition-all uppercase font-mono cursor-pointer flex items-center justify-center gap-2"
                    >
                      {adminFilesLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify Access"
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-900 pb-5 gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <h3 className="text-sm font-extrabold uppercase tracking-widest text-zinc-200 font-mono">Oji Admin Dashboard</h3>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-mono">Manage and review uploaded public assets</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchAdminFiles}
                          disabled={adminFilesLoading}
                          className="p-1.5 px-3 text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 transition-all rounded flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${adminFilesLoading ? "animate-spin" : ""}`} />
                          <span>Reload List</span>
                        </button>
                        <button
                          onClick={handleAdminLogout}
                          className="p-1.5 px-3 text-[10px] font-mono text-red-400 hover:text-white hover:bg-red-950/20 border border-red-900/30 bg-zinc-950 transition-all rounded"
                        >
                          Logout
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
                      <div className="bg-zinc-950/65 border border-zinc-900 p-4 rounded-lg space-y-1">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Total Files</span>
                        <div className="text-xl font-bold text-white">{adminFiles.length} files</div>
                      </div>
                      <div className="bg-zinc-950/65 border border-zinc-900 p-4 rounded-lg space-y-1">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 font-mono font-bold">Estimated Disk Space</span>
                        <div className="text-xl font-bold text-white">
                          {(adminFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search files by name..."
                          value={adminSearchQuery}
                          onChange={(e) => setAdminSearchQuery(e.target.value)}
                          className="w-full bg-[#07070a] border border-zinc-850 rounded px-10 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-all font-mono"
                        />
                      </div>

                      {adminFilesError && (
                        <div className="text-red-500 font-mono text-[11px] text-center bg-red-955/20 border border-red-900/40 p-2.5 rounded">
                          {adminFilesError}
                        </div>
                      )}

                      <div className="border border-zinc-900 rounded-lg overflow-hidden bg-zinc-950/10">
                        <div className="max-h-96 overflow-y-auto divide-y divide-zinc-900 font-mono text-xs">
                          {adminFiles.filter(f => f.filename.toLowerCase().includes(adminSearchQuery.toLowerCase())).length === 0 ? (
                            <div className="py-12 text-center text-zinc-600">
                              {adminFilesLoading ? "Loading files..." : "No files matched search filter."}
                            </div>
                          ) : (
                            adminFiles
                              .filter(f => f.filename.toLowerCase().includes(adminSearchQuery.toLowerCase()))
                              .map(file => (
                                <div key={file.filename} className="p-3 bg-[#040406]/65 hover:bg-zinc-950/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer referrer"
                                      className="text-zinc-200 hover:text-white font-bold truncate block hover:underline"
                                    >
                                      {file.filename}
                                    </a>
                                    <div className="flex items-center gap-2.5 text-[10px] text-zinc-500">
                                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                                      <span>•</span>
                                      <span>{new Date(file.createdAt).toLocaleString()}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer referrer"
                                      className="p-1.5 px-3 border border-zinc-800 text-zinc-400 hover:text-white rounded bg-zinc-950 transition-all text-[11px] font-sans"
                                    >
                                      Open File
                                    </a>
                                    <button
                                      onClick={() => setDeleteConfirmationFile(file.filename)}
                                      className="p-1.5 border border-red-950 text-red-500 hover:text-white hover:bg-red-955 bg-zinc-950 rounded transition-all cursor-pointer"
                                      title="Delete File"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {deleteConfirmationFile && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
                  <div className="bg-[#050508] border border-zinc-800 rounded-lg p-5 max-w-sm w-full space-y-4 font-mono text-xs text-left">
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-red-500">Konfirmasi Penghapusan</span>
                      <h4 className="text-zinc-200 font-bold break-all">Hapus file "{deleteConfirmationFile}"?</h4>
                    </div>
                    <p className="text-zinc-500 font-sans text-[11px] leading-relaxed">
                      Tindakan ini permanen dan tidak dapat dibatalkan. Berkas akan terhapus sepenuhnya dari sistem server.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteConfirmationFile(null)}
                        className="flex-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white py-2 text-zinc-400 rounded uppercase font-bold font-mono"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => handleAdminDeleteFile(deleteConfirmationFile)}
                        className="flex-1 bg-red-650 hover:bg-red-750 text-white py-2 rounded uppercase font-bold font-mono"
                      >
                        Hapus Permanen
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
                onClick={() => navigateTo("landing")}
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
                      onClick={() => { setActiveFolder("downloader"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "downloader"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Downloader ({ENDPOINTS.filter(e => e.category === "downloader").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("game"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "game"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Gamepad2 className="h-3.5 w-3.5" />
                      <span>Game ({ENDPOINTS.filter(e => e.category === "game").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("information"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "information"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Info className="h-3.5 w-3.5" />
                      <span>Info ({ENDPOINTS.filter(e => e.category === "information").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("payment"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "payment"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Payment ({ENDPOINTS.filter(e => e.category === "payment").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("random"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "random"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Shuffle className="h-3.5 w-3.5" />
                      <span>Random ({ENDPOINTS.filter(e => e.category === "random").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("search"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "search"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Search ({ENDPOINTS.filter(e => e.category === "search").length})</span>
                    </button>

                    <button
                      onClick={() => { setActiveFolder("stalker"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "stalker"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <UserSearch className="h-3.5 w-3.5" />
                      <span>Stalker ({ENDPOINTS.filter(e => e.category === "stalker").length})</span>
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

                    <button
                      onClick={() => { setActiveFolder("uploader"); }}
                      className={`px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 flex-shrink-0 snap-start ${
                        activeFolder === "uploader"
                          ? "bg-white text-black font-semibold border-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Uploader ({ENDPOINTS.filter(e => e.category === "uploader").length})</span>
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
                                      ) : q.name === "file" && (ep.id === "uploader-upload" || ep.id === "uploader-upload-v1") ? (
                                        <div className="flex flex-col gap-2">
                                          <input
                                            type="file"
                                            onChange={(e) => {
                                              if (e.target.files && e.target.files.length > 0) {
                                                const fileSelected = e.target.files[0];
                                                setUploadFile(fileSelected);
                                                handleQueryParamChange(ep, q.name, fileSelected.name);
                                              }
                                            }}
                                            className="hidden"
                                            id="file-upload-input"
                                          />
                                          <label
                                            htmlFor="file-upload-input"
                                            className="w-full bg-[#050507]/40 hover:bg-[#07070a] border border-dashed border-zinc-800 hover:border-zinc-700 rounded-lg p-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center text-xs font-sans transition-all group"
                                          >
                                            <Upload className="h-5 w-5 text-zinc-500 group-hover:text-white transition-all animate-pulse" />
                                            <span className="text-zinc-300 font-bold font-mono text-[11px]">
                                              {uploadFile ? uploadFile.name : "Pilih atau Seret Berkas Di Sini"}
                                            </span>
                                            <span className="text-[10px] text-zinc-600 font-mono">
                                              {uploadFile ? `Saran Ukuran: ${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB` : "Mendukung segala jenis format file (Max 50MB)"}
                                            </span>
                                          </label>
                                        </div>
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
                                  readOnly
                                  className="flex-1 bg-transparent px-2 py-2.5 text-zinc-400 font-medium focus:outline-none placeholder-zinc-800 text-[11px] font-mono cursor-default select-none"
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
