<script lang="ts">
	import type { TranscriptMessage } from '$lib/types'
	import PromptEditor from '../prompt-editor/prompt-editor.svelte'
	import CreateFileAction from './actions/create-file-action.svelte'
	import ReadFilesAction from './actions/read-files-action.svelte'
	import ReferencesAction from './actions/references-action.svelte'
	import TerminalCommandAction from './actions/terminal-command-action.svelte'
	import ThinkAction from './actions/think-action.svelte'

	let { messages }: { messages: TranscriptMessage[] } = $props()
</script>

<div class="space-y-4">
	{#each messages as message}
		{#if message.type === 'user'}
			<PromptEditor value={message.content} compact />
		{:else if message.type === 'agent'}
			{#each message.steps as step}
				{#if step.type === 'think'}
					<ThinkAction {step} />
				{:else if step.type === 'read-files'}
					<ReadFilesAction {step} />
				{:else if step.type === 'create-file'}
					<CreateFileAction {step} />
				{:else if step.type === 'terminal-command'}
					<TerminalCommandAction {step} />
				{:else if step.type === 'references'}
					<ReferencesAction {step} />
				{:else if step.type === 'message'}
					<p>{step.content}</p>
				{/if}
			{/each}
		{/if}
	{/each}
</div>
