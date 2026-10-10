// EXPORTS: useKeyboardOpen
import { useEffect, useState } from 'react';

/** 当前焦点是否在可输入控件里（键盘会因此弹起）。 */
function focusInEditable(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/**
 * 软键盘弹起检测（用于输入时收起 MiniPlayer / Dock）。
 *
 * 判据演进（踩过两次坑，注释留证）：
 *  1. 只比 `innerHeight - visualViewport.height` → Capacitor 默认 `adjustResize` 下
 *     布局视口本身就随键盘缩小，差值≈0，**永远检测不到** ✗
 *  2. 等视口收缩再收起 → 收起动作被推迟到键盘动画之后，观感是"闪一下没了" ✗
 *  3. 现在：**一有输入焦点就先收起**（早于键盘动画完成，收起动画与键盘弹出同步，
 *     看起来是顺滑滑出），失焦立即恢复；视口变化只作为兜底触发（例如某些内核
 *     不派发 focus 事件时）。
 */
export function useKeyboardOpen(threshold = 120): boolean {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        let baseline = window.innerHeight;
        let frame = 0;

        const check = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const focused = focusInEditable();
                if (!focused) {
                    // 没有输入焦点：一切高度变化都算正常（旋转 / 系统栏），校准基线后恢复
                    baseline = window.innerHeight;
                    setOpen(false);
                    return;
                }
                // 有焦点就立刻收起：不等待视口收缩，避免"闪一下"
                setOpen(true);
            });
        };

        // 兜底：某些内核不派发 focusin，但视口会真的收缩
        const checkViewport = () => {
            const gap = vv ? window.innerHeight - vv.height : 0;
            const shrink = baseline - window.innerHeight;
            if (gap > threshold || shrink > threshold) setOpen(true);
        };

        check();
        window.addEventListener('resize', check);
        window.addEventListener('resize', checkViewport);
        window.addEventListener('orientationchange', check);
        document.addEventListener('focusin', check);
        document.addEventListener('focusout', check);
        vv?.addEventListener('resize', check);
        vv?.addEventListener('resize', checkViewport);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', check);
            window.removeEventListener('resize', checkViewport);
            window.removeEventListener('orientationchange', check);
            document.removeEventListener('focusin', check);
            document.removeEventListener('focusout', check);
            vv?.removeEventListener('resize', check);
            vv?.removeEventListener('resize', checkViewport);
        };
    }, [threshold]);

    return open;
}
