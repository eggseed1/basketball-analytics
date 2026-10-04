// Test preload: lets scripts import server modules alongside client components.
// `--conditions=react-server` silences "server-only" but breaks next/link.
const Module = require("node:module");

const originalResolve = Module._resolveFilename;
const stubPath = require.resolve("./empty-module.cjs");

Module._resolveFilename = function resolve(request, ...rest) {
  if (request === "server-only") return stubPath;
  return originalResolve.call(this, request, ...rest);
};
