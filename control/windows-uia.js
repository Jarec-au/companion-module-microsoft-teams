import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { InstanceStatus } from '@companion-module/base'
import { BOOTSTRAP, HELPER_SCRIPT, SCRIPT_END } from './windows-uia-script.js'
import { ENGLISH_LABELS, REACTION_BUTTONS, stateFromSnapshot } from './uia-state.js'

const RESTART_DELAY_MS = 5000
/** After pressing raise hand, how long to trust the press over the video tile, which takes up to a second to update */
const HAND_PRESS_GRACE_MS = 2000
const FATAL_RESTART_DELAY_MS = 60000
const STOP_TIMEOUT_MS = 2000
export const DEFAULT_POLL_MS = 500
export const MIN_POLL_MS = 200
export const MAX_POLL_MS = 5000

/** The configured poll interval, or the default when unset, kept within the allowed range */
export function pollIntervalFromConfig(config) {
	const value = Number(config?.pollInterval)
	if (!value) return DEFAULT_POLL_MS
	return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, value))
}

/** Module action ids mapped to the toolbar button they press; `menu` opens a menu that holds the button */
const BUTTON_ACTIONS = {
	toggleMute: { target: 'microphone-button' },
	toggleVideo: { target: 'video-button' },
	leaveMeeting: { target: 'hangup-button' },
	toggleChat: { target: 'chat-button' },
	toggleParticipants: { target: 'roster-button' },
	// The compact view has the raise hand button on its toolbar; the full window has it in the React menu
	toggleHand: { target: 'raisehands-button', menu: 'reaction-menu-button' },
}

/**
 * Control method: drive the Teams desktop app on this computer through Windows UI Automation.
 * A long-running powershell.exe helper (see windows-uia-script.js) watches the meeting toolbar and presses buttons.
 */
export class WindowsUiaControl {
	/** @type {import('node:child_process').ChildProcess | undefined} */
	child
	/** @type {NodeJS.Timeout | undefined} */
	restartTimer
	stopped = true
	requestId = 0
	/** Pending presses by request id, to report failures and update state on success */
	pending = new Map()
	/** Read from Teams (React button highlight, else your video tile) when possible; otherwise from our own presses */
	handRaised = false
	/** Time until which a raise hand press outranks the video tile */
	handPressedUntil = 0
	inMeeting = false
	/** Whether you are sharing, from the last snapshot */
	sharing = false
	/** Labels already reported as unrecognised, to log each once */
	reportedLabels = new Set()

	/**
	 * @param {import('./index.js').ControlHost} host
	 */
	constructor(host) {
		this.host = host
	}

	start(config) {
		this.config = config
		this.stopped = false

		if (process.platform !== 'win32') {
			this.host.setStatus(InstanceStatus.BadConfig, 'Windows UI Automation only works on Windows')
			return
		}
		this.spawnHelper()
	}

	stop() {
		this.stopped = true
		clearTimeout(this.restartTimer)
		this.restartTimer = undefined
		clearTimeout(this.handTimer)
		this.killHelper()
	}

	supportsAction(actionId) {
		return (
			actionId in BUTTON_ACTIONS ||
			actionId === 'reaction' ||
			actionId === 'toggleBackgroundBlur' ||
			actionId === 'stopSharing'
		)
	}

	runAction(actionId, options) {
		if (actionId === 'reaction') {
			const target = REACTION_BUTTONS[options.selectedReaction]
			if (!target) {
				this.host.log('warn', `Unknown reaction: ${options.selectedReaction}`)
				return false
			}
			return this.request(actionId, { cmd: 'press', target, menu: 'reaction-menu-button' })
		}
		if (actionId === 'toggleBackgroundBlur') return this.request(actionId, { cmd: 'blur' })
		if (actionId === 'stopSharing') {
			// While you share, the Share button stops sharing; otherwise it would open the share tray
			if (!this.sharing) {
				this.host.log('info', 'Stop sharing: you are not sharing')
				return false
			}
			return this.request(actionId, { cmd: 'press', target: 'share-button' })
		}
		const button = BUTTON_ACTIONS[actionId]
		if (!button) return false
		return this.request(actionId, { cmd: 'press', ...button })
	}

	/** Send a command that the helper answers with a "result" message */
	request(actionId, command) {
		if (!this.child?.stdin?.writable) {
			this.host.log('warn', `Cannot run "${actionId}": the UI Automation helper is not running`)
			return false
		}
		this.requestId += 1
		this.pending.set(this.requestId, actionId)
		this.sendCommand({ ...command, id: this.requestId })
		return true
	}

	sendCommand(command) {
		this.child?.stdin?.write(JSON.stringify(command) + '\n')
	}

