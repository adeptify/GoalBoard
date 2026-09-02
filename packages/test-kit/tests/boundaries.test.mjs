import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateImportBoundary,
  extractImportSpecifiers,
  findDependencyCycles,
} from "@adeptify/goalboard-test-kit";

function boundaryPackage(name, packagePath, kind, dependencies = [], exportedSubpaths = ["."]) {
  return {
    name,
    path: packagePath,
    kind,
    declaredDependencies: dependencies,
    exportedSubpaths,
  };
}

function violationCodes(observation) {
  return new Set(evaluateImportBoundary(observation).map((item) => item.code));
}

test("rejects an unpublished deep import", () => {
  const target = boundaryPackage("@adeptify/goalboard-kernel", "packages/kernel", "foundation");
  const importer = boundaryPackage(
    "@adeptify/goalboard-app-local-host",
    "apps/local-host",
    "app",
    [target.name],
  );

  assert.ok(
    violationCodes({
      importer,
      target,
      specifier: `${target.name}/src/registry.js`,
      sourceFile: "apps/local-host/src/index.ts",
    }).has("deep-import"),
  );
});

test("rejects a Module implementation or Store import from another Module", () => {
  const target = boundaryPackage("@adeptify/goalboard-module-goals", "modules/goals", "module");
  const importer = boundaryPackage(
    "@adeptify/goalboard-module-feed",
    "modules/feed",
    "module",
    [target.name],
  );

  const codes = violationCodes({
    importer,
    target,
    specifier: `${target.name}/store`,
    sourceFile: "modules/feed/src/promote.ts",
  });
  assert.ok(codes.has("cross-module-implementation"));
  assert.ok(codes.has("deep-import"));
});

test("rejects imports between Plugin implementations", () => {
  const target = boundaryPackage(
    "@adeptify/goalboard-plugin-artifacts",
    "plugins/native/artifacts",
    "native-plugin",
  );
  const importer = boundaryPackage(
    "@adeptify/goalboard-plugin-goals",
    "plugins/native/goals",
    "native-plugin",
    [target.name],
  );

  assert.ok(
    violationCodes({
      importer,
      target,
      specifier: target.name,
      sourceFile: "plugins/native/goals/src/index.ts",
    }).has("plugin-implementation-import"),
  );
});

test("rejects direct database drivers in Apps", () => {
  const importer = boundaryPackage(
    "@adeptify/goalboard-app-workbench",
    "apps/workbench",
    "app",
  );

  assert.ok(
    violationCodes({
      importer,
      specifier: "better-sqlite3",
      sourceFile: "apps/workbench/src/write.ts",
    }).has("app-direct-database"),
  );
});

test("rejects imports back into the legacy root implementation", () => {
  const importer = boundaryPackage(
    "@adeptify/goalboard-app-local-host",
    "apps/local-host",
    "app",
  );

  assert.ok(
    violationCodes({
      importer,
      specifier: "@adeptify/goalboard/v1/store",
      sourceFile: "apps/local-host/src/index.ts",
    }).has("legacy-root-import"),
  );
});

test("rejects relative imports that escape a package owner", () => {
  const importer = boundaryPackage(
    "@adeptify/goalboard-module-goals",
    "modules/goals",
    "module",
  );

  assert.ok(
    violationCodes({
      importer,
      specifier: "../../../src/v1/store.js",
      sourceFile: "modules/goals/src/index.ts",
      relativeCrossOwner: true,
    }).has("relative-cross-owner"),
  );
});

test("allows explicit public Contract subpaths", () => {
  const contracts = boundaryPackage(
    "@adeptify/goalboard-contracts",
    "packages/contracts",
    "foundation",
    [],
    [".", "./modules/goals"],
  );
  const importer = boundaryPackage(
    "@adeptify/goalboard-module-feed",
    "modules/feed",
    "module",
    [contracts.name],
  );

  assert.deepEqual(
    evaluateImportBoundary({
      importer,
      target: contracts,
      specifier: "@adeptify/goalboard-contracts/modules/goals",
      sourceFile: "modules/feed/src/index.ts",
    }),
    [],
  );
});

test("extracts static, dynamic, re-export, and CommonJS imports", () => {
  const source = `
    import type { Goal } from "@adeptify/goalboard-contracts/modules/goals";
    export { capability } from "@adeptify/goalboard-kernel";
    const lazy = import("@adeptify/goalboard-plugin-goals/internal");
    const legacy = require("better-sqlite3");
    // import ignored from "@adeptify/goalboard-module-feed";
    const example = 'import ignored from "@adeptify/goalboard-module-actions"';
  `;

  assert.deepEqual(extractImportSpecifiers(source), [
    "@adeptify/goalboard-contracts/modules/goals",
    "@adeptify/goalboard-kernel",
    "@adeptify/goalboard-plugin-goals/internal",
    "better-sqlite3",
  ]);
});

test("reports workspace dependency cycles", () => {
  const graph = new Map([
    ["a", ["b"]],
    ["b", ["c"]],
    ["c", ["a"]],
    ["d", []],
  ]);

  assert.deepEqual(findDependencyCycles(graph), [["a", "b", "c", "a"]]);
});
