<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js'
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down'
	import X from '@lucide/svelte/icons/x'
	import type { Component, Snippet } from 'svelte'

	let {
		title,
		component,
		children,
	}: { title: string; component: Component<any>; children: Snippet } = $props()

	let key = `dev:storybook:${title}`
	let open = $state(localStorage.getItem(key) === 'true')
	$effect(() => {
		if (open) {
			localStorage.setItem(key, 'true')
		} else {
			localStorage.removeItem(key)
		}
	})
</script>

<Collapsible.Root class="w-full" bind:open>
	<Collapsible.Trigger class="focus:outline-none">
		<h2 class="text-muted-foreground mb-1 text-sm [&>svg]:size-3 flex items-center gap-0.5">
			{title}
			{#if open}
				<X />
			{:else}
				<ChevronsUpDown />
			{/if}
		</h2>
	</Collapsible.Trigger>
	<Collapsible.Content class="mt-4 mb-12 space-y-4">
		{@render children()}
	</Collapsible.Content>
</Collapsible.Root>
