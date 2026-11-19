import { TeamsApiControl } from './teams-api.js'
import { WindowsUiaControl } from './windows-uia.js'

/**
 * What a control method may call back into the module instance.
 * @typedef {object} ControlHost
 * @property {(level: 'debug' | 'info' | 'warn' | 'error', message: string) => void} log
 * @property {(status: string, message?: string) => void} setStatus  An InstanceStatus value
 * @property {(partial: Record<string, boolean>) => void} setState  Report changed state fields (ids from state.js)
 * @property {(secrets: Record<string, string>) => void} saveSecrets
 * @property {string} moduleVersion
 */

/**
 * A control method: one way of driving Teams. Each implements:
 *   start(config, secrets), stop(), supportsAction(actionId), runAction(actionId, options) -> boolean
 */
export const CONTROL_METHODS = [
	{
		id: 'teams-api',
		label: 'Teams third-party API (legacy)',
		create: (host) => new TeamsApiControl(host),
	},
	{
		id: 'windows-uia',
		label: 'Windows UI Automation (Teams on this computer)',
		platforms: ['win32'],
		create: (host) => new WindowsUiaControl(host),
	},
]

/** Works on every platform, so it is also the fallback for methods that do not */
export const DEFAULT_CONTROL_METHOD = 'teams-api'

export function getControlMethod(id) {
	return CONTROL_METHODS.find((method) => method.id === id) ?? null
}

/** Control methods that work on the computer running Companion (`platforms` absent means all) */
export function getAvailableControlMethods(platform = process.platform) {
	return CONTROL_METHODS.filter((method) => !method.platforms || method.platforms.includes(platform))
}

/**
 * The control method to run for a configured id. A method that does not work on this platform (such as a config
 * made on Windows, then moved to a Mac) falls back to the default.
 * @returns {{ method: object, fallbackFrom?: object } | null} null when the id is unknown
 */
export function resolveControlMethod(id, platform = process.platform) {
	const method = getControlMethod(id || DEFAULT_CONTROL_METHOD)
	if (!method) return null
	if (getAvailableControlMethods(platform).includes(method)) return { method }
	return { method: getControlMethod(DEFAULT_CONTROL_METHOD), fallbackFrom: method }
}
