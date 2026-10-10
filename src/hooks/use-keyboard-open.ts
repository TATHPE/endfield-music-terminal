// EXPORTS: useKeyboardOpen
import { useEffect, useState } from 'react';

/**
 * 安卓软键盘弹起检测。
 *
 * 键盘出现时 `window.innerHeight` 与 `visualViewport.height` 会拉开明显差值
 * （`adjustResize` 与 `interactive-widget=resizes-visual` 两种行为都能覆盖）。
 * 用于：输入时收起底部悬浮层（MiniPlayer / Dock），否则它们会"卡"在键盘上沿、
 * 压住正在编辑的面板（用户反馈过：点搜索框时 MiniPlayer 浮到屏幕中间）。
 */
export function useKeyboardOpen(threshold = 150): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    let frame = 0;
    // 状态更新放在 rAF 里，避免在 effect 体内直接 setState（hooks 规则）
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setOpen(window.innerHeight - vv.height > threshold);
      });
    };
    check();
    vv.addEventListener('resize', check);
    vv.addEventListener('scroll', check);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', check);
      vv.removeEventListener('scroll', check);
    };
  }, [threshold]);

  return open;
}
