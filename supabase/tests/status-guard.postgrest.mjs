import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE;
const anonKey = process.env.SUPABASE_TEST_ANON;
if (!url || !serviceKey || !anonKey) {
  console.error('FAIL CONFIG: SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE and SUPABASE_TEST_ANON are required');
  process.exit(1);
}
// Garde-fou : ce test CRÉE et SUPPRIME des comptes et des données. Uniquement sur un Supabase local jetable.
{
  let host = '';
  try { host = new URL(url).hostname; } catch { /* URL invalide : refusée ci-dessous */ }
  if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(host) || /motiongraphic\.si/i.test(url)) {
    console.error('FAIL CONFIG: refusé, SUPABASE_TEST_URL doit être un Supabase LOCAL jetable (jamais la production).');
    process.exit(2);
  }
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const ids = [];
const projectIds = [];
const checks = [];
const nonce = randomBytes(8).toString('hex');
const password = 'Test!' + randomBytes(24).toString('base64url') + '9a';
const base = url.replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function cleanError(error) {
  if (!error) return 'no error';
  const code = error.code || error.status || 'unknown';
  const message = String(error.message || 'unknown error')
    .replace(/[A-Za-z0-9_-]{35,}/g, '[REDACTED]')
    .replace(/[\w.+-]+@[\w.-]+/g, '[EMAIL]');
  return code + ': ' + message;
}
async function step(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log('PASS ' + name);
  } catch (error) {
    checks.push({ name, ok: false });
    console.error('FAIL ' + name + ': ' + cleanError(error));
  }
}
async function createAccount(label) {
  const email = 'status-guard-' + label + '-' + nonce + '@clone.test';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data?.user?.id) throw new Error('GoTrue createUser ' + label + ': ' + cleanError(error));
  ids.push(data.user.id);
  const { data: signed, error: signError } = await publicClient.auth.signInWithPassword({ email, password });
  if (signError || !signed?.session?.access_token) throw new Error('GoTrue signIn ' + label + ': ' + cleanError(signError));
  return { id: data.user.id, jwt: signed.session.access_token };
}
async function setProfile(id, fields) {
  const { data, error } = await admin.from('profiles').update(fields).eq('id', id).select('id,role,status').single();
  if (error || !data) throw new Error('seed profile: ' + cleanError(error));
}
async function rest(jwt, method, path, body, extraHeaders = {}) {
  const response = await fetch(base + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + jwt,
      Accept: 'application/json',
      Prefer: 'return=representation',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  return { status: response.status, data, raw };
}
function success(r) { return r.status >= 200 && r.status < 300; }
function noWrite(r, label) {
  assert(!success(r) || (Array.isArray(r.data) && r.data.length === 0), label + ' unexpectedly changed a row (HTTP ' + r.status + ')');
}
function errorText(r) {
  return String(r.data?.message || '') + ' ' + String(r.data?.code || '');
}
function queryId(id) { return 'id=eq.' + encodeURIComponent(id); }
async function seed(table, payload) {
  const { data, error } = await admin.from(table).insert(payload).select('id').single();
  if (error || !data) throw new Error('seed ' + table + ': ' + cleanError(error));
  return data.id;
}
async function run() {
  let suspended, active, other, activeAdmin;
  try {
    suspended = await createAccount('suspended');
    active = await createAccount('active');
    other = await createAccount('other');
    activeAdmin = await createAccount('admin');
    await setProfile(active.id, { status: 'active', role: 'user' });
    await setProfile(other.id, { status: 'active', role: 'user' });
    await setProfile(activeAdmin.id, { status: 'active', role: 'admin' });
    await setProfile(suspended.id, { status: 'suspended', role: 'user' });
    console.log('PASS SETUP: real GoTrue accounts and signed JWT sessions');

    await step('a suspended cannot reactivate own profile (STATUT_PROTEGE)', async () => {
      const r = await rest(suspended.jwt, 'PATCH', 'profiles?' + queryId(suspended.id), { status: 'active' });
      assert(!success(r) && errorText(r).includes('STATUT_PROTEGE'), 'expected STATUT_PROTEGE; HTTP ' + r.status + ', error ' + errorText(r));
      const { data, error } = await admin.from('profiles').select('status').eq('id', suspended.id).single();
      assert(!error && data.status === 'suspended', 'suspended status changed');
    });
    await step('b active user cannot self-promote to admin', async () => {
      const r = await rest(active.jwt, 'PATCH', 'profiles?' + queryId(active.id), { role: 'admin' });
      assert(!success(r) && errorText(r).includes('ROLE_PROTEGE'), 'expected ROLE_PROTEGE; HTTP ' + r.status + ', error ' + errorText(r));
    });
    await step('c active admin can change another account status', async () => {
      const r = await rest(activeAdmin.jwt, 'PATCH', 'profiles?' + queryId(other.id), { status: 'suspended' });
      assert(success(r) && Array.isArray(r.data) && r.data.length === 1, 'admin PATCH failed or affected no rows: HTTP ' + r.status + ' ' + errorText(r));
      const { data } = await admin.from('profiles').select('status').eq('id', other.id).single();
      assert(data?.status === 'suspended', 'admin change not persisted');
      await setProfile(other.id, { status: 'active' });
    });
    await step('d service_role can change account status', async () => {
      const r = await rest(serviceKey, 'PATCH', 'profiles?' + queryId(other.id), { status: 'suspended' }, { apikey: serviceKey });
      assert(success(r) && Array.isArray(r.data) && r.data.length === 1, 'service PATCH failed: HTTP ' + r.status + ' ' + errorText(r));
      await setProfile(other.id, { status: 'active' });
    });

    const project = await seed('studio_projects', {
      id: randomUUID(), user_id: suspended.id, name: 'status-guard-project',
      schema_version: 1, fps: 30, width: 1920, height: 1080, data: {},
    });
    projectIds.push(project);
    const media = await seed('studio_media', {
      id: randomUUID(), project_id: project, user_id: suspended.id,
      storage_path: 'status-guard/' + nonce + '/clip.mp4', kind: 'video', name: 'original',
    });
    const version = await seed('studio_project_versions', {
      id: randomUUID(), project_id: project, user_id: suspended.id, label: 'original', data: {},
    });
    const render = await seed('studio_renders', {
      id: randomUUID(), project_id: project, user_id: suspended.id,
      status: 'done', format: 'mp4', resolution: '1080p',
    });
    await step('e suspended cannot write to any of four studio tables', async () => {
      for (const [table, id, patch] of [
        ['studio_projects', project, { name: 'forbidden' }],
        ['studio_media', media, { name: 'forbidden' }],
        ['studio_project_versions', version, { label: 'forbidden' }],
        ['studio_renders', render, { status: 'pending' }],
      ]) {
        const r = await rest(suspended.jwt, 'PATCH', table + '?' + queryId(id), patch);
        noWrite(r, table);
        const { data, error } = await admin.from(table).select('*').eq('id', id).single();
        assert(!error && Object.entries(patch).every(([k, v]) => data[k] !== v), table + ' data was modified');
      }
    });
    const activeProject = await seed('studio_projects', {
      id: randomUUID(), user_id: active.id, name: 'active-private',
      schema_version: 1, fps: 30, width: 1920, height: 1080, data: {},
    });
    projectIds.push(activeProject);
    await step('f signed user JWT cannot see another user project', async () => {
      const own = await rest(active.jwt, 'GET', 'studio_projects?select=id&' + queryId(activeProject));
      assert(success(own) && own.data?.length === 1, 'own row not visible');
      const foreign = await rest(other.jwt, 'GET', 'studio_projects?select=id&' + queryId(activeProject));
      assert(success(foreign) && Array.isArray(foreign.data) && foreign.data.length === 0, 'foreign project visible');
    });
    await step('g anon and authenticated cannot access mcp_user_tokens', async () => {
      for (const [label, jwt] of [['anon', anonKey], ['authenticated', active.jwt]]) {
        const r = await rest(jwt, 'GET', 'mcp_user_tokens?select=id');
        assert(r.status === 401 || r.status === 403, label + ' received HTTP ' + r.status + ' (expected 401/403)');
        const w = await rest(jwt, 'POST', 'mcp_user_tokens', { user_id: active.id, name: 'forbidden', token_hash: randomBytes(32).toString('hex') });
        assert(w.status === 401 || w.status === 403, label + ' write received HTTP ' + w.status);
      }
    });
    await step('h forged JWT rejected by PostgREST', async () => {
      const parts = active.jwt.split('.');
      assert(parts.length === 3, 'GoTrue did not return a signed JWT');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      payload.role = 'service_role';
      const forged = parts[0] + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + parts[2];
      for (const jwt of [forged, parts[0] + '.' + parts[1] + '.invalidsignature']) {
        const r = await rest(jwt, 'GET', 'profiles?select=id&limit=1');
        assert(r.status === 401 || r.status === 403, 'forged JWT accepted (HTTP ' + r.status + ')');
      }
    });
  } finally {
    // Remove child rows before GoTrue users, regardless of test failures.
    for (const table of ['studio_renders', 'studio_project_versions', 'studio_media']) {
      if (projectIds.length) {
        const { error } = await admin.from(table).delete().in('project_id', projectIds);
        if (error && table !== 'studio_projects') console.error('FAIL CLEANUP ' + table + ': ' + cleanError(error));
      }
    }
    if (projectIds.length) {
      const { error } = await admin.from('studio_projects').delete().in('id', projectIds);
      if (error) console.error('FAIL CLEANUP projects: ' + cleanError(error));
    }
    for (const id of ids.reverse()) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) { checks.push({ name: 'cleanup GoTrue user', ok: false }); console.error('FAIL CLEANUP GoTrue: ' + cleanError(error)); }
    }
  }
}
try {
  await run();
} catch (error) {
  checks.push({ name: 'setup / execution', ok: false });
  console.error('FAIL SETUP/EXECUTION: ' + cleanError(error));
}
const failed = checks.filter((x) => !x.ok);
console.log('RESULT: ' + (failed.length ? 'FAIL' : 'PASS') + ' (' + checks.filter((x) => x.ok).length + ' PASS, ' + failed.length + ' FAIL)');
if (failed.length || checks.length < 8) process.exitCode = 1;
