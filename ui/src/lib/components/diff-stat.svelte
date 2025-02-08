<script lang="ts">
	import SquareDot from '@lucide/svelte/icons/square-dot'
	import SquareMinus from '@lucide/svelte/icons/square-minus'
	import SquarePlus from '@lucide/svelte/icons/square-plus'

	let {
		added = 0,
		changed = 0,
		deleted = 0,
	} = $props<{
		added?: number
		changed?: number
		deleted?: number
	}>()

	const total = $derived(added + changed + deleted)
</script>

{#if total > 0}
	<div
		class="inline-flex items-center gap-1 [&>*]:inline-flex [&>*]:items-center [&>*]:gap-0.5 [&_svg]:size-3 text-xs"
	>
		{#if added > 0}
			<div class="text-green-600">
				<SquarePlus />
				{added}
			</div>
		{/if}
		{#if changed > 0}
			<div class="text-yellow-600">
				<SquareDot />
				{changed}
			</div>
		{/if}
		{#if deleted > 0}
			<div class="text-red-600">
				<SquareMinus />
				{deleted}
			</div>
		{/if}
	</div>
{/if}
