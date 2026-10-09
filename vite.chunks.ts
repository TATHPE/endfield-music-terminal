/**
 * 手动分包：把体积大、更新频率低的依赖拆成独立 chunk，
 * 便于浏览器缓存与并行加载（两个 vite 配置共用）。
 */
export function manualChunksFor(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
    return 'vendor-react';
  }
  if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
    return 'vendor-motion';
  }
  if (id.includes('lucide-react')) return 'vendor-icons';
  if (id.includes('music-metadata')) return 'vendor-metadata';
  if (id.includes('/idb')) return 'vendor-idb';
  if (id.includes('@capacitor')) return 'vendor-capacitor';
  return 'vendor';
}
