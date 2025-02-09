<script lang="ts">
	import type { InteractiveThread } from '@sourcegraph/cody-shared'
	import PromptEditor from '../prompt-editor/prompt-editor.svelte'
	import CreateFileAction from './actions/create-file-action.svelte'
	import DefinitionAction from './actions/definition-action.svelte'
	import EditFileAction from './actions/edit-file-action.svelte'
	import ReadFilesAction from './actions/read-files-action.svelte'
	import ReferencesAction from './actions/references-action.svelte'
	import TerminalCommandAction from './actions/terminal-command-action.svelte'
	import ThinkAction from './actions/think-action.svelte'

	let { thread }: { thread: Pick<InteractiveThread, 'steps'> } = $props()
</script>

<div class="space-y-4">
	{#each thread.steps as step}
		{#if step.type === 'human-message'}
			<PromptEditor value={step.content} compact />
		{:else if step.type === 'agent-message'}
			<p>{step.content}</p>
		{:else if step.type === 'think'}
			<ThinkAction {step} />
		{:else if step.type === 'read-files'}
			<ReadFilesAction {step} />
		{:else if step.type === 'create-file'}
			<CreateFileAction {step} />
		{:else if step.type === 'edit-file'}
			<EditFileAction {step} />
		{:else if step.type === 'terminal-command'}
			<TerminalCommandAction {step} />
		{:else if step.type === 'definition'}
			<DefinitionAction {step} />
		{:else if step.type === 'references'}
			<ReferencesAction {step} />
		{/if}
	{/each}
</div>
