# @adeptify/goalboard-service-connector-host

Status: `partial`  
Workspace path: `horizontal/connector-host`  
Contract entrypoint: `@adeptify/goalboard-contracts/services/connector-host`

## What it owns

Provider-neutral Driver registration, Connection handles, health checks, bounded invocation and standardized Connector Receipts. Drivers return typed Raw Events or a closed failure class.

Provider OAuth/protocol code is injected as a Driver and does not enter this package. The Host does not own Source desired state, credentials, Signals, Feed or Provider-specific business rules.

## FD1 implementation

`ConnectorHost` now backs the existing GitHub/Gmail sync caller. The caller adapts the current provider port into the public Driver Contract; `goal-reorg-fd3` moves each concrete Driver into its official Integration Plugin.

## Commands

```bash
pnpm --filter @adeptify/goalboard-service-connector-host typecheck
pnpm --filter @adeptify/goalboard-service-connector-host build
```

Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`, `goal-reorg-fd3`.
