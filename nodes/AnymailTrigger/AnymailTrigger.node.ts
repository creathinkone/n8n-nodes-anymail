import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { api } from '../Anymail/Anymail.node';

// Mirrors ZAPIER_HOOK_EVENTS in the anymail app (src/lib/webhooks/zapier-hook-events.ts).
// `positive_reply` is left out: `prospect_interested` covers it and also fires on a person's correction.
export const EVENTS: Array<[string, string, string]> = [
	['new_reply', 'New Reply', 'A prospect replies. Fires before the reply is classified'],
	['prospect_interested', 'Prospect Interested', 'A reply is classified as interested'],
	['prospect_maybe_later', 'Prospect Maybe Later', 'A reply is classified as neutral'],
	['prospect_not_interested', 'Prospect Not Interested', 'A reply is classified as not interested'],
	['prospect_autoreplied', 'Auto-Reply Received', 'A reply is recognised as an autoresponder'],
	['bounce', 'Email Bounced', 'A message to a prospect bounces'],
	['unsubscribe', 'Prospect Unsubscribed', 'A prospect uses the unsubscribe link'],
	['link_clicked', 'Link Clicked', 'A prospect clicks a tracked link'],
	['email_opened', 'Email Opened', 'A tracked message is opened. A weak signal: Apple Mail opens it without a person'],
	['prospect_added', 'New Prospect', 'A prospect is created in the app, by import or through the API'],
	['campaign_paused', 'Campaign Paused', 'A campaign is paused'],
	['campaign_completed', 'Campaign Completed', 'A campaign ends'],
];

export class AnymailTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'anymail Trigger',
		name: 'anymailTrigger',
		icon: { light: 'file:anymail.svg', dark: 'file:anymail-dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow when something happens in anymail',
		defaults: { name: 'anymail Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'anymailApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: 'new_reply',
				options: EVENTS.map(([value, name, description]) => ({ name, value, description })),
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.hookId) return false;
				const res = await api(this, 'GET', '/hooks', undefined, undefined, true);
				const hooks = (res.body.data as IDataObject[]) || [];
				return hooks.some((h) => h.id === data.hookId);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const res = await api(this, 'POST', '/hooks', {
					event: this.getNodeParameter('event') as string,
					target_url: this.getNodeWebhookUrl('default') as string,
				});
				data.hookId = res.body.id;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.hookId) {
					await api(this, 'DELETE', `/hooks/${data.hookId}`, undefined, undefined, true);
					delete data.hookId;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}
