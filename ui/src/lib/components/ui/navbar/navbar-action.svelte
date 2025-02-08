<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte'
	import * as Tooltip from '$lib/components/ui/tooltip/index.js'
	import { isActiveURL } from '$lib/is-active-url.js'
	import type { ComponentType } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'

	let {
		path,
		title,
		icon: Icon,
		class: className,
	}: {
		path?: string
		title?: string
		icon: ComponentType
	} & HTMLAttributes<HTMLButtonElement> = $props()
</script>

{#if path === undefined || isActiveURL(path)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button variant="ghost" size="iconSm" class={className}>
				<Icon />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			{title}
		</Tooltip.Content>
	</Tooltip.Root>
{/if}
