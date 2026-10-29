const test = require('node:test');
const assert = require('node:assert');
const { Anymail, mergeProspect } = require('../dist/nodes/Anymail/Anymail.node');
const { AnymailTrigger, EVENTS } = require('../dist/nodes/AnymailTrigger/AnymailTrigger.node');
const { AnymailApi } = require('../dist/credentials/AnymailApi.credentials');

// A fake n8n context over a scripted API: routes "METHOD /path" to a handler.
const ctx = (params, routes, calls = []) => ({
	getInputData: () => [{ json: {} }],
	getNodeParameter: (n, i, d) => (n in params ? params[n] : d),
	getCredentials: async () => ({ apiKey: 'sgn_x', baseUrl: 'https://api.test/v1' }),
	getNode: () => ({ name: 'anymail' }),
	continueOnFail: () => false,
	getWorkflowStaticData: () => ctx.static,
	getNodeWebhookUrl: () => 'https://n8n.test/webhook/abc',
	helpers: {
		httpRequestWithAuthentication: async (_c, o) => {
			const key = `${o.method} ${o.url.replace('https://api.test/v1', '')}`;
			calls.push({ key, body: o.body, qs: o.qs });
			const h = routes[key];
			assert.ok(h, `unrouted ${key}`);
			const [statusCode, body] = h(o);
			return { statusCode, body };
		},
		returnJsonArray: (j) => (Array.isArray(j) ? j : [j]).map((json) => ({ json })),
		constructExecutionMetaData: (d) => d,
	},
});
ctx.static = {};

test('package wiring', () => {
	const pkg = require('../package.json');
	assert.deepEqual(pkg.dependencies ?? {}, {});
	assert.equal(new AnymailApi().test.request.url, '/workspaces');
	assert.equal(new Anymail().description.properties[0].options.length, 3);
	assert.equal(EVENTS.length, 12);
});

test('upsert creates a new prospect in a campaign', async () => {
	const calls = [];
	const routes = {
		'GET /prospects': () => [200, { data: [] }],
		'POST /prospects': () => [201, { id: 'p1' }],
		'GET /prospects/p1': () => [200, { id: 'p1', email: 'a@x.com', first_name: 'Ada' }],
	};
	const [[item]] = await new Anymail().execute.call(
		ctx({ resource: 'prospect', operation: 'upsert', email: 'a@x.com', additionalFields: { first_name: 'Ada' }, campaignId: 'c1' }, routes, calls),
	);
	assert.equal(item.json.created, true);
	const post = calls.find((c) => c.key === 'POST /prospects');
	assert.deepEqual(post.qs, { campaign: 'c1' });
	assert.equal(post.body.first_name, 'Ada');
});

test('upsert keeps fields the node left empty', async () => {
	const calls = [];
	const full = { id: 'p1', email: 'a@x.com', first_name: 'Ada', last_name: 'L', company: { name: 'Acme' }, custom_fields: { role: 'CTO' } };
	const routes = {
		'GET /prospects': () => [200, { data: [{ id: 'p1' }] }],
		'GET /prospects/p1': () => [200, full],
		'PATCH /prospects/p1': () => [200, {}],
	};
	const [[item]] = await new Anymail().execute.call(
		ctx({ resource: 'prospect', operation: 'upsert', email: 'a@x.com', additionalFields: { timezone: 'Europe/Warsaw', custom_fields: '{"x":"1"}' }, campaignId: '' }, routes, calls),
	);
	assert.equal(item.json.created, false);
	const patch = calls.find((c) => c.key === 'PATCH /prospects/p1').body;
	assert.equal(patch.first_name, 'Ada');
	assert.equal(patch.company_name, 'Acme');
	assert.deepEqual(patch.custom_fields, { role: 'CTO', x: '1' });
	assert.equal(mergeProspect({}, { email: 'e' }).first_name, null);
});

test('add prospect to campaign reports not-found as an error', async () => {
	const routes = { 'POST /campaigns/c1/prospects': () => [200, { data: [{ email: 'a@x.com', result: 'not-found' }] }] };
	await assert.rejects(
		new Anymail().execute.call(ctx({ resource: 'campaign', operation: 'addProspect', campaignId: 'c1', email: 'a@x.com' }, routes)),
		/not a prospect/,
	);
});

test('campaign start posts to the right path; API errors surface the message', async () => {
	const ok = await new Anymail().execute.call(
		ctx({ resource: 'campaign', operation: 'start', campaignId: 'c1' }, { 'POST /campaigns/c1/start': () => [200, { status: 'active' }] }),
	);
	assert.equal(ok[0][0].json.status, 'active');
	await assert.rejects(
		new Anymail().execute.call(ctx({ resource: 'campaign', operation: 'stop', campaignId: 'c1' }, { 'POST /campaigns/c1/stop': () => [409, { error: 'not running' }] })),
		/not running/,
	);
});

test('suppression 409 is success', async () => {
	const [[item]] = await new Anymail().execute.call(
		ctx({ resource: 'suppression', operation: 'add', target: 'x.com' }, { 'POST /suppressions': () => [409, { error: 'dup' }] }),
	);
	assert.deepEqual(item.json, { id: null, kind: 'domain', value: 'x.com', already_suppressed: true });
});

test('trigger subscribes with the webhook URL and unsubscribes', async () => {
	const calls = [];
	const routes = {
		'POST /hooks': () => [201, { id: 'h1' }],
		'GET /hooks': () => [200, { data: [{ id: 'h1' }] }],
		'DELETE /hooks/h1': () => [204, {}],
	};
	const t = new AnymailTrigger().webhookMethods.default;
	const c = ctx({ event: 'bounce' }, routes, calls);
	assert.equal(await t.checkExists.call(c), false);
	await t.create.call(c);
	assert.deepEqual(calls[0].body, { event: 'bounce', target_url: 'https://n8n.test/webhook/abc' });
	assert.equal(await t.checkExists.call(c), true);
	await t.delete.call(c);
	assert.equal(ctx.static.hookId, undefined);
});
