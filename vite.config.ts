import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ── 妙搭部署协议（参考《妙搭应用构建产物规范》）─────────────────────────
// 构建期环境变量（托管构建时由部署链路自动注入；本地开发不需要，缺省回退）：
//   MIAODA_CLIENT_BASE_PATH     应用路由根目录，如 /app/app_xxx
//   MIAODA_RESOURCE_CDN_PREFIX  JS/CSS 静态资源 CDN 前缀
const basePath = process.env.MIAODA_CLIENT_BASE_PATH || '/';
const cdnPrefix = process.env.MIAODA_RESOURCE_CDN_PREFIX;

// 产物分层：vite 原生产物（dist/client，中间产物，整理后删除）→ 妙搭托管产物结构：
//   dist/output/           index.html + public 同源资源 + routes.json（走应用权限校验）
//   dist/output_resource/  assets JS/CSS（推 CDN，公开）
function miaodaOutputPlugin(): Plugin {
  return {
    name: 'miaoda-output',
    apply: 'build',
    // closeBundle 在 vite 全部写盘后执行，此时可安全整理并清理中间产物
    closeBundle() {
      const dist = path.resolve(import.meta.dirname, 'dist');
      const client = path.join(dist, 'client');
      const output = path.join(dist, 'output');
      const outputResource = path.join(dist, 'output_resource');

      fs.rmSync(output, { recursive: true, force: true });
      fs.rmSync(outputResource, { recursive: true, force: true });
      fs.mkdirSync(output, { recursive: true });

      // assets 之外的所有产物（index.html + public/ 平铺文件）→ 同源 output/
      for (const entry of fs.readdirSync(client)) {
        if (entry === 'assets') continue;
        fs.cpSync(path.join(client, entry), path.join(output, entry), {
          recursive: true,
        });
      }
      // assets → CDN 桶
      const assets = path.join(client, 'assets');
      if (fs.existsSync(assets)) {
        fs.cpSync(assets, path.join(outputResource, 'assets'), {
          recursive: true,
        });
      }
      // routes.json：扫描 src 内 <Route path> 生成路由枚举（TNS 按此遍历送审）；
      // SPA 场景各路由均由 index.html 服务
      const routes = collectRoutePaths(
        path.resolve(import.meta.dirname, 'src'),
      ).map((p) => ({ path: p, file: 'index.html' }));
      fs.writeFileSync(
        path.join(output, 'routes.json'),
        JSON.stringify(routes, null, 2) + '\n',
      );
      // 清理中间产物，dist 只保留部署分层
      fs.rmSync(client, { recursive: true, force: true });
    },
  };
}

// 本地开发自描述端点（协议 v0.4）：GET /spark.json 原样返回项目根声明文件，
// 供消费方（豆包客户端/Agent）识别妙搭托管协议应用；仅 dev server，线上不暴露
function sparkJsonPlugin(): Plugin {
  return {
    name: 'spark-json-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/spark.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          fs.readFileSync(path.resolve(import.meta.dirname, 'spark.json')),
        );
      });
    },
  };
}

// 收集 <Route path="..."> 声明的路由；index 路由计为 "/"，通配 "*" 不进枚举
function collectRoutePaths(srcDir: string): string[] {
  const paths = new Set<string>(['/']);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) {
        const code = fs.readFileSync(p, 'utf-8');
        for (const m of code.matchAll(/<Route[^>]*\bpath=["']([^"']+)["']/g)) {
          const route = m[1];
          if (route.includes('*')) continue;
          paths.add(route.startsWith('/') ? route : `/${route}`);
        }
      }
    }
  };
  walk(srcDir);
  return [...paths];
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), miaodaOutputPlugin(), sparkJsonPlugin()],
  // 生产构建：JS/CSS 引用带 CDN 前缀（无 CDN 时退回 base path）；dev 恒为 /
  base: command === 'build' ? cdnPrefix || basePath : '/',
  define: {
    // 路由 basename 与资源前缀解耦，单独注入
    'import.meta.env.MIAODA_CLIENT_BASE_PATH': JSON.stringify(basePath),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/client',
  },
}));
