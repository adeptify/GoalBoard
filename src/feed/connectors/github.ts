/**
 * @deprecated Compatibility entrypoint. GitHub Provider ownership lives in the
 * official Integration Plugin; legacy callers keep their existing factory.
 */
import {
  createGithubProvider,
  type GithubFetch,
} from "@adeptify/goalboard-integration-github";

import { connectorFixtureAllowed } from "../execution-mode.js";
import { resolveGithubToken } from "./credentials.js";
import type { ConnectorIngestItem, ConnectorPort } from "./types.js";

export type { GithubFetch };

export function createGithubConnector(opts?: {
  fixture?: ConnectorIngestItem[];
  token?: string;
  allowFixture?: boolean;
  fetchImpl?: GithubFetch;
  now?: () => Date;
}): ConnectorPort {
  return createGithubProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    resolveToken: resolveGithubToken,
  });
}
