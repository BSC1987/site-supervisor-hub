import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Floating "back to top" button. Watches the scroll position of the nearest
 * scrolling ancestor (the AppLayout's <main> element) as well as the window,
 * and appears once the user has scrolled past `threshold` pixels.
 */
export function BackToTop({ threshold = 300 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const main = document.querySelector('main');
    const plotScroll = document.getElementById('plot-scroll');
    const getScrollTop = () =>
      Math.max(
        window.scrollY || 0,
        document.documentElement.scrollTop || 0,
        main?.scrollTop || 0,
        plotScroll?.scrollTop || 0
      );
    const onScroll = () => setVisible(getScrollTop() > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    main?.addEventListener('scroll', onScroll, { passive: true });
    plotScroll?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      main?.removeEventListener('scroll', onScroll);
      plotScroll?.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);

  const scrollToTop = () => {
    const main = document.querySelector('main');
    const plotScroll = document.getElementById('plot-scroll');
    plotScroll?.scrollTo({ top: 0, behavior: 'smooth' });
    if (main && main.scrollTop > 0) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-6 right-6 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-opacity"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
