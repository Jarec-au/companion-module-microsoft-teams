import { InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import { STATE_FIELDS } from '../state.js'

/** Teams always listens for third-party devices on this port */
const TEAMS_PORT = 8124
const RECONNECT_DELAY_MS = 5000

/** Module action ids mapped to Teams API actions that take no parameters */
const SIMPLE_ACTIONS = {
	toggleMute: 'toggle-mute',
	toggleVideo: 'toggle-video',
	toggleBackgroundBlur: 'toggle-background-blur',
	toggleHand: 'toggle-hand',
	leaveMeeting: 'leave-call',
	stopSharing: 'stop-sharing',
}

/** Convert a Teams `meetingUpdate` message into a partial state object */
export function stateFromMeetingUpdate(meetingUpdate) {
	const partial = {}
	for (const field of STATE_FIELDS) {
		if (!field.source) continue
		const value = meetingUpdate?.[field.source]?.[field.id]
		if (value !== undefined && value !== null) partial[field.id] = value
	}
	return partial
}

/**
 * Control method: the Teams third-party device WebSocket API (protocol 2.0.0).
 * Retired by Microsoft on 30 June 2026 (MC1266901), but still answered by some Teams builds.
 */
export class TeamsApiControl {
	/** @type {WebSocket | undefined} */
	ws
	/** @type {NodeJS.Timeout | undefined} */
	reconnectTimer
	stopped = true
	requestId = 0

	/**
	 * @param {import('./index.js').ControlHost} host
	 */
	constructor(host) {
		this.host = host
	}

	start(config, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.stopped = false
		this.connect()
	}

	stop() {
		this.stopped = true
		this.disconnect()
	}

	supportsAction(actionId) {
		return actionId in SIMPLE_ACTIONS || actionId === 'reaction' || actionId === 'toggleChat'
	}

	runAction(actionId, options) {
		if (actionId === 'reaction') return this.send('send-reaction', { type: options.selectedReaction })
		if (actionId === 'toggleChat') return this.send('toggle-ui', { type: 'chat' })
		const teamsAction = SIMPLE_ACTIONS[actionId]
		if (!teamsAction) return false
		return this.send(teamsAction)
	}

	connect() {
		this.disconnect()

		if (!this.config.targetIp) {
			this.host.setStatus(InstanceStatus.BadConfig, 'No target IP address')
			return
		}

		const url = new URL(`ws://${this.config.targetIp}:${TEAMS_PORT}`)
		url.search = new URLSearchParams({
			// An empty token is valid: Teams then asks the user to allow the device
			token: this.secrets.apiToken ?? '',
			'protocol-version': '2.0.0',
			manufacturer: 'Bitfocus',
			device: 'Companion',
			app: 'Companion-Microsoft Teams',
			'app-version': this.host.moduleVersion,
		}).toString()

		this.host.setStatus(InstanceStatus.Connecting)

		const ws = new WebSocket(url)
		this.ws = ws

		ws.on('open', () => {
			this.host.setStatus(InstanceStatus.Ok)
			// Teams replies with the current meeting state
			ws.send('')
		})

		ws.on('close', (code) => {
			this.host.setStatus(
				InstanceStatus.Disconnected,
				code === 1006 ? 'Teams not running' : `Connection closed with code ${code}`,
			)
			this.scheduleReconnect()
		})

		ws.on('message', (data) => this.handleMessage(data.toString()))

		ws.on('error', (err) => {
			if (/Unexpected server response: 403\b/.test(err.message)) {
				this.host.setStatus(InstanceStatus.AuthenticationFailure, 'Token rejected, or the Teams API is disabled')
			} else {
				this.host.log('error', `WebSocket error: ${err.message}`)
			}
		})
	}

	/** Close the socket without triggering a reconnect */
	disconnect() {
		clearTimeout(this.reconnectTimer)
		this.reconnectTimer = undefined

		if (this.ws) {
			this.ws.removeAllListeners()
			// A late error from the closing socket must not crash the process
			this.ws.on('error', () => {})
			this.ws.terminate()
			this.ws = undefined
		}
	}

	scheduleReconnect() {
		if (this.stopped || !this.config.reconnect) return
		clearTimeout(this.reconnectTimer)
		this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
	}

	handleMessage(raw) {
		let msg
		try {
			msg = JSON.parse(raw)
		} catch {
			this.host.log('debug', `Ignoring non-JSON message from Teams: ${raw}`)
			return
		}
		this.host.log('debug', `Received from Teams: ${raw}`)

		if (msg.tokenRefresh) {
			// Teams issued a token, either on first pairing or as a replacement. Save it for the next connection.
			this.secrets = { ...this.secrets, apiToken: msg.tokenRefresh }
			this.host.saveSecrets(this.secrets)
			this.host.log('info', 'Paired with Teams, token saved')
		}

		if (msg.errorMsg) {
			this.host.log('warn', `Teams rejected request ${msg.requestId ?? ''}: ${msg.errorMsg}`)
		}

		if (msg.meetingUpdate) {
			this.host.setState(stateFromMeetingUpdate(msg.meetingUpdate))
		}
	}

	/** Send a command to Teams. Returns false when not connected. */
	send(action, parameters = {}) {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			this.host.log('warn', `Cannot send "${action}": not connected to Teams`)
			return false
		}
		this.requestId += 1
		this.ws.send(JSON.stringify({ action, parameters, requestId: this.requestId }))
		return true
	}
}
