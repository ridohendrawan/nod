/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { notesApiDev, ownerPageRewrite, preloadFont } from './scripts/vite-plugins.ts'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => {
  // The AI function's settings for the dev and preview servers. Fixture mode unless NOD_AI_MODE
  // says otherwise: `pnpm demo:claude` drafts through Claude Code on this machine (D96), and
  // `NOD_AI_MODE=live pnpm dev` calls the API with a key in .env.local.
  const env = loadEnv(mode, process.cwd(), '')
  const notesEnv = {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    NOD_MODEL: env.NOD_MODEL,
    NOD_AI_MODE: env.NOD_AI_MODE || 'fixture',
    NOD_AI_FALLBACK: env.NOD_AI_FALLBACK,
  }
  return {
    plugins: [
      react(),
      ownerPageRewrite(),
      preloadFont(/InterVariable-subset.*\.woff2$/),
      notesApiDev(notesEnv),
    ],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      // Two pages: Dan's app (and the demo stage) and Sarah's page, with no shared builder code (D86).
      // Vite 8 renamed `rollupOptions` to `rolldownOptions`.
      rolldownOptions: {
        input: { index: here('./index.html'), o: here('./o.html') },
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  }
})
