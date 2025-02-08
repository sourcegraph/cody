<script lang="ts">
    import { type SnippetReturn } from "svelte";

    let {
        tabs,
        activeTab,
        onTabChange,
    }: {
        tabs: Array<{
            id: string;
            label: string;
            content: () => SnippetReturn;
        }>;
        activeTab: string;
        onTabChange: (tabId: string) => void;
    } = $props();

    function handleTabClick(tabId: string) {
        onTabChange(tabId);
    }
</script>

<div class="tabs-container">
    <div class="tab-bar">
        {#each tabs as tab}
            <button
                class="tab-button"
                class:active={activeTab === tab.id}
                onclick={() => handleTabClick(tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="tab-content">
        {#each tabs as tab}
            {#if activeTab === tab.id}
                {@render tab.content()}
            {/if}
        {/each}
    </div>
</div>

<style>
    .tabs-container {
        width: 100%;
    }

    .tab-bar {
        display: flex;
        border-bottom: 1px solid #ccc;
    }

    .tab-button {
        padding: 0.5rem 1rem;
        border: none;
        background: none;
        cursor: pointer;
        border-bottom: 2px solid transparent;
    }

    .tab-button.active {
        border-bottom: 2px solid #007bff;
        color: #007bff;
    }

    .tab-content {
        padding: 1rem;
    }
</style>
