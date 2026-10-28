import type { Env } from "../../_lib/types.ts";
import type { BrokerError } from "./errors.ts";
import { canTransition, statusForError, withStatus } from "./stateMachine.ts";
import type { BrokerConnectionRecord } from "./store.ts";
import { putConnectionRecord } from "./store.ts";

/**
 * Persists the connection state implied by a provider failure. A transition
 * that the state machine forbids is skipped rather than forced, so one odd
 * provider response cannot park a connection in an illegal state.
 */
export const persistFailure = async (
  env: Env,
  record: BrokerConnectionRecord,
  failure: BrokerError,
  now: Date,
): Promise<BrokerConnectionRecord> => {
  const target = statusForError(failure.code);
  if (!canTransition(record.status, target)) return record;

  const next = withStatus(record, target, now, {
    lastErrorCode: failure.code,
    syncLockUntil: null,
  });
  await putConnectionRecord(env, next);
  return next;
};
