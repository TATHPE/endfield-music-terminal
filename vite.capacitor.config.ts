// Capacitor (APK) 专用构建配置：产出标准 Vite 静态产物（index.html + assets 同目录），
// 不经过妙搭部署插件的 output/output_resource 重排。
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  define: {
    // 与主配置保持一致，防止路由 basename 变成 undefined
    'import.meta.env.MIAODA_CLIENT_BASE_PATH': JSON.stringify('/'),
  },
  build: {
    outDir: 'dist/apk',
    emptyOutDir: true,
  },
});
