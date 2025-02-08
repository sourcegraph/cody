<script lang="ts">
	import { cn } from '$lib/utils.js'
	import { Tooltip as TooltipPrimitive } from 'bits-ui'

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		...restProps
	}: TooltipPrimitive.ContentProps = $props()
</script>

<TooltipPrimitive.Content
	bind:ref
	{sideOffset}
	class={cn(
		'bg-popover text-popover-foreground animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-50 overflow-hidden border px-1 py-0.5 text-sm shadow-md',
		className,
	)}
	{...restProps}
/>
