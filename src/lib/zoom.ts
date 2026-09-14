import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * wry 的 zoomHotkeysEnabled 只在 Windows(WebView2)后端生效,
 * macOS 的 WKWebView 后端没接,所以 ⌘加减零在这里手动接管。
 */

export const ZOOM_STORAGE_KEY = "sd-zoom";
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2;
const STEP = 0.1;

function clampZoom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw === null) return 1;
    return clampZoom(Number(raw));
  } catch {
    return 1;
  }
}

function persistZoom(zoom: number): void {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // localStorage 不可用时只影响记忆,不影响本次缩放
  }
}

export function applyZoom(zoom: number): void {
  getCurrentWebview()
    .setZoom(zoom)
    .catch(() => {
      // Tauri IPC 不可用(如浏览器 dev 模式)时静默放弃,交给浏览器原生缩放
    });
}

export function initZoomHotkeys(): void {
  // 只在 Tauri 壳里接管;浏览器 dev 有自己的 ⌘+/-
  if (!("__TAURI_INTERNALS__" in window)) return;

  let zoom = readStoredZoom();
  if (zoom !== 1) applyZoom(zoom);

  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "=" || e.key === "+") zoom = clampZoom(zoom + STEP);
    else if (e.key === "-") zoom = clampZoom(zoom - STEP);
    else if (e.key === "0") zoom = 1;
    else return;
    e.preventDefault();
    persistZoom(zoom);
    applyZoom(zoom);
  });
}
