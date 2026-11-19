// Upgrade scripts run once per connection, in order. Never reorder or remove an entry:
// Companion tracks progress by index. Replace an obsolete script with EmptyUpgradeScript instead.

/** v1.0.x: feedbacks used a module-defined 'invertFeedback' option instead of Companion's built-in invert */
function removeOldInvertFeedbackScripts(_context, props) {
	const updatedFeedbacks = []
	for (const feedback of props.feedbacks) {
		if (feedback.options['invertFeedback'] !== undefined) {
			feedback.isInverted = !!feedback.options['invertFeedback']
			delete feedback.options['invertFeedback']
			updatedFeedbacks.push(feedback)
		}
	}
	return { updatedConfig: null, updatedActions: [], updatedFeedbacks }
}

/** Feedback ids used by the removed Teams Classic (API 1.0.0) support, mapped to their API 2.0.0 equivalents */
export const V1_FEEDBACK_RENAMES = {
	inMeeting: 'isInMeeting',
	handRaised: 'isHandRaised',
	cameraOn: 'isVideoOn',
	backgroundBlurred: 'isBackgroundBlurred',
}

/** v1.4.0: Teams Classic (API 1.0.0) support removed; only API 2.0.0 remains */
function removeApiV1(_context, props) {
	let updatedConfig = null
	if (props.config && 'apiVersion' in props.config) {
		updatedConfig = { ...props.config }
		// A Teams Classic token is not valid for the new Teams, so clear it to trigger pairing
		if (updatedConfig.apiVersion === '1.0.0') updatedConfig.apiToken = ''
		delete updatedConfig.apiVersion
	}

	const updatedFeedbacks = []
	for (const feedback of props.feedbacks) {
		const newId = V1_FEEDBACK_RENAMES[feedback.feedbackId]
		if (newId) {
			feedback.feedbackId = newId
			updatedFeedbacks.push(feedback)
		}
	}

	return { updatedConfig, updatedActions: [], updatedFeedbacks }
}

/** Reaction ids that were stored as dropdown indexes before v1.4.0 */
export const LEGACY_REACTION_IDS = ['applause', 'laugh', 'like', 'love', 'wow']

/** v1.4.0: the reaction dropdown stores the Teams reaction name instead of an index */
function reactionsUseNames(_context, props) {
	const updatedActions = []
	for (const action of props.actions) {
		if (action.actionId !== 'reaction') continue
		const value = action.options.selectedReaction
		if (typeof value === 'number' || /^\d+$/.test(String(value))) {
			action.options.selectedReaction = LEGACY_REACTION_IDS[Number(value)] ?? LEGACY_REACTION_IDS[0]
			updatedActions.push(action)
		}
	}
	return { updatedConfig: null, updatedActions, updatedFeedbacks: [] }
}

/** v1.4.0: the API token moved from the config to Companion's secrets store */
function moveTokenToSecrets(_context, props) {
	if (!props.config || !('apiToken' in props.config)) {
		return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
	}

	const { apiToken, ...updatedConfig } = props.config
	const result = { updatedConfig, updatedActions: [], updatedFeedbacks: [] }
	if (apiToken) {
		result.updatedSecrets = { ...(props.secrets ?? {}), apiToken }
	}
	return result
}

/** Control method selection added; existing connections keep using the Teams API */
function addControlMethod(_context, props) {
	if (!props.config || props.config.controlMethod) {
		return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
	}
	return { updatedConfig: { ...props.config, controlMethod: 'teams-api' }, updatedActions: [], updatedFeedbacks: [] }
}

/** Windows UI Automation added; connections created before then have no poll interval saved */
function addPollInterval(_context, props) {
	if (!props.config || props.config.pollInterval) {
		return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
	}
	return { updatedConfig: { ...props.config, pollInterval: 500 }, updatedActions: [], updatedFeedbacks: [] }
}

export const upgradeScripts = [
	removeOldInvertFeedbackScripts,
	removeApiV1,
	reactionsUseNames,
	moveTokenToSecrets,
	addControlMethod,
	addPollInterval,
]
