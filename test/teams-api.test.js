import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TeamsApiControl, stateFromMeetingUpdate } from '../control/teams-api.js'
import {
	CONTROL_METHODS,
	DEFAULT_CONTROL_METHOD,
	getAvailableControlMethods,
	getControlMethod,
	resolveControlMethod,
} from '../control/index.js'

test('stateFromMeetingUpdate reads meetingState and meetingPermissions', () => {
	const partial = stateFromMeetingUpdate({
		meetingState: { isMuted: true, isInMeeting: true, somethingNew: true },
		meetingPermissions: { canLeave: false },
	})
	assert.deepEqual(partial, { isMuted: true, isInMeeting: true, canLeave: false })
})

test('stateFromMeetingUpdate tolerates missing sections', () => {
	assert.deepEqual(stateFromMeetingUpdate({}), {})
	assert.deepEqual(stateFromMeetingUpdate(undefined), {})
})

function fakeHost() {
	const calls = { log: [], status: [], state: [], secrets: [] }
	return {
		calls,
		moduleVersion: '0.0.0-test',
		log: (level, message) => calls.log.push([level, message]),
		setStatus: (status, message) => calls.status.push([status, message]),
		setState: (partial) => calls.state.push(partial),
		saveSecrets: (secrets) => calls.secrets.push(secrets),
	}
}

test('TeamsApiControl supports every existing action', () => {
	const control = new TeamsApiControl(fakeHost())
	for (const id of ['toggleMute', 'toggleVideo', 'toggleBackgroundBlur', 'toggleHand', 'leaveMeeting', 'reaction']) {
		assert.ok(control.supportsAction(id), id)
	}
	assert.equal(control.supportsAction('nope'), false)
})

test('TeamsApiControl does not send when disconnected', () => {
	const host = fakeHost()
	const control = new TeamsApiControl(host)
	assert.equal(control.runAction('toggleMute', {}), false)
	assert.equal(host.calls.log.at(-1)[0], 'warn')
})

test('TeamsApiControl handles token refresh and meeting updates', () => {
	const host = fakeHost()
	const control = new TeamsApiControl(host)
	control.secrets = {}
	control.handleMessage(JSON.stringify({ tokenRefresh: 'tok' }))
	control.handleMessage(JSON.stringify({ meetingUpdate: { meetingState: { isMuted: true } } }))
	control.handleMessage('not json')

	assert.deepEqual(host.calls.secrets, [{ apiToken: 'tok' }])
	assert.deepEqual(host.calls.state, [{ isMuted: true }])
})

test('only Windows offers Windows UI Automation', () => {
	const ids = (platform) => getAvailableControlMethods(platform).map((method) => method.id)
	assert.deepEqual(ids('win32'), ['teams-api', 'windows-uia'])
	assert.deepEqual(ids('darwin'), ['teams-api'])
	assert.deepEqual(ids('linux'), ['teams-api'])
})

test('an unavailable control method falls back to the Teams API', () => {
	assert.equal(resolveControlMethod('windows-uia', 'win32').method.id, 'windows-uia')
	assert.equal(resolveControlMethod('windows-uia', 'win32').fallbackFrom, undefined)
	const onMac = resolveControlMethod('windows-uia', 'darwin')
	assert.equal(onMac.method.id, 'teams-api')
	assert.equal(onMac.fallbackFrom.id, 'windows-uia')
	assert.equal(resolveControlMethod('teams-api', 'linux').method.id, 'teams-api')
	assert.equal(resolveControlMethod('', 'linux').method.id, DEFAULT_CONTROL_METHOD)
	assert.equal(resolveControlMethod('nope', 'win32'), null)
})

test('the default control method works everywhere', () => {
	assert.equal(getControlMethod(DEFAULT_CONTROL_METHOD).platforms, undefined)
})

test('control method registry', () => {
	assert.ok(getControlMethod(DEFAULT_CONTROL_METHOD))
	assert.equal(getControlMethod('missing'), null)
	const ids = CONTROL_METHODS.map((method) => method.id)
	assert.equal(new Set(ids).size, ids.length)
})
