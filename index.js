import { createRequire } from 'node:module'
import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import { upgradeScripts } from './upgrade.js'
import { getConfigFields } from './config.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getVariableDefinitions, getVariableValues } from './variables.js'
import { getPresetDefinitions } from './presets.js'
import { createInitialState, mergeState } from './state.js'
import { DEFAULT_CONTROL_METHOD, resolveControlMethod } from './control/index.js'

const { version: MODULE_VERSION } = createRequire(import.meta.url)('./package.json')

class TeamsInstance extends InstanceBase {
	state = createInitialState()
	secrets = {}
	/** The active control method, see control/index.js */
	control = null
	controlMethodId = null
	/** Identifies the active control method's callbacks */
	controlSession = null

	async init(config, _isFirstInit, secrets) {
		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setVariableDefinitions(getVariableDefinitions())
		this.setVariableValues(getVariableValues(this.state))
		this.setPresetDefinitions(getPresetDefinitions())

		await this.configUpdated(config, secrets)
	}

	async configUpdated(config, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.startControl()
	}

	async destroy() {
		this.stopControl()
	}

	getConfigFields() {
		return getConfigFields()
	}

	startControl() {
		this.stopControl()

		const id = this.config.controlMethod || DEFAULT_CONTROL_METHOD
		const resolved = resolveControlMethod(id)
		if (!resolved) {
			this.updateStatus(InstanceStatus.BadConfig, `Unknown control method: ${id}`)
			return
		}
		const { method, fallbackFrom } = resolved
		if (fallbackFrom) {
			this.log(
				'warn',
				`"${fallbackFrom.label}" does not work on this computer (${process.platform}); using "${method.label}" instead`,
			)
		}

		// State from a previous method or session no longer applies
		this.resetState()

		const session = {}
		this.controlSession = session
		this.controlMethodId = method.id
		this.control = method.create(this.createControlHost(session))
		this.control.start(this.config, this.secrets)
	}

	stopControl() {
		this.controlSession = null
		if (this.control) {
			this.control.stop()
			this.control = null
		}
	}

	/** Callbacks for a control method. Calls from a stopped or replaced method are ignored. */
	createControlHost(session) {
		const isCurrent = () => this.controlSession === session
		return {
			moduleVersion: MODULE_VERSION,
			log: (level, message) => this.log(level, message),
			setStatus: (status, message) => {
				if (isCurrent()) this.updateStatus(status, message)
			},
			setState: (partial) => {
				if (isCurrent()) this.applyState(partial)
			},
			saveSecrets: (secrets) => {
				if (!isCurrent()) return
				this.secrets = { ...this.secrets, ...secrets }
				this.saveConfig(undefined, this.secrets)
			},
		}
	}

	applyState(partial) {
		const changed = mergeState(this.state, partial)
		if (changed.length > 0) {
			this.setVariableValues(getVariableValues(this.state, changed))
			this.checkFeedbacks(...changed)
		}
	}

	resetState() {
		this.state = createInitialState()
		this.setVariableValues(getVariableValues(this.state))
		this.checkFeedbacks()
	}

	/** Called by action callbacks */
	runAction(actionId, options = {}) {
		if (!this.control) {
			this.log('warn', `Cannot run "${actionId}": no control method is active`)
			return
		}
		if (!this.control.supportsAction(actionId)) {
			this.log('warn', `"${actionId}" is not supported by the ${this.controlMethodId} control method`)
			return
		}
		this.control.runAction(actionId, options)
	}
}

runEntrypoint(TeamsInstance, upgradeScripts)
