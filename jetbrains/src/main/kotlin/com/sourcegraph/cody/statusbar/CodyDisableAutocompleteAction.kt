package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.auth.CodyAuthService
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
    val project = e.project
    e.presentation.isEnabledAndVisible =
        ConfigUtil.isCodyEnabled() &&
            project != null &&
            ConfigUtil.isCodyAutocompleteEnabled() &&
            CodyAuthService.getInstance(project).isActivated()
  }
}
