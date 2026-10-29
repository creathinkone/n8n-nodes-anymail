import type {
	IDataObject,
	JsonObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

export async function api(
	ctx: Ctx,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	ignoreStatus = false,
): Promise<{ statusCode: number; body: IDataObject }> {
	const { baseUrl } = await ctx.getCredentials('anymailApi');
	const res = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'anymailApi', {
		method,
		url: `${String(baseUrl).replace(/\/$/, '')}${path}`,
		body,
		qs,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { 'User-Agent': 'n8n-nodes-anymail' },
	});
	if (res.statusCode >= 400 && !ignoreStatus) {
		const message = (res.body && res.body.error) || `HTTP ${res.statusCode}`;
		throw new NodeApiError(ctx.getNode(), (res.body || {}) as JsonObject, { message, httpCode: String(res.statusCode) });
	}
	return { statusCode: res.statusCode, body: res.body ?? {} };
}

// PATCH replaces the whole prospect, so fields left empty keep their current value.
export function mergeProspect(existing: IDataObject, input: IDataObject): IDataObject {
	const company = existing.company as IDataObject | undefined;
	return {
		email: input.email,
		first_name: input.first_name || existing.first_name || null,
		last_name: input.last_name || existing.last_name || null,
		timezone: input.timezone || existing.timezone || null,
		company_name: input.company_name || company?.name || null,
		custom_fields: { ...((existing.custom_fields as IDataObject) || {}), ...((input.custom_fields as IDataObject) || {}) },
	};
}

const campaignIdField = (resource: string, operations: string[], required: boolean) => ({
	displayName: 'Campaign',
	name: 'campaignId',
	type: 'options' as const,
	typeOptions: { loadOptionsMethod: 'getCampaigns' },
	default: '',
	required,
	description: 'Choose from the list, or use an expression with a campaign ID',
	displayOptions: { show: { resource: [resource], operation: operations } },
});

