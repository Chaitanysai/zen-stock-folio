import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
export default function AssistantRoot() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const assistant = useAssistant(userId);

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
      <AssistantPanel open={open} onOpenChange={setOpen} assistant={assistant} />
    </>
  );
}
