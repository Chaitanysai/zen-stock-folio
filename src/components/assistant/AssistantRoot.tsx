import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { AssistantPageContext } from "@/lib/assistant/schemas";
import { suggestionsForSection } from "@/lib/assistant/toolCatalog";
import { sectionFromSlug } from "@/lib/navigation/routes";
import { AssistantLauncher } from "./AssistantLauncher";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistant } from "./useAssistant";

/**
 * Mount point for the assistant, rendered once inside the authenticated
 * dashboard shell.
 *
 * Everything user-scoped hangs off `user.id`: when there is no session the
 * component renders nothing at all, and when the session changes the hook swaps
 * to that account's own conversation. There is no shared/global assistant state
 * to leak between accounts.
 */
export interface AssistantRootProps {
  /** Selected Charts instrument, passed only from the Charts section (B1.2). */
  chartEntity?: { ticker: string; market: "NSE" | "US" } | null;
}

export default function AssistantRoot({ chartEntity }: AssistantRootProps = {}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useParams();
  const section = sectionFromSlug(params.section);
  const [open, setOpen] = useState(false);

  // Screen hints come from the app's own router, never from arbitrary client
  // strings. An unknown route is omitted; the Charts ticker is a hint only.
  const pageContext: AssistantPageContext | null = section
    ? {
        section,
        ...(section === "charts" && chartEntity
          ? { ticker: chartEntity.ticker, market: chartEntity.market }
          : {}),
      }
    : null;

  const assistant = useAssistant(userId, pageContext);

  const toggle = useCallback(() => setOpen((previous) => !previous), []);

  // ⌘/Ctrl + J toggles the panel. Not a browser shortcut, and it does not
  // intercept typing shortcuts inside inputs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key !== "j" && event.key !== "J") return;
      event.preventDefault();
      setOpen((previous) => !previous);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!userId) return null;

  return (
    <>
      <AssistantLauncher open={open} onToggle={toggle} />
      <AssistantPanel
        open={open}
        onOpenChange={setOpen}
        assistant={assistant}
        suggestions={suggestionsForSection(section)}
      />
    </>
  );
}
