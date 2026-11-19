/**
 * Turns snapshots from the Windows UI Automation helper into module state.
 *
 * Teams exposes mute and camera state only through the button's label, which is in the Teams display language.
 * The chat and people buttons expose an expand/collapse state, which works in any language.
 */

/** Labels of Teams in English */
export const ENGLISH_LABELS = {
	// Each pair matches the start of a toolbar button's name
	microphone: { on: /^unmute\b/i, off: /^mute\b/i }, // on = muted
	camera: { on: /^turn camera off\b/i, off: /^turn camera on\b/i }, // on = camera on
	share: { on: /^stop sharing\b/i, off: /^share\b/i }, // on = you are sharing
	// Your own video tile, named like "Myself video, <name>, Muted, video is on, Hand raised position 1, …".
	// Passed to the helper as a PowerShell regex, so keep it to syntax both languages share.
	selfTile: /^Myself video\b/i,
	handRaised: /\bhand raised\b/i,
}

/** Reaction ids (see actions.js) mapped to the AutomationIds of the buttons in Teams' React menu */
export const REACTION_BUTTONS = {
	like: 'like-button',
	love: 'heart-button',
	applause: 'applause-button',
	laugh: 'laugh-button',
	wow: 'surprised-button',
}

/** State fields this control method sets; all other fields stay false */
export const UIA_FIELDS = [
	'isInMeeting',
	'isMuted',
	'isVideoOn',
	'isChatOpen',
	'isParticipantsOpen',
	'isSharing',
	'canStopSharing',
	'canToggleShareTray',
	'canToggleMute',
	'canToggleVideo',
	'canToggleBlur',
	'canToggleHand',
	'canLeave',
	'canReact',
	'canToggleChat',
]

/** Toolbar buttons that share one plain style unless Teams highlights them; More and Controls never highlight */
const STYLE_REFERENCE_BUTTONS = [
	'callingButtons-showMoreBtn',
	'organizer-control-button',
	'chat-button',
	'roster-button',
	'share-button',
	'reaction-menu-button',
	'raisehands-button',
]

/**
 * The generated style class of an unhighlighted toolbar button. Class names change between Teams builds, so this is
 * worked out each time: the More button's style, or else the style most of the toolbar buttons share.
 */
export function plainToolbarStyle(buttons) {
	const more = buttons['callingButtons-showMoreBtn']
	if (more?.style && more.expanded !== true) return more.style
	const counts = new Map()
	for (const id of STYLE_REFERENCE_BUTTONS) {
		const button = buttons[id]
		if (button?.style && button.expanded !== true) counts.set(button.style, (counts.get(button.style) ?? 0) + 1)
	}
	let best
	let bestCount = 1 // a style must be shared by at least two buttons to count as plain
	for (const [style, count] of counts) {
		if (count > bestCount) {
			best = style
			bestCount = count
		}
	}
	return best
}

/**
 * Whether Teams highlights a toolbar button, such as React while your hand is raised or Share while you share.
 * @returns {boolean | undefined} undefined when it cannot be told (no style info, or its menu is open, which
 *   restyles the button)
 */
export function isHighlighted(buttons, id) {
	const button = buttons[id]
	if (!button?.style || button.expanded === true) return undefined
	const plain = plainToolbarStyle(buttons)
	return plain === undefined ? undefined : button.style !== plain
}

/** Your raised hand, from the highlight on the React button (the raise hand button in the compact view) */
export function handFromToolbarStyle(buttons) {
	return isHighlighted(buttons, buttons['reaction-menu-button'] ? 'reaction-menu-button' : 'raisehands-button')
}

/** Match a label against an {on, off} pair; undefined when it matches neither */
export function matchLabel(name, pair) {
	if (typeof name !== 'string') return undefined
	if (pair.on.test(name)) return true
	if (pair.off.test(name)) return false
	return undefined
}

/**
 * @param {object} snapshot a "snapshot" message from the helper
 * @param {typeof ENGLISH_LABELS} labels
 * @returns {{ state: object, unrecognised: string[], handRaised?: boolean }} the partial state, labels that could
 *   not be read, and the raised hand as read from Teams (undefined when it cannot be read)
 */
export function stateFromSnapshot(snapshot, labels = ENGLISH_LABELS) {
	if (!snapshot?.teams || !snapshot.meeting) {
		return { state: Object.fromEntries(UIA_FIELDS.map((id) => [id, false])), unrecognised: [] }
	}

	// A menu opened in Teams hides the toolbar; keep the last known state until it closes. The video options menu
	// is the only place Teams shows the background effect, so take the blur state from it while it is open.
	if (snapshot.menuOpen) {
		const state = { isInMeeting: true }
		if (typeof snapshot.blur === 'boolean') state.isBackgroundBlurred = snapshot.blur
		return { state, unrecognised: [] }
	}

	// The toolbar highlight works in any language and with the camera off; the video tile needs English and a camera
	const handRaised =
		handFromToolbarStyle(snapshot.buttons ?? {}) ??
		(typeof snapshot.self === 'string' ? labels.handRaised.test(snapshot.self) : undefined)

	const buttons = snapshot.buttons ?? {}
	const mic = buttons['microphone-button']
	const camera = buttons['video-button']
	const chat = buttons['chat-button']
	const roster = buttons['roster-button']
	const react = buttons['reaction-menu-button'] ?? buttons['raisehands-button']

	const state = {
		isInMeeting: true,
		canToggleMute: mic?.enabled === true,
		canToggleVideo: camera?.enabled === true,
		// Background effects live in the video options menu, which the compact view does not have
		canToggleBlur: buttons['video-button-configure']?.enabled === true,
		canLeave: buttons['hangup-button']?.enabled === true,
		canReact: react?.enabled === true,
		canToggleHand: react?.enabled === true,
	}
	const unrecognised = []

	if (mic) {
		const muted = matchLabel(mic.name, labels.microphone)
		if (muted === undefined) unrecognised.push(mic.name)
		else state.isMuted = muted
	}
	if (camera) {
		const on = matchLabel(camera.name, labels.camera)
		if (on === undefined) unrecognised.push(camera.name)
		else state.isVideoOn = on
	}

	// The compact view has no chat button; leave the chat state as it was
	if (chat) {
		state.canToggleChat = chat.enabled === true
		if (typeof chat.expanded === 'boolean') state.isChatOpen = chat.expanded
	}
	if (roster && typeof roster.expanded === 'boolean') state.isParticipantsOpen = roster.expanded

	// Only your own sharing is visible on the toolbar; the highlight works in any language, the label is a fallback
	const share = buttons['share-button']
	if (share) {
		state.canToggleShareTray = share.enabled === true
		const sharing = isHighlighted(buttons, 'share-button') ?? matchLabel(share.name, labels.share)
		if (sharing !== undefined) {
			state.isSharing = sharing
			state.canStopSharing = sharing
		}
	}

	return { state, unrecognised, handRaised }
}
