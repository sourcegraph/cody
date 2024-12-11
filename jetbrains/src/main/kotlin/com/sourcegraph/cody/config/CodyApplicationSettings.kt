package com.sourcegraph.cody.config

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@State(name = "CodyApplicationSettings", storages = [Storage("cody_application_settings.xml")])
data class CodyApplicationSettings(
    var isCodyEnabled: Boolean = true,
    var isCodyAutocompleteEnabled: Boolean = true,
    var isCodyDebugEnabled: Boolean = false,
    var isCodyVerboseDebugEnabled: Boolean = false,
    var isGetStartedNotificationDismissed: Boolean = false,
    var isNotLoggedInNotificationDismissed: Boolean = false,
    var anonymousUserId: String? = null,
    var isInstallEventLogged: Boolean = false,
    var isCustomAutocompleteColorEnabled: Boolean = false,
    var customAutocompleteColor: Int? = null,
    var isLookupAutocompleteEnabled: Boolean = true,
    var isCodyUIHintsEnabled: Boolean = false,
    var blacklistedLanguageIds: List<String> = listOf(),
    var isOnboardingGuidanceDismissed: Boolean = false,
    var shouldAcceptNonTrustedCertificatesAutomatically: Boolean = false,
    var shouldCheckForUpdates: Boolean = true,
    var isOffScreenRenderingEnabled: Boolean = true,
) : PersistentStateComponent<CodyApplicationSettings> {
  override fun getState(): CodyApplicationSettings = this

  override fun loadState(state: CodyApplicationSettings) {
    this.isCodyEnabled = state.isCodyEnabled
    this.isCodyAutocompleteEnabled = state.isCodyAutocompleteEnabled
    this.isCodyDebugEnabled = state.isCodyDebugEnabled
    this.isCodyVerboseDebugEnabled = state.isCodyVerboseDebugEnabled
    this.isGetStartedNotificationDismissed = state.isGetStartedNotificationDismissed
    this.isNotLoggedInNotificationDismissed = state.isNotLoggedInNotificationDismissed
    this.anonymousUserId = state.anonymousUserId
    this.isInstallEventLogged = state.isInstallEventLogged
    this.isCustomAutocompleteColorEnabled = state.isCustomAutocompleteColorEnabled
    this.customAutocompleteColor = state.customAutocompleteColor
    this.isLookupAutocompleteEnabled = state.isLookupAutocompleteEnabled
    this.isCodyUIHintsEnabled = state.isCodyUIHintsEnabled
    this.blacklistedLanguageIds = state.blacklistedLanguageIds
    this.isOnboardingGuidanceDismissed = state.isOnboardingGuidanceDismissed
    this.shouldAcceptNonTrustedCertificatesAutomatically =
        state.shouldAcceptNonTrustedCertificatesAutomatically
    this.shouldCheckForUpdates = state.shouldCheckForUpdates
    this.isOffScreenRenderingEnabled = state.isOffScreenRenderingEnabled
  }

  companion object {
    @JvmStatic
    val instance: CodyApplicationSettings
      get() = service<CodyApplicationSettings>()
  }
}
