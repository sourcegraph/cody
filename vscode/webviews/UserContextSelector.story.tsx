import { Meta, StoryObj } from '@storybook/react'
import { useArgs } from '@storybook/preview-api';

import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

import { UserContextSelectorComponent } from './UserContextSelector'

const meta: Meta<typeof UserContextSelectorComponent> = {
    title: 'cody/User Context Selector',
    component: UserContextSelectorComponent,
	args: {
		contextSelection: [],
		formInput: '@',
		selected: 0
	},
    decorators: [
		VSCodeStoryDecorator,
		(Story, context) => {
			const [{ formInput }, updateArgs] = useArgs()

			return (
				<div style={{ position: 'absolute', bottom: 100, left: 0, padding: 30 }}>
					{formInput ? <Story /> : null }
					<p>
						<input placeholder="Message" value={formInput} onChange={e => updateArgs({
							formInput: e.target.value
						})} />
					</p>
				</div>
			)
		},
	],
	argTypes: {
		onSelected: { action: 'selected' },
		setSelectedChatContext: { action: 'setSelectedChatContext' },
	},
}

export default meta

export const EmptySearchNoTabs: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [],
		formInput: '@',
		selected: 0
	}
}

export const EmptySearchTabs: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [
			{ fileName: 'open-file.py' },
			{ fileName: 'open-file.go' }
		],
		formInput: '@',
		selected: 0
	}
}

export const FileSearchNoMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [],
		formInput: '@filetsx',
		selected: 0
	}
}

export const FileSearchMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [
			{ fileName: 'open-file.py' },
			{ fileName: 'open-file.go' }
		],
		formInput: '@filetsx',
		selected: 0
	}
}

export const SymbolSearchEmpty: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [],
		formInput: '@#',
		selected: 0
	}
}

export const SymbolSearchNoMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [],
		formInput: '@#invalid',
		selected: 0
	}
}

export const SymbolSearchMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
		contextSelection: [
			{ fileName: 'LoginDialog', type: 'symbol', kind: 'class', path: { relative: 'lib/src/LoginDialog.tsx' } },
			{ fileName: 'login', type: 'symbol', kind: 'function', path: { relative: 'src/login.go' }, range: { start: { line: 42, character: 1 }, end: { line: 44, character: 1 } } },
			{ fileName: 'handleLogin', type: 'symbol', kind: 'method', path: { relative: 'lib/src/LoginDialog.tsx' } }
		],
		formInput: '@#login',
		selected: 0
	}
}
