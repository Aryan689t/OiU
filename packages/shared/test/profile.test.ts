import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROFILE,
  parseCommaSeparatedList,
  formatCommaSeparatedList,
  validateProfile,
} from "../dist/index.js";

test("DEFAULT_PROFILE has expected empty defaults", () => {
  assert.equal(DEFAULT_PROFILE.displayName, "");
  assert.deepEqual(DEFAULT_PROFILE.aliases, []);
  assert.deepEqual(DEFAULT_PROFILE.identifiers, []);
});

test("parseCommaSeparatedList parses, trims and deduplicates items", () => {
  const result = parseCommaSeparatedList("  Aryan, Ari,  Aryan , 21BCE1042  ");
  assert.deepEqual(result, ["Aryan", "Ari", "21BCE1042"]);
});

test("formatCommaSeparatedList formats string array", () => {
  const formatted = formatCommaSeparatedList(["Ari", "Aryan"]);
  assert.equal(formatted, "Ari, Aryan");
});

test("validateProfile validates presence of displayName", () => {
  const invalid = validateProfile({ displayName: "   " });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 1);

  const valid = validateProfile({ displayName: "Aryan", aliases: ["Ari"] });
  assert.equal(valid.valid, true);
  assert.equal(valid.errors.length, 0);
});
