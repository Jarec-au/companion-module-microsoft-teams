import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATE_FIELDS, createInitialState, mergeState } from '../state.js'

test('initial state has every field set to false', () => {
	const state = createInitialState()
	assert.equal(Object.keys(state).length, STATE_FIELDS.length)
	assert.ok(Object.values(state).every((value) => value === false))
})

test('field ids are unique', () => {
	const ids = STATE_FIELDS.map((field) => field.id)
	assert.equal(new Set(ids).size, ids.length)
})

test('mergeState applies values and reports changes', () => {
	const state = createInitialState()
	const changed = mergeState(state, { isMuted: true, isInMeeting: 1, isVideoOn: false })

	assert.equal(state.isMuted, true)
	assert.equal(state.isInMeeting, true)
	assert.deepEqual(changed.sort(), ['isInMeeting', 'isMuted'])
})

test('mergeState ignores unknown ids and null values', () => {
	const state = createInitialState()
	mergeState(state, { isMuted: true })
	const changed = mergeState(state, { isMuted: null, notAField: true, canReact: true })

	assert.equal(state.isMuted, true)
	assert.equal('notAField' in state, false)
	assert.deepEqual(changed, ['canReact'])
})

test('mergeState handles empty input', () => {
	const state = createInitialState()
	assert.deepEqual(mergeState(state, {}), [])
	assert.deepEqual(mergeState(state, undefined), [])
})
