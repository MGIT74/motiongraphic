// Tests unitaires purs des permissions des jetons MCP (aucun serveur, aucune base).
import assert from "node:assert/strict";
import { scopeForTool, scopesAllow, parseScopes, parseExpiryDays, rateLimited, MCP_SCOPES } from "../../src/lib/studio/mcp-scopes.ts";

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("✅ " + name); };

ok("render_project exige « export »", () => assert.equal(scopeForTool("render_project"), "export"));
ok("outils de lecture connus", () => {
  for (const t of ["list_templates", "get_template_schema", "list_projects", "get_timeline", "preview_frame", "get_render", "list_media"]) {
    assert.equal(scopeForTool(t), "read", t);
  }
});
ok("outil de modification = write", () => {
  for (const t of ["create_project", "add_element", "delete_scene", "set_brand", "import_media_url", "save_project"]) assert.equal(scopeForTool(t), "write", t);
});
ok("outil inconnu = write (jamais ouvert par oubli)", () => assert.equal(scopeForTool("outil_futur_inconnu"), "write"));
ok("read seul : lit mais n'écrit pas ni n'exporte", () => {
  assert.equal(scopesAllow(["read"], "read"), true);
  assert.equal(scopesAllow(["read"], "write"), false);
  assert.equal(scopesAllow(["read"], "export"), false);
});
ok("write implique read, pas export", () => {
  assert.equal(scopesAllow(["write"], "read"), true);
  assert.equal(scopesAllow(["write"], "export"), false);
});
ok("export seul n'implique ni read ni write", () => {
  assert.equal(scopesAllow(["export"], "export"), true);
  assert.equal(scopesAllow(["export"], "read"), false);
  assert.equal(scopesAllow(["export"], "write"), false);
});
ok("permissions absentes ou vides = refus", () => {
  assert.equal(scopesAllow(undefined, "read"), false);
  assert.equal(scopesAllow([], "read"), false);
});
ok("parseScopes : valeurs valides, doublons retirés", () => assert.deepEqual(parseScopes(["read", "read", "write"]), ["read", "write"]));
ok("parseScopes : refuse vide, inconnu, non-tableau, trop long", () => {
  assert.equal(parseScopes([]), null);
  assert.equal(parseScopes(["admin"]), null);
  assert.equal(parseScopes("read"), null);
  assert.equal(parseScopes([...MCP_SCOPES, "read"]), null);
  assert.equal(parseScopes([1]), null);
});
ok("durées : 30/90/365 seulement", () => {
  assert.equal(parseExpiryDays(30), 30);
  assert.equal(parseExpiryDays(365), 365);
  assert.equal(parseExpiryDays(7), null);
  assert.equal(parseExpiryDays("90"), null);
  assert.equal(parseExpiryDays(0), null);
});
ok("limiteur : bloque au-delà du maximum, libère après la fenêtre", () => {
  const k = "t-" + Math.random();
  for (let i = 0; i < 3; i++) assert.equal(rateLimited(k, 3, 1000, 1000 + i), false);
  assert.equal(rateLimited(k, 3, 1000, 1010), true);
  assert.equal(rateLimited(k, 3, 1000, 5000), false);
});
console.log(`\n${n} contrôles OK`);
