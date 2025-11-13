/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_API_URL: string;
  // aggiungi qui altre variabili VITE_ che usi
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
