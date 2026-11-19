/**
 * Meeting state reported by the control methods (see control/).
 *
 * Each field becomes a boolean feedback and a variable with the same id.
 * `source` is the object inside the Teams API's `meetingUpdate` that carries the field, or null when the
 * Teams API does not report it.
 */
export const STATE_FIELDS = [
	// meetingUpdate.meetingState
	{
		id: 'isMuted',
		source: 'meetingState',
		name: 'Microphone muted',
		description: 'True when your microphone is muted.',
	},
	{
		id: 'isVideoOn',
		source: 'meetingState',
		name: 'Camera on',
		description: 'True when your camera is on.',
	},
	{
		id: 'isHandRaised',
		source: 'meetingState',
		name: 'Hand raised',
		description: 'True when your hand is raised.',
	},
	{
		id: 'isInMeeting',
		source: 'meetingState',
		name: 'In meeting',
		description: 'True when you are in a meeting.',
	},
	{
		id: 'isRecordingOn',
		source: 'meetingState',
		name: 'Recording on',
		description: 'True when the meeting is being recorded.',
	},
	{
		id: 'isBackgroundBlurred',
		source: 'meetingState',
		name: 'Background blurred',
		description: 'True when background blur is on.',
	},
	{
		id: 'isSharing',
		source: 'meetingState',
		name: 'Sharing active',
		description: 'True when someone in the meeting is sharing.',
	},
	{
		id: 'hasUnreadMessages',
		source: 'meetingState',
		name: 'Unread messages',
		description: 'True when the meeting chat has unread messages.',
	},

	// meetingUpdate.meetingPermissions
	{
		id: 'canToggleMute',
		source: 'meetingPermissions',
		name: 'Can toggle mute',
		description: 'True when you can mute or unmute your microphone.',
	},
	{
		id: 'canToggleVideo',
		source: 'meetingPermissions',
		name: 'Can toggle video',
		description: 'True when you can turn your camera on or off.',
	},
	{
		id: 'canToggleHand',
		source: 'meetingPermissions',
		name: 'Can toggle hand',
		description: 'True when you can raise or lower your hand.',
	},
	{
		id: 'canToggleBlur',
		source: 'meetingPermissions',
		name: 'Can toggle blur',
		description: 'True when your camera is on and background blur can be toggled.',
	},
	{
		id: 'canLeave',
		source: 'meetingPermissions',
		name: 'Can leave',
		description: 'True when you can leave the meeting.',
	},
	{
		id: 'canReact',
		source: 'meetingPermissions',
		name: 'Can react',
		description: 'True when you can send reactions.',
	},
	{
		id: 'canToggleShareTray',
		source: 'meetingPermissions',
		name: 'Can toggle share tray',
		description: 'True when you can open the share tray.',
	},
	{
		id: 'canToggleChat',
		source: 'meetingPermissions',
		name: 'Can toggle chat',
		description: 'True when you can open the meeting chat.',
	},
	{
		id: 'canStopSharing',
		source: 'meetingPermissions',
		name: 'Can stop sharing',
		description: 'True when you are sharing and can stop sharing.',
	},
	{
		id: 'canPair',
		source: 'meetingPermissions',
		name: 'Can pair',
		description: 'True when a third-party device can be paired. Mainly useful on first connection.',
	},

	// Not reported by the Teams API
	{
		id: 'isChatOpen',
		source: null,
		name: 'Chat pane open',
		description: 'True when the meeting chat pane is open.',
	},
	{
		id: 'isParticipantsOpen',
		source: null,
		name: 'People pane open',
		description: 'True when the meeting people (participants) pane is open.',
	},
]

/** A state object with every field set to false */
export function createInitialState() {
	return Object.fromEntries(STATE_FIELDS.map((field) => [field.id, false]))
}

/**
 * Merge a partial state (as reported by a control method) into the state object.
 * Unknown ids are ignored; fields not in the update keep their previous value.
 * @returns {string[]} ids of the fields whose value changed
 */
export function mergeState(state, partial) {
	const changed = []
	for (const [id, value] of Object.entries(partial ?? {})) {
		if (!(id in state) || value === undefined || value === null) continue
		const next = Boolean(value)
		if (state[id] !== next) {
			state[id] = next
			changed.push(id)
		}
	}
	return changed
}
