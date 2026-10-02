/// <reference types="vite/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MAPA_SVG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

