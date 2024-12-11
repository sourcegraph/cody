package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import com.sourcegraph.utils.CodyLanguageUtil

class CodyEnableLanguageForAutocompleteAction : DumbAwareEDTAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val applicationSettings = CodyApplicationSettings.instance
    applicationSettings.blacklistedLanguageIds =
        applicationSettings.blacklistedLanguageIds.filterNot {
          it == CodyEditorUtil.getLanguageForFocusedEditor(e)?.id
        }
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    val languageForFocusedEditor = CodyEditorUtil.getLanguageForFocusedEditor(e)
    val isLanguageBlacklisted =
        languageForFocusedEditor?.let { CodyLanguageUtil.isLanguageBlacklisted(it) } ?: false
    val languageName = languageForFocusedEditor?.displayName ?: ""
    e.presentation.isEnabledAndVisible =
        languageForFocusedEditor != null &&
            ConfigUtil.isCodyEnabled() &&
            ConfigUtil.isCodyAutocompleteEnabled() &&
            isLanguageBlacklisted
    e.presentation.text = "Enable Cody Autocomplete for $languageName"
  }
}
