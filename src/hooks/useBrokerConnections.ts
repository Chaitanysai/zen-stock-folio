/**
 * The caller's broker connections, read for display filtering.
 *
 * The dashboard needs to know which connections the user has disconnected so it
 * can stop presenting their rows. That is a read-only concern: this hook never
 * writes, and a failed read is deliberately silent. An unreachable or
 * unconfigured connection store means nothing is *known* to be disconnected, so
 * every row keeps showing — only a successful read can hide data.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { brokerApi } from "@/lib/brokers/client";
import type { BrokerConnectionPublic } from "@/lib/brokers/contracts";

export interface UseBrokerConnectionsResult {
  connections: BrokerConnectionPublic[];
  /** Re-reads the list, e.g. after the Brokers section disconnects an account. */
  refresh: () => Promise<void>;
}

export function useBrokerConnections(
  userId: string | undefined,
  authLoading: boolean,
): UseBrokerConnectionsResult {
  const [connections, setConnections] = useState<BrokerConnectionPublic[]>([]);
  // A read started for a previous account must never land on the current one.
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    if (!userId) {
      setConnections([]);
      return;
    }
    try {
      const data = await brokerApi.connections();
      if (seq !== seqRef.current) return;
      const rows = data.storeReady && Array.isArray(data.connections) ? data.connections : [];
      setConnections(rows);
    } catch {
      if (seq !== seqRef.current) return;
      // Unknown, not disconnected: hide nothing.
      setConnections([]);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    // Hard reset first so a signed-out or switched account never keeps the
    // previous account's disconnections.
    setConnections([]);
    void refresh();
    return () => {
      seqRef.current += 1;
    };
  }, [authLoading, refresh]);

  return { connections, refresh };
}
