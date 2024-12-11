package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil

class CodyEnableAutocompleteAction : DumbAwareEDTAction("Enable Cody Autocomplete") {
  override fun actionPerformed(e: AnActionEvent) {
    CodyApplicationSettings.instance.isCodyAutocompleteEnabled = true
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isEnabledAndVisible =
        ConfigUtil.isCodyEnabled() && !ConfigUtil.isCodyAutocompleteEnabled()
  }
}
