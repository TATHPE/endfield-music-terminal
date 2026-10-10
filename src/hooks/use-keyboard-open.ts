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
 * 安卓软键盘弹起检测（真机验证过两种 WebView 行为都要覆盖）。
 *
 * 之前的写法只比较 `innerHeight - visualViewport.height`，在 Capacitor 默认的
 * `adjustResize` 下**布局视口本身就跟着键盘缩小**，差值≈0 → 永远检测不到 ✗。
 *
 * 现在改为：
 *  - 维护一个"无键盘时"的布局视口高度基线（无输入焦点时持续校准，兼容旋转）
 *  - 判据 = **有输入焦点** 且（布局视口比基线矮 / 可视视口与布局视口有明显差值）
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
                    // 没有输入焦点时一切高度变化都视为正常（旋转 / 系统栏变化），校准基线
                    baseline = window.innerHeight;
                    setOpen(false);
                    return;
                }
                const layoutShrink = baseline - window.innerHeight;
                const visualGap = vv ? window.innerHeight - vv.height : 0;
                setOpen(layoutShrink > threshold || visualGap > threshold);
            });
        };

        check();
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        document.addEventListener('focusin', check);
        document.addEventListener('focusout', check);
        vv?.addEventListener('resize', check);
        vv?.addEventListener('scroll', check);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', check);
            window.removeEventListener('orientationchange', check);
            document.removeEventListener('focusin', check);
            document.removeEventListener('focusout', check);
            vv?.removeEventListener('resize', check);
            vv?.removeEventListener('scroll', check);
        };
    }, [threshold]);

    return open;
}
