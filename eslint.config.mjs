import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({})

export default [
	...baseConfig,
	{
		// This package is ESM ("type": "module"); the shared config assumes CommonJS for .js files
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'module',
		},
	},
]
