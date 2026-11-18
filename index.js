import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import WebSocket from 'ws'
import { upgradeScripts } from './upgrade.js'
import { configFields } from './config.js'
import { getPresetDefinitions } from './presets.js'

class WebsocketInstance extends InstanceBase {
	isInitialized = false

	// Import the API modules for the selected Teams API version
	async loadApiVersionModules(apiVersion) {
		try {
			if (apiVersion === '1.0.0') {
				const actions = await import('./api/v1.0.0/actions.js');
				const feedbacks = await import('./api/v1.0.0/feedbacks.js');
				const messages = await import('./api/v1.0.0/messages.js');
				const { variables } = await import('./api/v1.0.0/variables.js');
				return {
					setupActions: actions.setupActions,
					setupFeedbacks: feedbacks.setupFeedbacks,
					parseStatus: messages.parseStatus,
					initWebSocketHandle: messages.initWebSocketHandle,
					variables: variables,
				};
			} else if (apiVersion === '2.0.0') {
				const actions = await import('./api/v2.0.0/actions.js');
				const feedbacks = await import('./api/v2.0.0/feedbacks.js');
				const messages = await import('./api/v2.0.0/messages.js');
				const { variables } = await import('./api/v2.0.0/variables.js');
				return {
					setupActions: actions.setupActions,
					setupFeedbacks: feedbacks.setupFeedbacks,
					parseStatus: messages.parseStatus,
					initWebSocketHandle: messages.initWebSocketHandle,
					variables: variables,
				};
			}
			throw new Error(`Unsupported API version: ${apiVersion}`);
		} catch (err) {
			this.log('error', `Error loading API version modules: ${err.message}`);
			throw err;
		}
	}

	async init(config) {
		this.isInitialized = true;
		await this.configUpdated(config);
	}

	async destroy() {
		this.isInitialized = false
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}
		this.closeWebSocket()
	}

	async configUpdated(config) {
		this.config = config
		try {
			this.apiModules = await this.loadApiVersionModules(this.config.apiVersion);
		} catch (err) {
			this.updateStatus(InstanceStatus.BadConfig, err.message)
			return
		}
		this.log('debug', `API loaded ${this.config.apiVersion}`);
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPresets()
		this.initWebSocket()
	}

	maybeReconnect() {
		if (this.isInitialized && this.config.reconnect) {
			if (this.reconnect_timer) {
				clearTimeout(this.reconnect_timer)
			}
			this.reconnect_timer = setTimeout(() => {
				this.initWebSocket()
			}, 5000)
		}
	}

	initWebSocket() {
		this.apiModules.initWebSocketHandle(this);
	}

	// Close the current socket without triggering the reconnect logic in its 'close' handler
	closeWebSocket() {
		if (this.ws) {
			this.ws.removeAllListeners()
			// Keep a no-op error listener so a late error on the dying socket can't crash the process
			this.ws.on('error', () => {})
			this.ws.terminate()
			delete this.ws
		}
	}

	// Send a message to Teams, if connected
	send(message) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('warn', 'Cannot send command: not connected to Teams')
			return false
		}
		this.ws.send(typeof message === 'string' ? message : JSON.stringify(message))
		return true
	}

	parseTeamsStatus(data) {
		this.apiModules.parseStatus(this, data);
		this.updateVariables();
		this.checkFeedbacks();
	}

	messageReceivedFromWebSocket(data) {
		let msgValue = null
		try {
			msgValue = JSON.parse(data);
			this.log('debug', `Received websock data:\n${JSON.stringify(msgValue)}`);
		} catch (e) {
			msgValue = data;
			this.log('debug', `Received websock data:\n${msgValue}`);
		}
		if (msgValue.tokenRefresh != null) {
			this.config.apiToken = msgValue.tokenRefresh;
			this.saveConfig(this.config)
			this.configUpdated(this.config).catch((err) => {
				this.log('error', `Failed to apply refreshed token: ${err.message}`)
			})
		}
		if (msgValue.meetingUpdate != null) {
			this.parseTeamsStatus(msgValue);
		}
	}

	getConfigFields() {
		return configFields;
	}

	initFeedbacks() {
		this.apiModules.setupFeedbacks(this);
	}

	initActions() {
		this.apiModules.setupActions(this);
	}

	initVariables() {
		this.setVariableDefinitions(this.apiModules.variables);
		const variableValues = {};
		this.apiModules.variables.forEach((variable) => {
			this[variable.variableId] = false;
			variableValues[variable.variableId] = false;
		});
		this.setVariableValues(variableValues);
	}

	updateVariables() {
		const variableValues = {};
		this.apiModules.variables.forEach((variable) => {
			variableValues[variable.variableId] = this[variable.variableId];
		});
		this.setVariableValues(variableValues);
	}

	initPresets() {
		// Presets reference v2 feedback IDs, so only offer them for v2
		if (this.config.apiVersion === '2.0.0') {
			this.setPresetDefinitions(getPresetDefinitions(this))
		} else {
			this.setPresetDefinitions({})
		}
	}
}

runEntrypoint(WebsocketInstance, upgradeScripts);
