import { STATE_FIELDS } from './state.js'

/** One variable per meeting state field */
export function getVariableDefinitions() {
	return STATE_FIELDS.map((field) => ({ variableId: field.id, name: field.name }))
}

/** Current variable values, taken from the state object */
export function getVariableValues(state, ids = STATE_FIELDS.map((field) => field.id)) {
	return Object.fromEntries(ids.map((id) => [id, state[id]]))
}
