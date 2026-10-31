import assert from "node:assert/strict";
import test from "node:test";
import { requireHealthyPage, serverPageText } from "./lib/runtime-smoke-html.mjs";

test("serialized translations do not turn a healthy page into an error", () => {
  const body = '<main><h1>Oklahoma City Thunder</h1><h2>Four factors</h2></main><script>self.__next_f.push([1,{"Errors":{"couldNotLoad":"This page could not finish loading","pageInterrupted":"Application interrupted"}}])</script>';
  assert.equal(requireHealthyPage("/teams/25", { status: 200, body }), "Oklahoma City Thunder Four factors");
});

test("actual error markup still fails a streamed 200 response", () => {
  assert.throws(() => requireHealthyPage("/teams/25", { status: 200, body: '<main><h1>This page could <strong>not</strong> finish loading</h1></main>' }), /rendered This page could not finish loading/);
});

test("HTTP errors and rendered fallback text remain failures", () => {
  assert.throws(() => requireHealthyPage("/games/1", { status: 500, body: "" }), /returned 500/);
  assert.throws(() => requireHealthyPage("/games/1", { status: 200, body: "<p>Application interrupted</p>" }), /Application interrupted/);
  assert.equal(serverPageText('<style>.label:after { content: "Internal Server Error"; }</style><main>Game flow</main>'), "Game flow");
});
