import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  STUDIO_TOOL_CATALOG,
  catalogVersion,
  listToolsForSurface,
  authorizeTool,
  buildStudioRequest,
  catalogParityReport,
  agentToolNames,
  mcpToolNames,
  AGENT_BLOCKED_TOOL_NAMES,
} from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const mcpToolsDir = path.join(root, 'packages/studio-mcp/src/tools');

function mcpRegisteredNames() {
  const names = [];
  for (const file of fs.readdirSync(mcpToolsDir).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(mcpToolsDir, file), 'utf8');
    for (const match of src.matchAll(/server\.tool\(\s*["']([^"']+)["']/g)) {
      names.push(match[1]);
    }
  }
  return [...new Set(names)].sort();
}

test('catalog version present', () => {
  assert.ok(catalogVersion());
});

test('catalog has 213 tools matching MCP registrations', () => {
  const registered = mcpRegisteredNames();
  const report = catalogParityReport(registered);
  assert.equal(report.missingInCatalog.length, 0, JSON.stringify(report.missingInCatalog));
  assert.equal(report.missingInMcp.length, 0, JSON.stringify(report.missingInMcp));
  assert.equal(STUDIO_TOOL_CATALOG.length, 213);
});

test('positive surfaces: agent excludes retired tools', () => {
  const agent = new Set(agentToolNames('user'));
  for (const name of [
    'studio_generate_element_sheet',
    'studio_create_style_sheet',
    'studio_build_style_sheet',
    'studio_set_active_style_sheet',
    'studio_ensure_brief',
    'studio_edit_brief',
    'studio_approve_brief',
    'studio_reject_brief',
    'studio_generate_script',
  ]) {
    assert.equal(agent.has(name), false, name);
    assert.ok(AGENT_BLOCKED_TOOL_NAMES.includes(name), name);
  }
});

test('admin tools gated by role', () => {
  const userAgent = new Set(listToolsForSurface('agent', { role: 'user' }).map((t) => t.name));
  const adminAgent = new Set(listToolsForSurface('agent', { role: 'admin' }).map((t) => t.name));
  assert.equal(userAgent.has('studio_admin_refund_job'), false);
  assert.equal(adminAgent.has('studio_admin_refund_job'), true);
  const denied = authorizeTool('studio_admin_refund_job', {
    surface: 'agent',
    role: 'user',
    scopes: ['marketplace'],
  });
  assert.equal(denied.ok, false);
  const allowed = authorizeTool('studio_admin_refund_job', {
    surface: 'admin',
    role: 'admin',
    scopes: ['marketplace'],
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.requiresApproval, true);
});

test('paid generation requires approval; reads do not', () => {
  const paid = authorizeTool('studio_generate_image', {
    surface: 'agent',
    role: 'user',
    scopes: ['generate'],
  });
  assert.equal(paid.ok, true);
  assert.equal(paid.requiresApproval, true);
  const read = authorizeTool('studio_health', {
    surface: 'agent',
    role: 'user',
    scopes: ['read'],
  });
  assert.equal(read.ok, true);
  assert.equal(read.requiresApproval, false);
});

test('buildStudioRequest fills path params', () => {
  const req = buildStudioRequest('studio_get_folder', { folderId: 'abc123' });
  assert.equal(req.method, 'GET');
  assert.match(req.path, /\/folders\/abc123/);
});

test('buildStudioRequest allows optional query templates', () => {
  const tree = buildStudioRequest('studio_workspace_tree', {});
  assert.equal(tree.method, 'GET');
  assert.equal(tree.path, '/workspace/tree');

  const folders = buildStudioRequest('studio_list_folders', { parentId: 'f1' });
  assert.equal(folders.method, 'GET');
  assert.equal(folders.path, '/folders?parentId=f1');
});

test('buildStudioRequest strips dynamic ?{params} and builds real query', () => {
  const search = buildStudioRequest('studio_search', {
    query: 'tree',
    kinds: ['asset'],
    limit: 20,
  });
  assert.equal(search.method, 'GET');
  assert.equal(search.path, '/workspace/search?query=tree&kinds=asset&limit=20');

  const resolve = buildStudioRequest('studio_resolve_path', { path: 'Ads/JAV' });
  assert.equal(resolve.method, 'GET');
  assert.equal(resolve.path, '/workspace/resolve-path?path=Ads%2FJAV');
});

test('mcp surface includes all tools', () => {
  assert.ok(mcpToolNames().length >= 200);
});
