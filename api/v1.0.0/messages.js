import { InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'

export function parseStatus(instance, data) {
	instance.inMeeting = data.meetingUpdate.meetingState.isInMeeting;
	instance.isMuted = data.meetingUpdate.meetingState.isMuted;
	instance.isCameraOn = data.meetingUpdate.meetingState.isCameraOn;
	instance.isHandRaised = data.meetingUpdate.meetingState.isHandRaised;
	instance.isBackgroundBlurred = data.meetingUpdate.meetingState.isBackgroundBlurred;
}

export function initWebSocketHandle(instance) {
	if (instance.reconnect_timer) {
		clearTimeout(instance.reconnect_timer)
		instance.reconnect_timer = null
	}

	if (!instance.config.targetIp) {
		instance.updateStatus(InstanceStatus.BadConfig, `No Target IP defined`)
		return
	}
	if (!instance.config.apiToken) {
		instance.updateStatus(InstanceStatus.BadConfig, `API token is missing`)
		return
	}

	const url = new URL(`ws://${instance.config.targetIp}:8124`)
	url.search = new URLSearchParams({
		token: instance.config.apiToken,
		'protocol-version': '1.0.0',
		manufacturer: 'MuteDeck',
		device: 'MuteDeck',
		app: 'MuteDeck',
		'app-version': '1.4',
	}).toString()

	instance.updateStatus(InstanceStatus.Connecting)

	instance.closeWebSocket()
	instance.ws = new WebSocket(url.toString())

	instance.ws.on('open', () => {
		instance.updateStatus(InstanceStatus.Ok);
		instance.ws.send(JSON.stringify({
			apiVersion: '1.0.0',
			service: 'query-meeting-state',
			action: 'query-meeting-state',
			manufacturer: 'Elgato',
			device: 'StreamDeck',
			timestamp: Date.now(),
		}));
	})
	instance.ws.on('close', (code) => {
		if (code == 1006) {
			instance.updateStatus(InstanceStatus.Disconnected, `Invalid API token or Teams not running`)
		}
		else {
			instance.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
		}
		instance.maybeReconnect()
	})

	instance.ws.on('message', (data) => {
		instance.messageReceivedFromWebSocket(data);
	})

	instance.ws.on('error', (err) => {
		if (/Unexpected server response: 403\b/.test(err?.message)) {
			instance.updateStatus(InstanceStatus.Disconnected, 'Invalid API token or Teams not running')
		}
		else {
			instance.log('error', `WebSocket error: ${err?.message ?? err}`)
		}
	})
}
