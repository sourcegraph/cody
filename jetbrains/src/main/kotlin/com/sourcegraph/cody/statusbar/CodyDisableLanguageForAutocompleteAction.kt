package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import com.sourcegraph.utils.CodyLanguageUtil

class CodyDisableLanguageForAutocompleteAction : DumbAwareEDTAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val applicationSettings = CodyApplicationSettings.instance
    CodyEditorUtil.getLanguageForFocusedEditor(e)?.id?.let { languageId ->
      applicationSettings.blacklistedLanguageIds =
          applicationSettings.blacklistedLanguageIds.plus(languageId)
      CodyAutocompleteManager.instance.clearAutocompleteSuggestionsForLanguageId(languageId)
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
            !isLanguageBlacklisted &&
            CodyAccount.hasActiveAccount()
    e.presentation.text = "Disable Cody Autocomplete for $languageName"
  }
}
