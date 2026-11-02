/**
 * Security response headers — one source of truth.
 *
 * Pages applies `public/_headers` to static asset responses only; responses
 * produced by Pages Functions bypass it. `functions/_middleware.ts` therefore
 * applies the same set to every `/api/*` response, including redirects and the
 * HTML returned by the ops callback.
 *
 * The CSP is tuned to what the SPA actually loads:
 *  - the bundle is same-origin (`script-src 'self'`);
 *  - the only inline scripts are the pre-paint theme and accent bootstraps,
 *    allowed by hash;
 *  - React/Tailwind/Radix write inline `style` attributes (`style-src
 *    'unsafe-inline'`);
 *  - Google Fonts CSS + font files;
 *  - Firebase Auth/Firestore use `*.googleapis.com`, the auth domain iframe and
 *    Google's account chooser popup (`connect-src`/`frame-src`).
 *
 * `public/_headers` must stay byte-identical for the shared values; the test
 * `securityHeaders.test.ts` enforces that and the inline-script hash.
 */

/** SHA-256 of the inline theme bootstrap in index.html (base64, LF-normalized:
 * the HTML parser normalizes CRLF to LF before hashing). */
export const INLINE_THEME_SCRIPT_HASH = "'sha256-RqI12SN3evdFRnYp7+XrK9OgtKNd6L6/S/E5MV/IpV4='";

/** SHA-256 of the inline accent bootstrap in index.html (same LF normalization). */
export const INLINE_ACCENT_SCRIPT_HASH = "'sha256-ZJBzBtiCKPO/MWJKuyZKreaJDf3vWUOt0zR5LBj3cig='";

/**
 * SHA-256 of the script next-themes injects at runtime for its pre-hydration
 * theme pass. The text is generated from the `ThemeProvider` props in App.tsx,
 * so it is tied to the installed next-themes version. Recompute it (or run the
 * Preview smoke test) after upgrading next-themes or changing those props.
 */
export const NEXT_THEMES_SCRIPT_HASH = "'sha256-eMuh8xiwcX72rRYNAGENurQBAcH7kLlAUQcoOri3BIo='";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `script-src 'self' https://apis.google.com https://accounts.google.com https://www.gstatic.com ${INLINE_THEME_SCRIPT_HASH} ${INLINE_ACCENT_SCRIPT_HASH} ${NEXT_THEMES_SCRIPT_HASH}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export const PERMISSIONS_POLICY =
  "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()";

/**
 * HSTS is deliberately short-lived: the app is served from a `*.pages.dev`
 * hostname, so this must never become a long-lived preload pin. A custom
 * production domain can raise max-age once it is stable.
 */
export const STRICT_TRANSPORT_SECURITY = "max-age=300";

/** Headers applied to every Functions response. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": PERMISSIONS_POLICY,
  "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY,
});

/** Sets (never appends) the security headers on an existing Headers object. */
export const applySecurityHeaders = (headers: Headers): void => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
};
