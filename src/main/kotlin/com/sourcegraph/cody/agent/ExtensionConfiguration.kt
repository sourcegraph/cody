package com.sourcegraph.cody.agent

data class ExtensionConfiguration(
    val anonymousUserID: String?,
    val serverEndpoint: String,
    val proxy: String? = null,
    val accessToken: String,
    val customHeaders: Map<String, String> = emptyMap(),
    val autocompleteAdvancedProvider: String? = null,
    val debug: Boolean? = false,
    val verboseDebug: Boolean? = false,
    val codebase: String? = null,
    val customConfiguration: Map<String, String> = emptyMap()
)