	spawnHelper() {
		this.killHelper()
		this.host.setStatus(InstanceStatus.Connecting, 'Starting UI Automation helper')

		const encoded = Buffer.from(BOOTSTRAP, 'utf16le').toString('base64')
		let child
		try {
			child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
				windowsHide: true,
				stdio: ['pipe', 'pipe', 'pipe'],
			})
		} catch (err) {
			this.host.setStatus(InstanceStatus.UnknownError, `Could not start PowerShell: ${err.message}`)
			return
		}
		this.child = child
		this.fatal = false
		// Other statuses (starting, errors) are set directly, so report the next snapshot's status again
		this.lastStatusKey = null
		const stderr = []

		child.on('error', (err) => {
			if (child !== this.child) return
			this.host.setStatus(InstanceStatus.UnknownError, `Could not start PowerShell: ${err.message}`)
		})

		child.on('exit', (code) => {
			if (child !== this.child) return
			this.child = undefined
			this.pending.clear()
			this.host.setState({ isInMeeting: false })
			if (this.stopped) return

			const details = stderr.join('').trim()
			if (details) this.host.log('error', `UI Automation helper error: ${details}`)
			if (!this.fatal) {
				this.host.setStatus(InstanceStatus.UnknownError, `UI Automation helper stopped (exit code ${code})`)
			}
			this.restartTimer = setTimeout(() => this.spawnHelper(), this.fatal ? FATAL_RESTART_DELAY_MS : RESTART_DELAY_MS)
		})

		child.stderr.setEncoding('utf8')
		child.stderr.on('data', (chunk) => {
			// Keep only the latest output for the exit report
			stderr.push(chunk)
			if (stderr.length > 20) stderr.shift()
		})

		createInterface({ input: child.stdout }).on('line', (line) => {
			if (child === this.child) this.handleLine(line)
		})

		// Errors writing to a helper that has just exited are reported through 'exit'
		child.stdin.on('error', () => {})
		child.stdin.write(`${HELPER_SCRIPT}\n${SCRIPT_END}\n`)
		this.sendCommand({
			cmd: 'config',
			pollMs: pollIntervalFromConfig(this.config),
			selfTilePattern: ENGLISH_LABELS.selfTile.source,
		})
	}

	killHelper() {
		const child = this.child
		this.child = undefined
		this.pending.clear()
		if (!child) return

		child.removeAllListeners('exit')
		child.on('error', () => {})
		try {
			child.stdin.end(JSON.stringify({ cmd: 'exit' }) + '\n')
		} catch {
			// Already closed
		}
		const timer = setTimeout(() => child.kill(), STOP_TIMEOUT_MS)
		child.once('exit', () => clearTimeout(timer))
	}

	handleLine(line) {
		let msg
		try {
			msg = JSON.parse(line)
		} catch {
			this.host.log('debug', `UI Automation helper: ${line}`)
			return
		}

		switch (msg.type) {
			case 'ready':
				this.host.log('debug', 'UI Automation helper started')
				break
			case 'snapshot':
				this.handleSnapshot(msg)
				break
			case 'result':
				this.handleResult(msg)
				break
			case 'log':
				this.host.log(msg.level ?? 'debug', `UI Automation helper: ${msg.message}`)
				break
			case 'fatal':
				this.fatal = true
				this.host.setStatus(InstanceStatus.UnknownError, msg.message)
				this.host.log('error', msg.message)
				break
		}
	}

	handleSnapshot(snapshot) {
		// The video tile's name includes your display name; keep that out of the log
		const { self, ...loggable } = snapshot
		this.host.log('debug', `Teams toolbar: ${JSON.stringify(loggable)} video tile: ${self ? 'found' : 'not found'}`)
		const [status, message] = !snapshot.teams
			? [InstanceStatus.Disconnected, 'Teams is not running']
			: [InstanceStatus.Ok, snapshot.meeting ? null : 'Not in a meeting']
		const statusKey = `${status}:${message}`
		if (statusKey !== this.lastStatusKey) {
			this.lastStatusKey = statusKey
			this.host.setStatus(status, message)
		}

		const { state, unrecognised, handRaised } = stateFromSnapshot(snapshot)
		for (const label of unrecognised) {
			if (this.reportedLabels.has(label)) continue
			this.reportedLabels.add(label)
			this.host.log(
				'warn',
				`Unrecognised Teams button label "${label}". Mute and camera feedback need Teams in English.`,
			)
		}

		if (state.isInMeeting === false && this.inMeeting) this.handRaised = false
		this.inMeeting = state.isInMeeting
		if (typeof state.isSharing === 'boolean') this.sharing = state.isSharing
		this.tileHandRaised = handRaised
		const pressedRecently = Date.now() < this.handPressedUntil
		if (handRaised !== undefined && (!pressedRecently || handRaised === this.handRaised)) {
			this.handRaised = handRaised
		}
		state.isHandRaised = this.handRaised
		this.host.setState(state)
	}

	handleResult(msg) {
		const actionId = this.pending.get(msg.id)
		this.pending.delete(msg.id)
		if (!msg.ok) {
			this.host.log('warn', `Could not run "${actionId ?? msg.id}": ${msg.error}`)
			return
		}
		if (actionId === 'toggleHand') {
			// Show the change straight away; the video tile confirms it within a second
			this.handRaised = !this.handRaised
			this.handPressedUntil = Date.now() + HAND_PRESS_GRACE_MS
			this.host.setState({ isHandRaised: this.handRaised })
			// Snapshots only arrive on change, so check the tile once the grace period is over
			clearTimeout(this.handTimer)
			this.handTimer = setTimeout(() => {
				if (this.tileHandRaised === undefined || this.tileHandRaised === this.handRaised) return
				this.handRaised = this.tileHandRaised
				this.host.setState({ isHandRaised: this.handRaised })
			}, HAND_PRESS_GRACE_MS + 100)
		}
		if (actionId === 'toggleBackgroundBlur' && typeof msg.blurred === 'boolean') {
			this.host.setState({ isBackgroundBlurred: msg.blurred })
		}
	}
}
