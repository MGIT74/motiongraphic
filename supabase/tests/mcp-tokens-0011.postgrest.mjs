// Migration 0011 (jetons MCP : permissions, renouvellement, audit) — Supabase LOCAL jetable uniquement.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE;
const anonKey = process.env.SUPABASE_TEST_ANON;
if (!url || !serviceKey || !anonKey) {
  console.error('FAIL CONFIG: SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE et SUPABASE_TEST_ANON requis');
  process.exit(1);
}
{
  let host = '';
  try { host = new URL(url).hostname; } catch { /* refusée ci-dessous */ }
  if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(host) || /motiongraphic\.si/i.test(url)) {
    console.error('FAIL CONFIG: refusé, SUPABASE_TEST_URL doit être un Supabase LOCAL jetable (jamais la production).');
    process.exit(2);
  }
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const base = url.replace(/\/$/, '');
const nonce = randomBytes(6).toString('hex');
const password = 'Test!' + randomBytes(24).toString('base64url') + '9a';
const userIds = [];
const checks = [];

function assert(c, m) { if (!c) throw new Error(m); }
function clean(e) {
  if (!e) return 'no error';
  return (e.code || e.status || 'unknown') + ': ' + String(e.message || 'unknown').replace(/[A-Za-z0-9_-]{35,}/g, '[REDACTED]').replace(/[\w.+-]+@[\w.-]+/g, '[EMAIL]');
}
async function step(name, fn) {
  try { await fn(); checks.push({ name, ok: true }); console.log('PASS ' + name); }
  catch (e) { checks.push({ name, ok: false }); console.error('FAIL ' + name + ': ' + clean(e)); }
}
const hash = () => randomBytes(32).toString('hex');
async function rest(jwt, method, path, body) {
  const r = await fetch(base + '/rest/v1/' + path, {
    method,
    headers: { apikey: anonKey, Authorization: 'Bearer ' + jwt, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status };
}

async function run() {
  let owner, session;
  try {
    const email = 'tok0011-' + nonce + '@clone.test';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data?.user?.id) throw new Error('createUser: ' + clean(error));
    owner = data.user.id; userIds.push(owner);
    await admin.from('profiles').update({ status: 'active', role: 'user' }).eq('id', owner);
    const signed = await publicClient.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data?.session) throw new Error('signIn: ' + clean(signed.error));
    session = signed.data.session.access_token;

    await step('a permissions par défaut = read + write (jamais export)', async () => {
      const { data: row, error: e } = await admin.from('mcp_user_tokens').insert({ user_id: owner, name: 'defaut', token_hash: hash() }).select('scopes').single();
      assert(!e && row, 'insert: ' + clean(e));
      assert(JSON.stringify([...row.scopes].sort()) === JSON.stringify(['read', 'write']), 'défaut inattendu: ' + JSON.stringify(row.scopes));
    });
    await step('b permissions valides acceptées (read+export)', async () => {
      const { error: e } = await admin.from('mcp_user_tokens').insert({ user_id: owner, name: 'ro-export', token_hash: hash(), scopes: ['read', 'export'] });
      assert(!e, 'refusé à tort: ' + clean(e));
    });
    await step('c permissions invalides refusées (contrainte 23514)', async () => {
      for (const scopes of [['admin'], [], ['read', 'read', 'write', 'export'], ['read', 'root']]) {
        const { error: e } = await admin.from('mcp_user_tokens').insert({ user_id: owner, name: 'mauvais', token_hash: hash(), scopes });
        assert(e && e.code === '23514', JSON.stringify(scopes) + ' accepté ou mauvais code (' + clean(e) + ')');
      }
    });
    await step('d renouvellement : rotated_from doit référencer un jeton existant (FK 23503)', async () => {
      const { error: e } = await admin.from('mcp_user_tokens').insert({ user_id: owner, name: 'rot', token_hash: hash(), rotated_from: randomUUID() });
      assert(e && e.code === '23503', 'FK non appliquée (' + clean(e) + ')');
    });
    await step('e audit : le serveur écrit, événement inconnu refusé', async () => {
      const ok = await admin.from('mcp_token_audit').insert({ event: 'created', user_id: owner, detail: { test: true } });
      assert(!ok.error, 'audit refusé: ' + clean(ok.error));
      const bad = await admin.from('mcp_token_audit').insert({ event: 'inconnu', user_id: owner });
      assert(bad.error && bad.error.code === '23514', 'événement invalide accepté (' + clean(bad.error) + ')');
    });
    await step('f audit : anon et authenticated sans aucun accès', async () => {
      for (const [label, jwt] of [['anon', anonKey], ['authenticated', session]]) {
        const r = await rest(jwt, 'GET', 'mcp_token_audit?select=id');
        assert(r.status === 401 || r.status === 403, label + ' lecture HTTP ' + r.status);
        const w = await rest(jwt, 'POST', 'mcp_token_audit', { event: 'created', user_id: owner });
        assert(w.status === 401 || w.status === 403, label + ' écriture HTTP ' + w.status);
      }
    });
    await step('g jetons : authenticated ne lit ni n\'écrit (scopes inclus)', async () => {
      const r = await rest(session, 'GET', 'mcp_user_tokens?select=id,scopes');
      assert(r.status === 401 || r.status === 403, 'lecture HTTP ' + r.status);
      const w = await rest(session, 'POST', 'mcp_user_tokens', { user_id: owner, name: 'x', token_hash: hash(), scopes: ['export'] });
      assert(w.status === 401 || w.status === 403, 'écriture HTTP ' + w.status);
    });
  } finally {
    for (const id of userIds.reverse()) {
      await admin.from('mcp_token_audit').delete().eq('user_id', id);
      await admin.from('mcp_user_tokens').delete().eq('user_id', id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) { checks.push({ name: 'nettoyage GoTrue', ok: false }); console.error('FAIL NETTOYAGE: ' + clean(error)); }
    }
  }
}
try { await run(); } catch (e) { checks.push({ name: 'préparation', ok: false }); console.error('FAIL PRÉPARATION: ' + clean(e)); }
const failed = checks.filter((x) => !x.ok);
console.log('RESULT 0011: ' + (failed.length ? 'FAIL' : 'PASS') + ' (' + checks.filter((x) => x.ok).length + ' PASS, ' + failed.length + ' FAIL)');
if (failed.length || checks.length < 7) process.exitCode = 1;
