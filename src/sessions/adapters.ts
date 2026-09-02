import { RuntimeHostRouter } from "@adeptify/goalboard-service-runtime-host";
import { GoalBoardSessionRegistry } from "./registry.js";
import { RegistryFallbackSessionAdapter } from "./registry-fallback-adapter.js";

export {
  CodexRuntimeSessionAdapter,
  RuntimeHostRouter,
  assertCompleteRuntimeSessionCapabilities,
} from "@adeptify/goalboard-service-runtime-host";
export { RegistryFallbackSessionAdapter } from "./registry-fallback-adapter.js";

/** Compatibility composition retained until the Work Plugin migration. */
export class RuntimeSessionAdapterRouter extends RuntimeHostRouter {
  constructor(registry: GoalBoardSessionRegistry) {
    super((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
  }
}
