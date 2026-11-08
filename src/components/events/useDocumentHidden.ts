import { useEffect, useState } from "react";

function readHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

/**
 * True while the tab is hidden. The animation layer pauses its CSS animations
 * in that state so a background tab costs no compositor time.
 */
export function useDocumentHidden(): boolean {
  const [isHidden, setIsHidden] = useState(readHidden);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setIsHidden(document.visibilityState === "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return isHidden;
}
