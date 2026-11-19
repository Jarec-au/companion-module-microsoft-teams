import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATE_FIELDS, applyMeetingUpdate, createInitialState } from '../state.js'

test('initial state has every field set to false', () => {
	const state = createInitialState()
	assert.equal(Object.keys(state).length, STATE_FIELDS.length)
	assert.ok(Object.values(state).every((value) => value === false))
})

test('field ids are unique', () => {
	const ids = STATE_FIELDS.map((field) => field.id)
	assert.equal(new Set(ids).size, ids.length)
})

test('applies meetingState and meetingPermissions and reports changes', () => {
	const state = createInitialState()
	const changed = applyMeetingUpdate(state, {
		meetingState: { isMuted: true, isInMeeting: true, isVideoOn: false },
		meetingPermissions: { canLeave: true },
	})

	assert.equal(state.isMuted, true)
	assert.equal(state.isInMeeting, true)
	assert.equal(state.canLeave, true)
	assert.deepEqual(changed.sort(), ['canLeave', 'isInMeeting', 'isMuted'])
})

test('missing fields keep their previous value', () => {
	const state = createInitialState()
	applyMeetingUpdate(state, { meetingState: { isMuted: true } })
	const changed = applyMeetingUpdate(state, { meetingPermissions: { canReact: true } })

	assert.equal(state.isMuted, true)
	assert.deepEqual(changed, ['canReact'])
})

test('ignores updates without known sections', () => {
	const state = createInitialState()
	assert.deepEqual(applyMeetingUpdate(state, {}), [])
	assert.deepEqual(applyMeetingUpdate(state, undefined), [])
})
