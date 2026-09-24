import { useEffect } from 'react';

const CSS_VARIABLE = '--visual-viewport-top';

export const useVisualViewportTop = () => {
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        // iPhone Safari keeps sticky elements on the layout viewport as the keyboard pans the visible viewport.
        let frame = 0;
        const update = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                document.documentElement.style.setProperty(
                    CSS_VARIABLE,
                    `${Math.max(0, viewport.offsetTop)}px`,
                );
            });
        };

        update();
        viewport.addEventListener('scroll', update);
        viewport.addEventListener('resize', update);
        window.addEventListener('scroll', update, { passive: true });
        return () => {
            viewport.removeEventListener('scroll', update);
            viewport.removeEventListener('resize', update);
            window.removeEventListener('scroll', update);
            window.cancelAnimationFrame(frame);
            document.documentElement.style.removeProperty(CSS_VARIABLE);
        };
    }, []);
};
