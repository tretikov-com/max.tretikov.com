import assert from "node:assert/strict";
import test from "node:test";
import { legacyRouteHref, readRoute } from "./navigation.js";

test("route state keeps pathname, search, and document fragment separate", () => {
  assert.deepEqual(
    readRoute({
      pathname: "/projects/rlqf/index.md",
      search: "?view=source",
      hash: "#proof-sketch",
    }),
    {
      pathname: "/projects/rlqf/index.md",
      search: "?view=source",
      hash: "#proof-sketch",
    },
  );
});

test("legacy project hashes migrate to clean paths without losing anchors", () => {
  assert.equal(
    legacyRouteHref("#projects/rlqf/index.md#proof-sketch"),
    "/projects/rlqf/index.md#proof-sketch",
  );
});

test("legacy landing hashes migrate but document fragments do not", () => {
  assert.equal(legacyRouteHref("#blog"), "/blog");
  assert.equal(legacyRouteHref("#papers"), "/papers");
  assert.equal(legacyRouteHref("#profiles"), "/profiles");
  assert.equal(legacyRouteHref("#proof-sketch"), null);
});
