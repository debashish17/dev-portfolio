// GOOGLE ANALYTICS (GA4) - loaded at runtime, manual page_view events for the
// state-based router (the URL never changes between sections, so automatic
// GA page tracking would only ever see "/").

// Paste your GA4 Measurement ID here (looks like "G-XXXXXXXXXX").
// While empty, all GA calls are no-ops.
const GA_MEASUREMENT_ID = '';

// Synthetic paths/titles per route id, since the SPA keeps a constant URL.
const ROUTE_PAGES = {
  home: { path: '/', title: 'Index' },
  about: { path: '/about', title: 'About' },
  work: { path: '/work', title: 'Work' },
  achievements: { path: '/achievements', title: 'Honours' },
  contact: { path: '/contact', title: 'Transmit' },
};

const isLocalhost = () =>
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

let initialized = false;

export function initAnalytics() {
  if (initialized || !GA_MEASUREMENT_ID || isLocalhost()) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // send_page_view: false — page views are sent manually via trackPageView
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function trackPageView(routeId) {
  if (!initialized) return;
  const page = ROUTE_PAGES[routeId] || { path: `/${routeId}`, title: routeId };
  window.gtag('event', 'page_view', {
    page_path: page.path,
    page_title: page.title,
    page_location: `${window.location.origin}${page.path}`,
  });
}
