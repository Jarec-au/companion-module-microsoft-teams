import { Regex } from '@companion-module/base'
import { DEFAULT_CONTROL_METHOD, getAvailableControlMethods } from './control/index.js'
import { DEFAULT_POLL_MS, MAX_POLL_MS, MIN_POLL_MS } from './control/windows-uia.js'

const HELP_URL =
	'https://support.microsoft.com/en-us/office/connect-to-third-party-devices-in-microsoft-teams-aabca9f2-47bb-407f-9f9b-81a104a883d6'

/** Show a config field only for the given control method */
const forMethod = (id) => `$(options:controlMethod) == '${id}'`

export function getConfigFields() {
	return [
		{
			type: 'dropdown',
			id: 'controlMethod',
			label: 'Control method',
			width: 12,
			default: DEFAULT_CONTROL_METHOD,
			// Only methods that work on the computer running Companion
			choices: getAvailableControlMethods().map((method) => ({ id: method.id, label: method.label })),
		},

		// Teams third-party API (legacy)
		{
			type: 'static-text',
			id: 'teamsApiInfo',
			width: 12,
			label: 'Teams third-party API',
			value: `Works with Teams on Windows and macOS, on this or another computer. <b>Microsoft retired this API on 30 June 2026</b>; some Teams versions still answer it, but it can stop working with any Teams update.<br>In Teams, go to Settings → Privacy → Manage API and enable the API. Then join a meeting and press any button in Companion: Teams asks you to allow the device, and the token is saved automatically. <a href="${HELP_URL}" target="_blank">Microsoft guide</a>`,
			isVisibleExpression: forMethod('teams-api'),
		},
		{
			type: 'textinput',
			id: 'targetIp',
			label: 'Target IP address',
			tooltip: 'Use 127.0.0.1 when Teams runs on the same computer as Companion',
			default: '127.0.0.1',
			width: 8,
			regex: Regex.IP,
			isVisibleExpression: forMethod('teams-api'),
		},
		{
			type: 'checkbox',
			id: 'reconnect',
			label: 'Reconnect',
			tooltip: 'Try to reconnect every 5 seconds when the connection drops',
			width: 4,
			default: true,
			isVisibleExpression: forMethod('teams-api'),
		},
		{
			type: 'secret-text',
			id: 'apiToken',
			label: 'API token',
			tooltip: 'Leave empty to pair with Teams; it is filled in automatically',
			width: 12,
			isVisibleExpression: forMethod('teams-api'),
		},

		// Windows UI Automation
		{
			type: 'static-text',
			id: 'windowsUiaInfo',
			width: 12,
			label: 'Windows UI Automation',
			value:
				'Presses the buttons on the Teams meeting toolbar, without bringing Teams to the front. It also works while the meeting window is covered or minimised.<br>Needs Teams (for work or school) on <b>this Windows computer</b>, signed in to the same Windows account that runs Companion. Mute and camera feedback need Teams in English.<br><b>Leave meeting ends the call straight away, without asking.</b>',
			isVisibleExpression: forMethod('windows-uia'),
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Check Teams every (ms)',
			tooltip: 'How often to read the meeting toolbar. Lower values update feedback faster but use more CPU.',
			default: DEFAULT_POLL_MS,
			min: MIN_POLL_MS,
			max: MAX_POLL_MS,
			width: 6,
			isVisibleExpression: forMethod('windows-uia'),
		},
	]
}
