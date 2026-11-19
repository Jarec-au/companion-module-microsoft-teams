import { createRequire } from 'node:module'
import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import WebSocket from 'ws'
import { upgradeScripts } from './upgrade.js'
import { getConfigFields } from './config.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getVariableDefinitions, getVariableValues } from './variables.js'
import { getPresetDefinitions } from './presets.js'
import { applyMeetingUpdate, createInitialState } from './state.js'

const { version: MODULE_VERSION } = createRequire(import.meta.url)('./package.json')

/** Teams always listens for third-party devices on this port */
const TEAMS_PORT = 8124
const RECONNECT_DELAY_MS = 5000

class TeamsInstance extends InstanceBase {
	/** @type {WebSocket | undefined} */
	ws
	/** @type {NodeJS.Timeout | undefined} */
	reconnectTimer
	isDestroyed = false
	requestId = 0
	state = createInitialState()
	secrets = {}

	async init(config, _isFirstInit, secrets) {
		this.config = config
		this.secrets = secrets ?? {}

		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setVariableDefinitions(getVariableDefinitions())
		this.setVariableValues(getVariableValues(this.state))
		this.setPresetDefinitions(getPresetDefinitions())

		this.connect()
	}

	async configUpdated(config, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.connect()
	}

	async destroy() {
		this.isDestroyed = true
		this.disconnect()
	}

	getConfigFields() {
		return getConfigFields()
	}

	connect() {
		this.disconnect()

		if (!this.config.targetIp) {
			this.updateStatus(InstanceStatus.BadConfig, 'No target IP address')
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
			'app-version': MODULE_VERSION,
		}).toString()

		this.updateStatus(InstanceStatus.Connecting)

		const ws = new WebSocket(url)
		this.ws = ws

		ws.on('open', () => {
			this.updateStatus(InstanceStatus.Ok)
			// Teams replies with the current meeting state
			ws.send('')
		})

		ws.on('close', (code) => {
			this.updateStatus(
				InstanceStatus.Disconnected,
				code === 1006 ? 'Teams not running' : `Connection closed with code ${code}`,
			)
			this.scheduleReconnect()
		})

		ws.on('message', (data) => this.handleMessage(data.toString()))

		ws.on('error', (err) => {
			if (/Unexpected server response: 403\b/.test(err.message)) {
				this.updateStatus(InstanceStatus.AuthenticationFailure, 'Token rejected, or the Teams API is disabled')
			} else {
				this.log('error', `WebSocket error: ${err.message}`)
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
		if (this.isDestroyed || !this.config.reconnect) return
		clearTimeout(this.reconnectTimer)
		this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
	}

	handleMessage(raw) {
		let msg
		try {
			msg = JSON.parse(raw)
		} catch {
			this.log('debug', `Ignoring non-JSON message from Teams: ${raw}`)
			return
		}
		this.log('debug', `Received from Teams: ${raw}`)

		if (msg.tokenRefresh) {
			// Teams issued a token, either on first pairing or as a replacement. Save it for the next connection.
			this.secrets = { ...this.secrets, apiToken: msg.tokenRefresh }
			this.saveConfig(undefined, this.secrets)
			this.log('info', 'Paired with Teams, token saved')
		}

		if (msg.errorMsg) {
			this.log('warn', `Teams rejected request ${msg.requestId ?? ''}: ${msg.errorMsg}`)
		}

		if (msg.meetingUpdate) {
			const changed = applyMeetingUpdate(this.state, msg.meetingUpdate)
			if (changed.length > 0) {
				this.setVariableValues(getVariableValues(this.state, changed))
				this.checkFeedbacks(...changed)
			}
		}
	}

	/** Send a command to Teams. Returns false when not connected. */
	sendTeamsAction(action, parameters = {}) {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			this.log('warn', `Cannot send "${action}": not connected to Teams`)
			return false
		}
		this.requestId += 1
		this.ws.send(JSON.stringify({ action, parameters, requestId: this.requestId }))
		return true
	}
}

runEntrypoint(TeamsInstance, upgradeScripts)
