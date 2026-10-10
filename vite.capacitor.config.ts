// Capacitor (APK) 专用构建配置：产出标准 Vite 静态产物（index.html + assets 同目录），
// 不经过部署插件的 output/output_resource 重排。
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { manualChunksFor } from './vite.chunks';

// 「无歌曲版」由 tools/build-apk.ps1 -NoSongs 设置；用它替代"把 public/songs
// 临时挪走再还原"的旧做法（那种做法在构建被中断或并发时会丢源文件）。
const lite = process.env.ENDFIELD_LITE === '1';

/** 版本号单一来源：package.json */
const appVersion: string = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/** lite 构建：拷贝 public/ 下除 songs/ 之外的一切，保证产物里没有预置曲库。 */
function publicWithoutSongs(): Plugin {
  return {
    name: 'public-without-songs',
    apply: 'build',
    closeBundle() {
      const from = path.resolve(import.meta.dirname, 'public');
      const to = path.resolve(import.meta.dirname, 'dist/apk');
      for (const entry of fs.readdirSync(from)) {
        if (entry === 'songs') continue;
        fs.cpSync(path.join(from, entry), path.join(to, entry), { recursive: true });
      }
      fs.rmSync(path.join(to, 'songs'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: lite ? [react(), tailwindcss(), publicWithoutSongs()] : [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  define: {
    // 把版本号编进包里：启动时写进 SYSTEM LOG，方便确认"装的是哪个构建"
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: 'dist/apk',
    emptyOutDir: true,
    // lite 版由 publicWithoutSongs 插件接管 public 目录拷贝
    copyPublicDir: !lite,
    rollupOptions: {
      output: { manualChunks: manualChunksFor },
    },
  },
});
