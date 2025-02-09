<script lang="ts" module>
	export type ToolCallStepProps<ToolDef extends ToolDefinition = ToolDefinition> = {
		step: Extract<ThreadStep, { type: 'tool' }>
		toolInvocation: ToolInvocation<ToolDef>
		userInput: ThreadStepUserInput | undefined
		updateThread?: ThreadUpdateCallback
	}
</script>

<script lang="ts">
	import type { ThreadUpdateCallback } from '$lib/types'
	import type {
		BuiltinTools,
		ThreadStep,
		ThreadStepUserInput,
		ToolDefinition,
		ToolInvocation,
	} from '@sourcegraph/cody-shared'
	import CreateFileToolCallStep from '../tool-calls/create-file-tool-call-step.svelte'
	import DefinitionToolCallStep from '../tool-calls/definition-tool-call-step.svelte'
	import EditFileToolCallStep from '../tool-calls/edit-file-tool-call-step.svelte'
	import ReadFilesToolCallStep from '../tool-calls/read-files-tool-call-step.svelte'
	import ReferencesToolCallStep from '../tool-calls/references-tool-call-step.svelte'
	import TerminalCommandToolCallStep from '../tool-calls/terminal-command-tool-call-step.svelte'

	let {
		toolInvocation,
		...props
	}: Omit<ToolCallStepProps, 'toolInvocation'> &
		Partial<Pick<ToolCallStepProps, 'toolInvocation'>> = $props()
</script>

{#if toolInvocation}
	{#if props.step.tool === 'read-files'}
		<ReadFilesToolCallStep
			{...props}
			toolInvocation={toolInvocation as ToolInvocation<BuiltinTools[typeof props.step.tool]>}
		/>
	{:else if props.step.tool === 'create-file'}
		<CreateFileToolCallStep
			{...props}
			toolInvocation={toolInvocation as ToolInvocation<BuiltinTools[typeof props.step.tool]>}
		/>
	{:else if props.step.tool === 'edit-file'}
		<EditFileToolCallStep
			{...props}
			toolInvocation={toolInvocation as ToolInvocation<BuiltinTools[typeof props.step.tool]>}
		/>
	{:else if props.step.tool === 'terminal-command'}
		<TerminalCommandToolCallStep
			{...props}
			toolInvocation={toolInvocation as ToolInvocation<BuiltinTools[typeof props.step.tool]>}
		/>
	{:else if props.step.tool === 'definition'}
		<DefinitionToolCallStep
			{...props}
			toolInvocation={toolInvocation as ToolInvocation<BuiltinTools[typeof props.step.tool]>}
		/>
	{:else if props.step.tool === 'references'}
		<ReferencesToolCallStep
			{...props}
			toolInvocation={toolInvocation as ToolInvocation<BuiltinTools[typeof props.step.tool]>}
		/>
	{/if}
{:else}
	<p>No tool invocation for step {props.step.id}</p>
{/if}
