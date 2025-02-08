<script lang="ts">
	import * as Navbar from '$lib/components/ui/navbar/index.js'
	import * as Tooltip from '$lib/components/ui/tooltip/index.js'
	import Plus from '@lucide/svelte/icons/plus'
	import '../app.css'

	let { children } = $props()
</script>

<Tooltip.Provider delayDuration={500} disableHoverableContent={true}>
	<Navbar.Root>
		<Navbar.Item path="/chat" title="Chat" />
		<Navbar.Item path="/prompts" title="Prompts" />
		<Navbar.Item path="/history" title="History" />

		<aside class="ml-auto flex gap-2">
			<Navbar.Action title="New Chat" icon={Plus} />
		</aside>
	</Navbar.Root>

	<div class="p-2">
		{@render children()}
	</div>
</Tooltip.Provider>
