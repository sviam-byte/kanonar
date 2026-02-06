import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Netlify exposes CONTEXT=deploy-preview for PR previews
    const isDeployPreview =
      env.CONTEXT === 'deploy-preview' ||
      (env.NETLIFY === 'true' && mode === 'production');
    return {
      test: {
        environment: 'node',
        include: ['**/*.test.ts'],
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      // Make deploy-preview builds debuggable: readable stacks + source mapping
      build: isDeployPreview
        ? {
            sourcemap: true,
            minify: false,
          }
        : undefined,
      // Keep function/class names in deploy-preview (helps stacks)
      esbuild: isDeployPreview
        ? {
            keepNames: true,
          }
        : undefined,
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
