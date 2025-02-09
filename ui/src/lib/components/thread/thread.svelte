<script lang="ts">
	import type { ThreadUpdateCallback } from '$lib/types'
	import { toolCallInfo, type InteractiveThread } from '@sourcegraph/cody-shared'
	import PromptEditor from '../prompt-editor/prompt-editor.svelte'
	import ThinkStep from './steps/think-step.svelte'
	import ToolCallStep from './steps/tool-call-step.svelte'

	let {
		thread,
		updateThread,
	}: {
		thread: Pick<InteractiveThread, 'steps' | 'toolInvocations' | 'userInput'>
		updateThread?: ThreadUpdateCallback
	} = $props()
</script>

<div class="space-y-4">
	{#each thread.steps as step}
		{#if step.type === 'human-message'}
			<PromptEditor value={step.content} compact />
		{:else if step.type === 'agent-message'}
			<p>{step.content}</p>
		{:else if step.type === 'think'}
			<ThinkStep {step} />
		{:else if step.type === 'tool'}
			<ToolCallStep {step} {...toolCallInfo(thread, step.id)} {updateThread} />
		{:else if step.type === 'agent-turn-done'}
			<span></span><!-- TODO!(sqs) -->
		{:else}
			<p>UNKNOWN STEP: {(step as any).type} <!-- TODO!(sqs) --></p>
		{/if}
	{/each}
</div>
