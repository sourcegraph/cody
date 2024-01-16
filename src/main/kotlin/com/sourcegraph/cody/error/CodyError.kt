package com.sourcegraph.cody.error

data class CodyError(
    val title: String?,
    val pluginVersion: String?,
    val ideVersion: String?,
    val additionalInfo: String?,
    val stacktrace: String?
)
