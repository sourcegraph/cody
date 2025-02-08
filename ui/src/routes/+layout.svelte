<script lang="ts">
	import '../app.css'
	import TabsRoot from '$lib/components/tabs/tabs-root.svelte'

	let { children } = $props()

	let activeTab = 'chat'

	const tabs = [
		{
			id: 'chat',
			label: 'Chat',
			content: () => children?.(),
		},
		{
			id: 'prompts',
			label: 'Prompts',
			content: () => '',
		},
		{
			id: 'history',
			label: 'History',
			content: () => '',
		},
	]

	function handleTabChange(tabId: string) {
		activeTab = tabId
	}
</script>

<TabsRoot {tabs} {activeTab} onTabChange={handleTabChange} />

{@render children()}
