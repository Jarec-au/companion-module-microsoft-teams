import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	ENGLISH_LABELS,
	REACTION_BUTTONS,
	UIA_FIELDS,
	handFromToolbarStyle,
	isHighlighted,
	matchLabel,
	plainToolbarStyle,
	stateFromSnapshot,
} from '../control/uia-state.js'
import { REACTIONS } from '../actions.js'
import { STATE_FIELDS } from '../state.js'
import { HELPER_SCRIPT, BOOTSTRAP, SCRIPT_END } from '../control/windows-uia-script.js'
import { DEFAULT_POLL_MS, pollIntervalFromConfig } from '../control/windows-uia.js'

const fullToolbar = {
	type: 'snapshot',
	teams: true,
	meeting: true,
	compact: false,
	menuOpen: false,
	buttons: {
		'microphone-button': { name: 'Unmute mic (Ctrl+Shift+M)', enabled: true },
		'video-button': { name: 'Turn camera on', enabled: true },
		'video-button-configure': { name: 'Video options', enabled: true, expanded: false },
		'reaction-menu-button': { name: 'React', enabled: true },
		'chat-button': { name: 'Chat', enabled: true, expanded: true },
		'roster-button': { name: 'People', enabled: true, expanded: false },
		'hangup-button': { name: 'Leave', enabled: true },
	},
}

test('English labels', () => {
	assert.equal(matchLabel('Unmute mic', ENGLISH_LABELS.microphone), true)
	assert.equal(matchLabel('Mute mic', ENGLISH_LABELS.microphone), false)
	assert.equal(matchLabel('Turn camera off', ENGLISH_LABELS.camera), true)
	assert.equal(matchLabel('Turn camera on', ENGLISH_LABELS.camera), false)
	assert.equal(matchLabel('Stummschaltung aufheben', ENGLISH_LABELS.microphone), undefined)
	assert.equal(matchLabel(undefined, ENGLISH_LABELS.microphone), undefined)
})

test('full meeting toolbar', () => {
	const { state, unrecognised } = stateFromSnapshot(fullToolbar)
	assert.deepEqual(unrecognised, [])
	assert.deepEqual(state, {
		isInMeeting: true,
		isMuted: true,
		isVideoOn: false,
		isChatOpen: true,
		isParticipantsOpen: false,
		canToggleMute: true,
		canToggleVideo: true,
		canToggleBlur: true,
		canToggleHand: true,
		canLeave: true,
		canReact: true,
		canToggleChat: true,
	})
})

test('compact view keeps the chat state', () => {
	const buttons = { ...fullToolbar.buttons }
	delete buttons['chat-button']
	delete buttons['reaction-menu-button']
	buttons['raisehands-button'] = { name: 'Raise', enabled: true }
	const { state } = stateFromSnapshot({ ...fullToolbar, compact: true, buttons })
	assert.equal('isChatOpen' in state, false)
	assert.equal(state.canToggleHand, true)
})

test('raised hand is read from your video tile', () => {
	const tile = (status) => ({
		...fullToolbar,
		self: `Myself video, Some Name, Muted, video is on, ${status}Has context menu`,
	})
	assert.equal(stateFromSnapshot(tile('Hand raised position 1, ')).handRaised, true)
	assert.equal(stateFromSnapshot(tile('')).handRaised, false)
	assert.equal(stateFromSnapshot({ ...fullToolbar, self: null }).handRaised, undefined)
	assert.equal(stateFromSnapshot(fullToolbar).handRaised, undefined)
})

test('raised hand is read from the React button highlight', () => {
	const styled = (reactStyle, extra = {}) => ({
		'reaction-menu-button': { name: 'React', enabled: true, expanded: false, style: reactStyle },
		'share-button': { name: 'Share', enabled: true, expanded: false, style: '___plain' },
		'chat-button': { name: 'Chat', enabled: true, expanded: false, style: '___plain' },
		'roster-button': { name: 'People', enabled: true, expanded: false, style: '___plain' },
		...extra,
	})
	assert.equal(handFromToolbarStyle(styled('___plain')), false)
	assert.equal(handFromToolbarStyle(styled('___highlight')), true)
	// An open chat pane restyles its button, which must not count as a raised hand
	const chatOpen = styled('___plain', { 'chat-button': { expanded: true, style: '___active' } })
	assert.equal(handFromToolbarStyle(chatOpen), false)
	// While the React menu is open its button is restyled, so it cannot be read
	const menuOpen = styled('___open', { 'reaction-menu-button': { expanded: true, style: '___open' } })
	assert.equal(handFromToolbarStyle(menuOpen), undefined)
	assert.equal(handFromToolbarStyle({ 'reaction-menu-button': { style: '___x' } }), undefined)
	// The toolbar wins over the video tile
	const snapshot = { ...fullToolbar, buttons: styled('___highlight'), self: 'Myself video, X, Muted' }
	assert.equal(stateFromSnapshot(snapshot).handRaised, true)
})

