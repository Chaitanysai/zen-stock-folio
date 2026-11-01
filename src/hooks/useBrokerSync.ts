import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrokerApiError,
  brokerErrorMessage,
  isConnectionExpired,
  linkBrokerToken,
  runBrokerSync,
} from "@/lib/broker/client";
import {
  clearBrokerConnection,
  loadBrokerConnection,
  markBrokerSynced,
  saveBrokerConnection,
} from "@/lib/broker/connectionStore";
import type {
  ApplyResult,
  BrokerConnection,
  BrokerConnectionPayload,
  PreviewResult,
  PreviewSyncRequest,
} from "@/lib/broker/types";

const EXPIRED_MESSAGE =
  "The broker token expired. Generate a new one and link the account again.";
const SIGNED_OUT_MESSAGE = "Sign in to sync a broker account.";
const SYNC_MARK_FAILED_MESSAGE =
  "The portfolio synced, but the last-sync time could not be saved.";

export interface BrokerSyncState {
  connection: BrokerConnection | null;
  preview: PreviewResult | null;
  applied: ApplyResult | null;
  /** The initial connection read is still running. */
  loading: boolean;
  /** A link, preview, apply, or disconnect is running. */
  busy: boolean;
  error: string | null;
  /** The stored token is past `expiresAt`, or the broker rejected it. */
  expired: boolean;
  /** The deployment has not configured the broker routes. */
  disabled: boolean;
}

const initialState = (loading = false): BrokerSyncState => ({
  connection: null,
  preview: null,
  applied: null,
  loading,
  busy: false,
  error: null,
  expired: false,
  disabled: false,
});

