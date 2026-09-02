/**
 * @deprecated Compatibility entrypoint. Gmail protocol ownership lives in the
 * official Integration Plugin; the local host only supplies Secret/OAuth ports.
 */
import {
  classifyGmailForbiddenPayload,
  createGmailProvider,
  resolveStaleHistoryRecovery,
  type GmailFetch,
  type GmailForbiddenDisposition,
  type GmailTokenRefs,
} from "@adeptify/goalboard-integration-gmail";

import { connectorFixtureAllowed } from "../execution-mode.js";
import { createFileSecretStore } from "../security/secret-store.js";
import { resolveUsableGmailAccessToken } from "./gmail-oauth.js";
import type { ConnectorIngestItem, ConnectorPort } from "./types.js";

export {
  classifyGmailForbiddenPayload,
  resolveStaleHistoryRecovery,
  type GmailFetch,
  type GmailForbiddenDisposition,
};

export function createGmailConnector(opts?: {
  fixture?: ConnectorIngestItem[];
  allowFixture?: boolean;
  authRef?: string;
  accessToken?: string;
  tokenRefs?: GmailTokenRefs;
  scope?: string;
  fetchImpl?: GmailFetch;
  getNowMs?: () => number;
}): ConnectorPort {
  return createGmailProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    authRef: opts?.authRef ?? process.env.GOALBOARD_GMAIL_AUTH_REF,
    resolveAuthRef(authRef) {
      return createFileSecretStore().get(authRef);
    },
    resolveUsableToken: resolveUsableGmailAccessToken,
  });
}
