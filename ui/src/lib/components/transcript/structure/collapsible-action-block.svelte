<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js'
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import type { ComponentProps, Snippet } from 'svelte'
	import ActionBlock from './action-block.svelte'

	let {
		summary,
		children,
		expandable = true,
		disabled = false,
		...restProps
	}: { summary: Snippet; expandable?: boolean; disabled?: boolean } & Omit<
		ComponentProps<typeof ActionBlock>,
		'width'
	> = $props()

	let open = $state(false)
</script>

<ActionBlock {...restProps} width="full">
	{#if expandable}
		<Collapsible.Root class="w-full flex flex-col " bind:open {disabled}>
			<Collapsible.Trigger
				class="focus:outline-none [&>svg]:size-3.5 [&>svg]:inline [&>svg]:-ml-0.5 inline-flex items-center gap-[2px] leading-none [&:disabled>svg]:opacity-50"
			>
				{#if open}
					<ChevronDown />
				{:else}
					<ChevronRight />
				{/if}
				<span>{@render summary()}</span>
			</Collapsible.Trigger>
			<Collapsible.Content class="mt-0.5">
				{@render children()}
			</Collapsible.Content>
		</Collapsible.Root>
	{:else}
		{@render summary()}
	{/if}
</ActionBlock>
