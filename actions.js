/** Reactions supported by Teams. `id` is the value Teams expects in `send-reaction`. */
export const REACTIONS = [
	{ id: 'applause', label: 'Applause' },
	{ id: 'laugh', label: 'Laugh' },
	{ id: 'like', label: 'Like' },
	{ id: 'love', label: 'Heart' },
	{ id: 'wow', label: 'Wow' },
]

/** Actions that send a single Teams command with no parameters */
const SIMPLE_ACTIONS = {
	toggleMute: {
		name: 'Toggle mute',
		description: 'Mute or unmute your microphone',
		teamsAction: 'toggle-mute',
	},
	toggleVideo: {
		name: 'Toggle video',
		description: 'Turn your camera on or off',
		teamsAction: 'toggle-video',
	},
	toggleBackgroundBlur: {
		name: 'Toggle background blur',
		description: 'Turn background blur on or off',
		teamsAction: 'toggle-background-blur',
	},
	toggleHand: {
		name: 'Toggle raise hand',
		description: 'Raise or lower your hand',
		teamsAction: 'toggle-hand',
	},
	leaveMeeting: {
		name: 'Leave meeting',
		description: 'Leave the current meeting',
		teamsAction: 'leave-call',
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
				self.sendTeamsAction(def.teamsAction)
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
			self.sendTeamsAction('send-reaction', { type: action.options.selectedReaction })
		},
	}

	return actions
}