export class Anymail implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'anymail',
		name: 'anymail',
		icon: { light: 'file:anymail.svg', dark: 'file:anymail-dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Manage prospects, campaigns and suppressions in anymail',
		defaults: { name: 'anymail' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'anymailApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'prospect',
				options: [
					{ name: 'Campaign', value: 'campaign' },
					{ name: 'Prospect', value: 'prospect' },
					{ name: 'Suppression', value: 'suppression' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'upsert',
				displayOptions: { show: { resource: ['prospect'] } },
				options: [
					{ name: 'Create or Update', value: 'upsert', action: 'Create or update a prospect', description: 'Create a new record, or update the current one if it already exists (upsert)' },
					{ name: 'Get by Email', value: 'getByEmail', action: 'Get a prospect by email', description: 'Return the prospect with this email, or nothing' },
					{ name: 'Search', value: 'search', action: 'Search prospects', description: 'List prospects, optionally filtered by email' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'addProspect',
				displayOptions: { show: { resource: ['campaign'] } },
				options: [
					{ name: 'Add Prospect', value: 'addProspect', action: 'Add a prospect to a campaign', description: 'Enrol an existing prospect by email' },
					{ name: 'Pause', value: 'pause', action: 'Pause a campaign' },
					{ name: 'Resume', value: 'resume', action: 'Resume a campaign' },
					{ name: 'Start', value: 'start', action: 'Start a campaign', description: 'Start a draft campaign. This sends email.' },
					{ name: 'Stop', value: 'stop', action: 'Stop a campaign' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'add',
				displayOptions: { show: { resource: ['suppression'] } },
				options: [{ name: 'Add', value: 'add', action: 'Add to the suppression list', description: 'Never email an address or a whole domain' }],
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@example.com',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['prospect'], operation: ['upsert', 'getByEmail'] } },
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@example.com',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['campaign'], operation: ['addProspect'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['prospect'], operation: ['upsert'] } },
				options: [
					{ displayName: 'Company Name', name: 'company_name', type: 'string', default: '' },
					{ displayName: 'Custom Fields (JSON)', name: 'custom_fields', type: 'json', default: '{}', description: 'Snippet values, for example {"role": "CTO"}' },
					{ displayName: 'First Name', name: 'first_name', type: 'string', default: '' },
					{ displayName: 'Last Name', name: 'last_name', type: 'string', default: '' },
					{ displayName: 'Time Zone', name: 'timezone', type: 'string', default: '', placeholder: 'Europe/Warsaw', description: 'IANA name' },
				],
			},
			{ ...campaignIdField('prospect', ['upsert'], false), displayName: 'Add to Campaign', description: 'Optional. Enrol the prospect in this campaign. Choose from the list, or use an expression with a campaign ID' },
			{
				displayName: 'Email Filter',
				name: 'emailFilter',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['prospect'], operation: ['search'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { resource: ['prospect'], operation: ['search'] } },
			},
			campaignIdField('campaign', ['addProspect', 'start', 'pause', 'resume', 'stop'], true),
			{
				displayName: 'Email or Domain',
				name: 'target',
				type: 'string',
				placeholder: 'ada@example.com or example.com',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['suppression'], operation: ['add'] } },
			},
		],
	};

	methods = {
		loadOptions: {
			async getCampaigns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const { body } = await api(this, 'GET', '/campaigns', undefined, { limit: 100 });
				return ((body.data as IDataObject[]) || []).map((c) => ({ name: `${c.name} (${c.status})`, value: String(c.id) }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const out: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const findByEmail = async (email: string) =>
			((await api(this, 'GET', '/prospects', undefined, { email })).body.data as IDataObject[]) || [];

		for (let i = 0; i < this.getInputData().length; i++) {
			try {
				const push = (json: IDataObject | IDataObject[]) =>
					out.push(...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(json), { itemData: { item: i } }));

				if (resource === 'prospect' && operation === 'upsert') {
					const email = this.getNodeParameter('email', i) as string;
					const extra = this.getNodeParameter('additionalFields', i) as IDataObject;
					const campaignId = this.getNodeParameter('campaignId', i, '') as string;
					let customFields = extra.custom_fields;
					if (typeof customFields === 'string') {
						try {
							customFields = JSON.parse(customFields);
						} catch {
							throw new NodeOperationError(this.getNode(), 'Custom Fields must be valid JSON', { itemIndex: i });
						}
					}
					const input = { ...extra, custom_fields: customFields as IDataObject, email };
					const [existing] = await findByEmail(email);
					let id: string;
					if (existing) {
						id = String(existing.id);
						const full = (await api(this, 'GET', `/prospects/${id}`)).body;
						await api(this, 'PATCH', `/prospects/${id}`, mergeProspect(full, input));
						if (campaignId) await api(this, 'POST', `/campaigns/${campaignId}/prospects`, { prospect_ids: [id] });
					} else {
						const created = await api(this, 'POST', '/prospects', mergeProspect({}, input), campaignId ? { campaign: campaignId } : {});
						id = String(created.body.id);
					}
					const prospect = (await api(this, 'GET', `/prospects/${id}`)).body;
					push({ ...prospect, created: !existing });
				} else if (resource === 'prospect' && operation === 'getByEmail') {
					const [existing] = await findByEmail(this.getNodeParameter('email', i) as string);
					if (existing) push((await api(this, 'GET', `/prospects/${existing.id}`)).body);
				} else if (resource === 'prospect' && operation === 'search') {
					const email = this.getNodeParameter('emailFilter', i) as string;
					const qs: IDataObject = { limit: this.getNodeParameter('limit', i) as number };
					if (email) qs.email = email;
					push(((await api(this, 'GET', '/prospects', undefined, qs)).body.data as IDataObject[]) || []);
				} else if (resource === 'campaign' && operation === 'addProspect') {
					const campaignId = this.getNodeParameter('campaignId', i) as string;
					const email = this.getNodeParameter('email', i) as string;
					const rows = ((await api(this, 'POST', `/campaigns/${campaignId}/prospects`, { emails: [email] })).body.data as IDataObject[]) || [];
					const [row] = rows;
					if (!row || row.result === 'not-found') {
						throw new NodeOperationError(this.getNode(), `${email} is not a prospect in this workspace. Use Prospect, Create or Update first.`, { itemIndex: i });
					}
					push({ ...row, campaign_id: campaignId });
				} else if (resource === 'campaign') {
					const campaignId = this.getNodeParameter('campaignId', i) as string;
					push((await api(this, 'POST', `/campaigns/${campaignId}/${operation}`)).body);
				} else if (resource === 'suppression' && operation === 'add') {
					const target = this.getNodeParameter('target', i) as string;
					const res = await api(this, 'POST', '/suppressions', { target }, undefined, true);
					// 409 means already suppressed: the wanted end state, so the workflow must not fail.
					if (res.statusCode === 409) push({ id: null, kind: target.includes('@') ? 'email' : 'domain', value: target, already_suppressed: true });
					else if (res.statusCode >= 400) throw new NodeApiError(this.getNode(), res.body as JsonObject, { message: String(res.body.error || `HTTP ${res.statusCode}`), httpCode: String(res.statusCode) });
					else push(res.body);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}
		return [out];
	}
}
