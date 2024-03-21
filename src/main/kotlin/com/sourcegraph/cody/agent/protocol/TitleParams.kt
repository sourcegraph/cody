package com.sourcegraph.cody.agent.protocol

data class TitleParams(
    val text: String? = null,
    val icons: List<IconsParams>? = null,
)
