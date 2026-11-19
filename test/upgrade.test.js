import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upgradeScripts, V1_FEEDBACK_RENAMES } from '../upgrade.js'
import { STATE_FIELDS } from '../state.js'

const [, removeApiV1, reactionsUseNames, moveTokenToSecrets] = upgradeScripts
const context = { currentConfig: {} }

function feedback(feedbackId, options = {}) {
	return { id: 'f1', controlId: 'c1', feedbackId, options, isInverted: false }
}

function action(actionId, options = {}) {
	return { id: 'a1', controlId: 'c1', actionId, options }
}

test('v1 feedback renames point at existing feedbacks', () => {
	const ids = new Set(STATE_FIELDS.map((field) => field.id))
	for (const newId of Object.values(V1_FEEDBACK_RENAMES)) {
		assert.ok(ids.has(newId), `${newId} is not a known feedback`)
	}
})

test('removeApiV1 drops apiVersion and keeps a v2 token', () => {
	const res = removeApiV1(context, {
		config: { apiVersion: '2.0.0', apiToken: 'abc', targetIp: '127.0.0.1' },
		secrets: null,
		actions: [],
		feedbacks: [],
	})
	assert.deepEqual(res.updatedConfig, { apiToken: 'abc', targetIp: '127.0.0.1' })
})

test('removeApiV1 clears a Teams Classic token and renames v1 feedbacks', () => {
	const res = removeApiV1(context, {
		config: { apiVersion: '1.0.0', apiToken: 'classic' },
		secrets: null,
		actions: [],
		feedbacks: [feedback('cameraOn'), feedback('isMuted')],
	})
	assert.deepEqual(res.updatedConfig, { apiToken: '' })
	assert.equal(res.updatedFeedbacks.length, 1)
	assert.equal(res.updatedFeedbacks[0].feedbackId, 'isVideoOn')
})

test('removeApiV1 leaves configs without apiVersion alone', () => {
	const res = removeApiV1(context, { config: { targetIp: 'x' }, secrets: null, actions: [], feedbacks: [] })
	assert.equal(res.updatedConfig, null)
})

test('reactionsUseNames converts indexes and skips names', () => {
	const res = reactionsUseNames(context, {
		config: null,
		secrets: null,
		actions: [
			action('reaction', { selectedReaction: 3 }),
			action('reaction', { selectedReaction: 'wow' }),
			action('toggleMute'),
		],
		feedbacks: [],
	})
	assert.equal(res.updatedActions.length, 1)
	assert.equal(res.updatedActions[0].options.selectedReaction, 'love')
})

test('moveTokenToSecrets moves the token out of the config', () => {
	const res = moveTokenToSecrets(context, {
		config: { apiToken: 'abc', targetIp: '127.0.0.1' },
		secrets: null,
		actions: [],
		feedbacks: [],
	})
	assert.deepEqual(res.updatedConfig, { targetIp: '127.0.0.1' })
	assert.deepEqual(res.updatedSecrets, { apiToken: 'abc' })
})

test('moveTokenToSecrets does not write an empty token', () => {
	const res = moveTokenToSecrets(context, { config: { apiToken: '' }, secrets: null, actions: [], feedbacks: [] })
	assert.deepEqual(res.updatedConfig, {})
	assert.equal(res.updatedSecrets, undefined)
})