// Styles as seen live in the full meeting window while sharing (2026-11-19)
const sharingToolbar = {
	'callingButtons-showMoreBtn': { name: 'More', enabled: true, expanded: false, style: '___1lj7lvq' },
	'share-button': { name: 'Stop sharing', enabled: true, expanded: false, style: '___18vnxaw' },
	'chat-button': { name: 'Chat', enabled: true, expanded: false, style: '___1lj7lvq' },
	'roster-button': { name: 'People', enabled: true, expanded: false, style: '___1lj7lvq' },
	'reaction-menu-button': { name: 'React', enabled: true, expanded: false, style: '___1lj7lvq' },
	'hangup-button': { name: 'Leave', enabled: true, expanded: false, style: '___1t89j6p' },
}

test('sharing is read from the Share button highlight', () => {
	assert.equal(isHighlighted(sharingToolbar, 'share-button'), true)
	assert.equal(handFromToolbarStyle(sharingToolbar), false)
	const { state } = stateFromSnapshot({ ...fullToolbar, buttons: sharingToolbar })
	assert.equal(state.isSharing, true)
	assert.equal(state.canStopSharing, true)
	assert.equal(state.canToggleShareTray, true)
})

test('the More button is the plain style even when other buttons are highlighted or open', () => {
	const buttons = {
		...sharingToolbar,
		'reaction-menu-button': { name: 'React', enabled: true, expanded: false, style: '___hand' },
		'chat-button': { name: 'Chat', enabled: true, expanded: true, style: '___open' },
		'roster-button': { name: 'People', enabled: true, expanded: true, style: '___open' },
	}
	assert.equal(plainToolbarStyle(buttons), '___1lj7lvq')
	assert.equal(handFromToolbarStyle(buttons), true)
	assert.equal(isHighlighted(buttons, 'share-button'), true)
})

test('sharing falls back to the English label without style info', () => {
	const buttons = { ...fullToolbar.buttons, 'share-button': { name: 'Stop sharing', enabled: true } }
	assert.equal(stateFromSnapshot({ ...fullToolbar, buttons }).state.isSharing, true)
	buttons['share-button'] = { name: 'Share', enabled: true }
	assert.equal(stateFromSnapshot({ ...fullToolbar, buttons }).state.isSharing, false)
})

test('self tile pattern works as a PowerShell regex', () => {
	// Sent to the helper as source text; flags are added there
	assert.equal(ENGLISH_LABELS.selfTile.source, '^Myself video\\b')
})

test('blur is read while the video options menu is open', () => {
	const open = { teams: true, meeting: true, menuOpen: true, buttons: {} }
	assert.deepEqual(stateFromSnapshot({ ...open, blur: true }).state, { isInMeeting: true, isBackgroundBlurred: true })
	assert.deepEqual(stateFromSnapshot({ ...open, blur: false }).state, { isInMeeting: true, isBackgroundBlurred: false })
})

test('open menu keeps the last state', () => {
	assert.deepEqual(stateFromSnapshot({ teams: true, meeting: true, menuOpen: true, buttons: {} }).state, {
		isInMeeting: true,
	})
})

test('no meeting or no Teams clears every field', () => {
	for (const snapshot of [
		{ teams: true, meeting: false },
		{ teams: false, meeting: false },
	]) {
		const { state } = stateFromSnapshot(snapshot)
		assert.equal(Object.keys(state).length, UIA_FIELDS.length)
		assert.ok(Object.values(state).every((value) => value === false))
	}
})

test('unknown labels are reported, not guessed', () => {
	const buttons = { ...fullToolbar.buttons, 'microphone-button': { name: 'Micro', enabled: true } }
	const { state, unrecognised } = stateFromSnapshot({ ...fullToolbar, buttons })
	assert.equal('isMuted' in state, false)
	assert.deepEqual(unrecognised, ['Micro'])
})

test('every UIA field and reaction exists', () => {
	const ids = new Set(STATE_FIELDS.map((field) => field.id))
	for (const id of UIA_FIELDS) assert.ok(ids.has(id), id)
	for (const reaction of REACTIONS) assert.ok(REACTION_BUTTONS[reaction.id], reaction.id)
})

test('poll interval falls back to the default and stays in range', () => {
	assert.equal(pollIntervalFromConfig({}), DEFAULT_POLL_MS)
	assert.equal(pollIntervalFromConfig({ pollInterval: 0 }), DEFAULT_POLL_MS)
	assert.equal(pollIntervalFromConfig({ pollInterval: 50 }), 200)
	assert.equal(pollIntervalFromConfig({ pollInterval: 99999 }), 5000)
	assert.equal(pollIntervalFromConfig({ pollInterval: 750 }), 750)
})

test('helper script is safe to embed', () => {
	// The bootstrap stops reading at the end marker, so it must not appear inside the script
	assert.equal(HELPER_SCRIPT.split('\n').includes(SCRIPT_END), false)
	assert.ok(BOOTSTRAP.includes(`'${SCRIPT_END}'`))
})
