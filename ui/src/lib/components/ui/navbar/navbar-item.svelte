<script lang="ts">
	import { isActiveURL } from '$lib/is-active-url.js'
	import { cn } from '$lib/utils.js'
	import type { HTMLAnchorAttributes } from 'svelte/elements'

	let {
		path,
		title,
		ref = $bindable(null),
		class: className,
		...restProps
	}: {
		path: string
		title: string
		ref?: HTMLElement | null
	} & HTMLAnchorAttributes = $props()

	let active = $derived(isActiveURL(path))
</script>

<a
	bind:this={ref}
	href={path}
	data-active={active}
	class={cn(
		'inline-flex items-center justify-center whitespace-nowrap px-0.5 py-1 font-semibold text-foreground border-b border-transparent data-[active=true]:border-primary disabled:pointer-events-none disabled:opacity-50 uppercase',
		className,
	)}
	{...restProps}
>
	{title}
</a>
