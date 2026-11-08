import type { CSSProperties } from "react";

const STARS = [
  { left: "62%", top: "16%", size: 18, duration: 9.5, delay: 0.4 },
  { left: "78%", top: "9%", size: 12, duration: 7.8, delay: 2.1 },
  { left: "88%", top: "26%", size: 15, duration: 11.2, delay: 1.2 },
  { left: "70%", top: "38%", size: 10, duration: 8.6, delay: 3.4 },
  { left: "94%", top: "48%", size: 13, duration: 10.4, delay: 0.9 },
];

/**
 * A handful of distant sparkles. Five nodes, long staggered twinkles — enough
 * to suggest a cold night sky without turning the hero into a starfield.
 */
export default function StarField() {
  return (
    <div className="zl-ev-stars">
      {STARS.map((star, index) => {
        const style = {
          left: star.left,
          top: star.top,
          "--zl-star-size": `${star.size}px`,
          "--zl-star-dur": `${star.duration}s`,
          "--zl-star-delay": `${star.delay}s`,
        } as CSSProperties;

        return (
          <svg
            key={index}
            className="zl-ev-star"
            style={style}
            viewBox="0 0 24 24"
            role="presentation"
            focusable="false"
          >
            <path
              d="M12 0 C13.2 8.4 15.6 10.8 24 12 C15.6 13.2 13.2 15.6 12 24 C10.8 15.6 8.4 13.2 0 12 C8.4 10.8 10.8 8.4 12 0 Z"
              fill="currentColor"
            />
          </svg>
        );
      })}
    </div>
  );
}
