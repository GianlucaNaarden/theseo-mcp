import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index';

// The website handlers for these tools save the submitted URL/company and
// result as a CRM lead. The MCP contract must not tell clients they are reads.
// Calling tools/list exercises the deployed entry without invoking any tool.
for (const name of ['seo_scan', 'lokale_vindbaarheid_check']) test(`${name} does not advertise readOnlyHint while persisting a lead`, async () => {
  const response = await worker.fetch(new Request('https://theseo-mcp.sales-cc8.workers.dev/mcp', {
    method: 'POST',
    headers: {
      Host: 'theseo-mcp.sales-cc8.workers.dev',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  }), {} as never, { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext);
  assert.equal(response.status, 200);
  const body = await response.text();
  const frames = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter((line) => line.startsWith('data: ') && line.slice(6).trim()).map((line) => JSON.parse(line.slice(6)))
    : [JSON.parse(body)];
  const tools = frames.find((frame) => frame.id === 1).result.tools;
  const tool = tools.find((item: { name: string }) => item.name === name);
  assert.ok(tool, `${name} is missing`);
  assert.equal(tool.annotations.readOnlyHint, false, `${name} saves a lead and cannot promise read-only behavior`);
});
