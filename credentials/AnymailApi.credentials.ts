import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class AnymailApi implements ICredentialType {
	name = 'anymailApi';
	displayName = 'Anymail API';
	icon = { light: 'file:anymail.svg', dark: 'file:anymail-dark.svg' } as const;
	documentationUrl = 'https://developers.anymail.watch/n8n/';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'In anymail open Settings, Integrations, API keys and create a key with the read and write scopes. It starts with sgn_.',
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.anymail.watch/api/v1',
			description: 'Change only to point at a self-hosted or test instance.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/workspaces' },
	};
}
