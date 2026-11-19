import { Regex } from '@companion-module/base'

const HELP_URL =
	'https://support.microsoft.com/en-us/office/connect-to-third-party-devices-in-microsoft-teams-aabca9f2-47bb-407f-9f9b-81a104a883d6'

export function getConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: `In Teams, go to Settings → Privacy → Manage API and enable the API. Then join a meeting and press any button in Companion: Teams asks you to allow the device, and the token is saved automatically. <a href="${HELP_URL}" target="_blank">Microsoft guide</a>`,
		},
		{
			type: 'textinput',
			id: 'targetIp',
			label: 'Target IP address',
			tooltip: 'Use 127.0.0.1 when Teams runs on the same computer as Companion',
			default: '127.0.0.1',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'checkbox',
			id: 'reconnect',
			label: 'Reconnect',
			tooltip: 'Try to reconnect every 5 seconds when the connection drops',
			width: 4,
			default: true,
		},
		{
			type: 'secret-text',
			id: 'apiToken',
			label: 'API token',
			tooltip: 'Leave empty to pair with Teams; it is filled in automatically',
			width: 12,
		},
	]
}
