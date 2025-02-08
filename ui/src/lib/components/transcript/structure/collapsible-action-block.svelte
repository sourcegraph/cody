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
		...restProps
	}: { summary: Snippet; expandable?: boolean } & Omit<
		ComponentProps<typeof ActionBlock>,
		'width'
	> = $props()

	let open = $state(false)
</script>

<ActionBlock {...restProps} width="full">
	{#if expandable}
		<Collapsible.Root class="w-full flex flex-col" bind:open>
			<Collapsible.Trigger
				class="focus:outline-none [&>svg]:size-3.5 [&>svg]:inline [&>svg]:-ml-0.5 inline-flex items-center gap-[2px] leading-none"
			>
				{@render summary()}
				{#if open}
					<ChevronDown />
				{:else}
					<ChevronRight />
				{/if}
			</Collapsible.Trigger>
			<Collapsible.Content class="pl-2 mt-1 border-l-2">
				{@render children()}
			</Collapsible.Content>
		</Collapsible.Root>
	{:else}
		{@render summary()}
	{/if}
</ActionBlock>
