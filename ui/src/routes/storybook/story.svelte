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
		<h2 class="font-semibold mb-1">
			{title}
			{#if open}
				<X class="w-4 h-4 inline" />
			{:else}
				<ChevronsUpDown class="w-4 h-4 inline" />
			{/if}
		</h2>
	</Collapsible.Trigger>
	<Collapsible.Content class="mb-12">
		{@render children()}
	</Collapsible.Content>
</Collapsible.Root>
