package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil

class CodyDisableAutocompleteAction : DumbAwareEDTAction("Disable Cody Autocomplete") {
  override fun actionPerformed(e: AnActionEvent) {
    CodyApplicationSettings.instance.isCodyAutocompleteEnabled = false
    CodyAutocompleteManager.instance.clearAutocompleteSuggestionsForAllProjects()
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isEnabledAndVisible =
        ConfigUtil.isCodyEnabled() &&
            ConfigUtil.isCodyAutocompleteEnabled() &&
            CodyAccount.hasActiveAccount()
  }
}
