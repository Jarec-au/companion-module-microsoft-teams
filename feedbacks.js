import { STATE_FIELDS } from './state.js'

/** One boolean feedback per meeting state field */
export function getFeedbackDefinitions(self) {
	const feedbacks = {}
	for (const field of STATE_FIELDS) {
		feedbacks[field.id] = {
			type: 'boolean',
			name: field.name,
			description: field.description,
			options: [],
			defaultStyle: {},
			callback: () => self.state[field.id] === true,
		}
	}
	return feedbacks
}
