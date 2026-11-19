/** Reactions supported by Teams. `id` is the value Teams expects in `send-reaction`. */
export const REACTIONS = [
	{ id: 'applause', label: 'Applause' },
	{ id: 'laugh', label: 'Laugh' },
	{ id: 'like', label: 'Like' },
	{ id: 'love', label: 'Heart' },
	{ id: 'wow', label: 'Wow' },
]

/** Actions without options. How each is carried out depends on the control method. */
const SIMPLE_ACTIONS = {
	toggleMute: {
		name: 'Toggle mute',
		description: 'Mute or unmute your microphone',
	},
	toggleVideo: {
		name: 'Toggle video',
		description: 'Turn your camera on or off',
	},
	toggleBackgroundBlur: {
		name: 'Toggle background blur',
		description: 'Turn background blur on or off',
	},
	toggleHand: {
		name: 'Toggle raise hand',
		description: 'Raise or lower your hand',
	},
	leaveMeeting: {
		name: 'Leave meeting',
		description: 'Leave the current meeting',
	},
	toggleChat: {
		name: 'Toggle chat pane',
		description: 'Open or close the meeting chat',
	},
	stopSharing: {
		name: 'Stop sharing',
		description: 'Stop sharing your screen or window. Does nothing when you are not sharing.',
	},
	toggleParticipants: {
		name: 'Toggle people pane',
		description: 'Open or close the list of people in the meeting (Windows UI Automation only)',
	},
}

export function getActionDefinitions(self) {
	const actions = {}

	for (const [actionId, def] of Object.entries(SIMPLE_ACTIONS)) {
		actions[actionId] = {
			name: def.name,
			description: def.description,
			options: [],
			callback: () => {
				self.runAction(actionId)
			},
		}
	}

	actions.reaction = {
		name: 'Reaction',
		description: 'Send a reaction in the current meeting',
		options: [
			{
				type: 'dropdown',
				label: 'Reaction',
				id: 'selectedReaction',
				default: REACTIONS[0].id,
				choices: REACTIONS,
			},
		],
		callback: (action) => {
			self.runAction('reaction', { selectedReaction: action.options.selectedReaction })
		},
	}

	return actions
}
