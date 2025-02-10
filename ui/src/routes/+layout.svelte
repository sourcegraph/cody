<script lang="ts">
	import * as Navbar from '$lib/components/ui/navbar/index.js'
	import * as Tooltip from '$lib/components/ui/tooltip/index.js'
	import { route } from '$lib/route-helpers'
	import Plus from '@lucide/svelte/icons/plus'
	import '../app.css'
	import StateDebugOverlay from '../lib/components/state-debug-overlay.svelte'
	import { setWebviewAPIContext } from '../lib/webview-api/context'
	import { STORYBOOK_CONFIG } from './storybook/config'

	let { data, children } = $props()

	setWebviewAPIContext(data.webviewAPIClient.api)
</script>

<Tooltip.Provider delayDuration={500} disableHoverableContent={true}>
	<div class="flex flex-col h-[100vh] overflow-hidden">
		<Navbar.Root class="flex-shrink-0 bg-background">
			<Navbar.Item path="/chat" title="Chat" />
			<Navbar.Item path="/prompts" title="Prompts" />
			<Navbar.Item path="/history" title="History" />
			{#if STORYBOOK_CONFIG.enabled}
				<Navbar.Item path="/storybook" title="Storybook" />
			{/if}

			<aside class="ml-auto flex gap-2">
				<Navbar.Action title="New Chat" icon={Plus} href={route('/chat/new')} />
			</aside>
		</Navbar.Root>

		<div class="p-2 flex-1 [&>*]:h-full overflow-auto">
			{@render children()}
		</div>

		<StateDebugOverlay class="flex-shrink-0" />
	</div>
</Tooltip.Provider>