export const useBrokerSync = (userId: string | undefined) => {
  const [scope, setScope] = useState(userId);
  const [state, setState] = useState<BrokerSyncState>(() => initialState(Boolean(userId)));
  const scopeRef = useRef(userId);
  const mountedRef = useRef(true);

  // Reset during render rather than in an effect. An effect runs after the
  // commit, so the next account would paint the previous account's sealed
  // connection and portfolio preview for one frame. Moving `scopeRef` with the
  // reset covers every completion that checks `isCurrent` (link, preview,
  // apply, disconnect); it does not cover the load effect below, whose
  // `cancelled` flag is only set by the passive cleanup, so that continuation
  // re-checks `scopeRef` itself.
  if (scope !== userId) {
    setScope(userId);
    scopeRef.current = userId;
    setState(initialState(Boolean(userId)));
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const result = await loadBrokerConnection(userId);
      // `cancelled` is only set by the passive cleanup, which runs after the
      // commit that switched accounts, so a read that resolves in between must
      // also fail the scope check.
      if (cancelled || scopeRef.current !== userId) return;

      if (result.status === "error") {
        setState((current) => ({ ...current, loading: false, error: result.error }));
        return;
      }

      const expired = result.connection ? isConnectionExpired(result.connection) : false;
      setState((current) => ({
        ...current,
        loading: false,
        connection: result.connection,
        expired,
        error: expired ? EXPIRED_MESSAGE : null,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isCurrent = useCallback(
    (uid: string) => mountedRef.current && scopeRef.current === uid,
    [],
  );

  const reportFailure = useCallback((error: unknown) => {
    const code = error instanceof BrokerApiError ? error.code : "";
    const ended = code === "TOKEN_EXPIRED" || code === "BAD_CIPHERTEXT";
    setState((current) => ({
      ...current,
      busy: false,
      error: brokerErrorMessage(error),
      expired: current.expired || ended,
      disabled: current.disabled || code === "BROKER_DISABLED",
    }));
  }, []);

  const previewFor = useCallback(
    async (uid: string, connection: BrokerConnection): Promise<PreviewResult | null> => {
      if (!isCurrent(uid)) return null;

      if (isConnectionExpired(connection)) {
        setState((current) => ({
          ...current,
          busy: false,
          expired: true,
          error: EXPIRED_MESSAGE,
          preview: null,
          applied: null,
        }));
        return null;
      }

      setState((current) => ({ ...current, busy: true, error: null, preview: null, applied: null }));
      const request: PreviewSyncRequest = {
        mode: "preview",
        ciphertext: connection.ciphertext,
        iv: connection.iv,
        keyVersion: connection.keyVersion,
      };

      try {
        const preview = await runBrokerSync(request);
        if (!isCurrent(uid)) return null;
        setState((current) => ({ ...current, busy: false, preview }));
        return preview;
      } catch (error) {
        if (isCurrent(uid)) reportFailure(error);
        return null;
      }
    },
    [isCurrent, reportFailure],
  );

  const link = useCallback(
    async (token: string): Promise<boolean> => {
      if (!userId) {
        setState((current) => ({ ...current, error: SIGNED_OUT_MESSAGE }));
        return false;
      }
      if (!isCurrent(userId)) return false;

      setState((current) => ({ ...current, busy: true, error: null, applied: null }));

      let sealed: BrokerConnectionPayload;
      try {
        sealed = await linkBrokerToken(token);
      } catch (error) {
        if (isCurrent(userId)) reportFailure(error);
        return false;
      }

      const saveError = await saveBrokerConnection(userId, sealed);
      if (!isCurrent(userId)) return false;
      if (saveError) {
        setState((current) => ({ ...current, busy: false, error: saveError }));
        return false;
      }

      const connection: BrokerConnection = { ...sealed, provider: "indmoney", syncedAt: null };
      setState((current) => ({
        ...current,
        connection,
        expired: false,
        preview: null,
        applied: null,
      }));

      await previewFor(userId, connection);
      return true;
    },
    [isCurrent, previewFor, reportFailure, userId],
  );

  const runPreview = useCallback(async (): Promise<PreviewResult | null> => {
    if (!userId) {
      setState((current) => ({ ...current, error: SIGNED_OUT_MESSAGE }));
      return null;
    }
    if (!state.connection) {
      setState((current) => ({ ...current, error: "Link a broker account first." }));
      return null;
    }
    return previewFor(userId, state.connection);
  }, [previewFor, state.connection, userId]);

  const apply = useCallback(
    async (confirmEmpty = false): Promise<ApplyResult | null> => {
      if (!userId) {
        setState((current) => ({ ...current, error: SIGNED_OUT_MESSAGE }));
        return null;
      }
      if (!isCurrent(userId)) return null;

      const { connection, preview } = state;
      if (!connection || !preview) {
        setState((current) => ({ ...current, error: "Run a preview before applying." }));
        return null;
      }
      if (isConnectionExpired(connection)) {
        setState((current) => ({
          ...current,
          busy: false,
          expired: true,
          error: EXPIRED_MESSAGE,
          preview: null,
          applied: null,
        }));
        return null;
      }

      setState((current) => ({ ...current, busy: true, error: null }));

      let result: ApplyResult;
      try {
        result = await runBrokerSync({
          mode: "apply",
          ciphertext: connection.ciphertext,
          iv: connection.iv,
          keyVersion: connection.keyVersion,
          baseUpdateTime: preview.snapshotUpdateTime,
          ...(confirmEmpty ? { confirmEmpty: true } : {}),
        });
      } catch (error) {
        if (isCurrent(userId)) reportFailure(error);
        return null;
      }

      // The server applied the sync for the account that started it, so its
      // own document must record the sync time even if the UI has already
      // moved to another account. Only the local state write is scoped.
      const markError = await markBrokerSynced(userId, result.appliedAt);
      if (!isCurrent(userId)) return null;

      setState((current) => ({
        ...current,
        busy: false,
        applied: result,
        preview: null,
        error: markError ? SYNC_MARK_FAILED_MESSAGE : null,
        connection: current.connection
          ? { ...current.connection, syncedAt: result.appliedAt }
          : current.connection,
      }));
      return result;
    },
    [isCurrent, reportFailure, state, userId],
  );

  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      setState((current) => ({ ...current, error: SIGNED_OUT_MESSAGE }));
      return false;
    }
    if (!isCurrent(userId)) return false;

    setState((current) => ({ ...current, busy: true, error: null }));
    const error = await clearBrokerConnection(userId);
    if (!isCurrent(userId)) return false;

    if (error) {
      setState((current) => ({ ...current, busy: false, error }));
      return false;
    }

    setState(initialState(false));
    return true;
  }, [isCurrent, userId]);

  return { ...state, link, runPreview, apply, disconnect };
};
