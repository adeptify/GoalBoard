import type { ContractDescriptor } from "./package.js";

export const platformAppHostContract = {
  contractId: "io.goalboard.platform.app-host.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/system/ARCHITECTURE.md",
} as const satisfies ContractDescriptor;

export type HostCapabilityOperation = "query" | "command";

export interface HostCapabilityDescriptor {
  capability_id: string;
  version: number;
  operation: HostCapabilityOperation;
}

/**
 * Stable, transport-neutral capability identity. The optional type member is
 * compile-time only; JSON transports use the three public descriptor fields.
 */
export interface HostCapabilityDefinition<Input = unknown, Output = unknown>
  extends HostCapabilityDescriptor {
  readonly __types__?: { input: Input; output: Output };
}

export type HostCapabilityInput<Capability> = Capability extends HostCapabilityDefinition<infer Input, unknown>
  ? Input
  : never;

export type HostCapabilityOutput<Capability> = Capability extends HostCapabilityDefinition<unknown, infer Output>
  ? Output
  : never;

/** Opaque local storage locator. It is never a Project business identity. */
export interface LocalHostProjectReference {
  project_id: string;
  board_id: string;
  storage_key: string;
}

export interface LocalHostProjectState extends LocalHostProjectReference {
  state: "opening" | "ready" | "closing";
}

export interface LocalHostStatus {
  instance_id: string;
  state: "running" | "closing" | "closed";
  projects: LocalHostProjectState[];
  capabilities: HostCapabilityDescriptor[];
}

export interface LocalHostProjectClient {
  readonly host_instance_id: string;
  readonly project: LocalHostProjectReference;
  invoke<Input, Output>(
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
  ): Promise<Output>;
}
