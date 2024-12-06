package com.sourcegraph.cody.config

import java.awt.Color

data class SettingsModel(
    var defaultBranchName: String = "",
    var remoteUrlReplacements: String = "",
    var isCodyEnabled: Boolean = true,
    var isCodyAutocompleteEnabled: Boolean = true,
    var isCodyDebugEnabled: Boolean = false,
    var isCodyVerboseDebugEnabled: Boolean = false,
    var isCustomAutocompleteColorEnabled: Boolean = false,
    var customAutocompleteColor: Color? = null,
    var isLookupAutocompleteEnabled: Boolean = true,
    var isCodyUIHintsEnabled: Boolean = true,
    var blacklistedLanguageIds: List<String> = listOf(),
    var shouldAcceptNonTrustedCertificatesAutomatically: Boolean = false,
    var shouldCheckForUpdates: Boolean = false
)
