import { InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import { createRequire } from 'module'

const { version: moduleVersion } = createRequire(import.meta.url)('../../package.json')

export function parseStatus(instance, data) {
	if (data.meetingUpdate.meetingState != null) {
		instance.isMuted = data.meetingUpdate.meetingState.isMuted;
		instance.isVideoOn = data.meetingUpdate.meetingState.isVideoOn;
		instance.isHandRaised = data.meetingUpdate.meetingState.isHandRaised;
		instance.isInMeeting = data.meetingUpdate.meetingState.isInMeeting;
		instance.isRecordingOn = data.meetingUpdate.meetingState.isRecordingOn;
		instance.isBackgroundBlurred = data.meetingUpdate.meetingState.isBackgroundBlurred;
		instance.isSharing = data.meetingUpdate.meetingState.isSharing;
		instance.hasUnreadMessages = data.meetingUpdate.meetingState.hasUnreadMessages;
	}
	if (data.meetingUpdate.meetingPermissions != null) {
		instance.canToggleMute = data.meetingUpdate.meetingPermissions.canToggleMute;
		instance.canToggleVideo = data.meetingUpdate.meetingPermissions.canToggleVideo;
		instance.canToggleHand = data.meetingUpdate.meetingPermissions.canToggleHand;
		instance.canToggleBlur = data.meetingUpdate.meetingPermissions.canToggleBlur;
		instance.canLeave = data.meetingUpdate.meetingPermissions.canLeave;
		instance.canReact = data.meetingUpdate.meetingPermissions.canReact;
		instance.canToggleShareTray = data.meetingUpdate.meetingPermissions.canToggleShareTray;
		instance.canToggleChat = data.meetingUpdate.meetingPermissions.canToggleChat;
		instance.canStopSharing = data.meetingUpdate.meetingPermissions.canStopSharing;
		instance.canPair = data.meetingUpdate.meetingPermissions.canPair;
	}
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

	// v2 pairing: an empty token is valid and triggers the "allow device" prompt in Teams
	const url = new URL(`ws://${instance.config.targetIp}:8124`)
	url.search = new URLSearchParams({
		token: instance.config.apiToken || '',
		'protocol-version': '2.0.0',
		manufacturer: 'Bitfocus',
		device: 'Companion',
		app: 'Companion-Microsoft Teams',
		'app-version': moduleVersion,
	}).toString()

	instance.updateStatus(InstanceStatus.Connecting)

	instance.closeWebSocket()
	instance.ws = new WebSocket(url.toString())

	instance.ws.on('open', () => {
		instance.updateStatus(InstanceStatus.Ok);
		instance.ws.send('');
	})
	instance.ws.on('close', (code) => {
		if (code == 1006) {
			instance.updateStatus(InstanceStatus.Disconnected, `Teams not running`)
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
