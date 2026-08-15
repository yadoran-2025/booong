import assert from "node:assert/strict";
import { normalizeFavoriteIds, saveFavoriteIds, toggleFavoriteId } from "../js/favorites.js";

assert.deepEqual(normalizeFavoriteIds(["a", "a", "", null, " b "]), ["a", "b"]);
assert.deepEqual(toggleFavoriteId(["a"], "b"), ["a", "b"]);
assert.deepEqual(toggleFavoriteId(["a", "b"], "a"), ["b"]);
assert.deepEqual(saveFavoriteIds(["a"], { getItem: () => "[]", setItem: () => { throw new Error("blocked"); } }), []);
console.log("favorite tests passed");
