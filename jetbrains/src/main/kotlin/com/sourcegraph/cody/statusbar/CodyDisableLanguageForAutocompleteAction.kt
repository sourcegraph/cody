package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil.getLanguage
import com.sourcegraph.utils.CodyLanguageUtil

class CodyDisableLanguageForAutocompleteAction : DumbAwareEDTAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val applicationSettings = CodyApplicationSettings.instance
    e.getData(CommonDataKeys.EDITOR)?.let(::getLanguage)?.id?.let { languageId ->
      applicationSettings.blacklistedLanguageIds =
          applicationSettings.blacklistedLanguageIds.plus(languageId)
      CodyAutocompleteManager.instance.clearAutocompleteSuggestionsForLanguageId(languageId)
    }
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    val languageForFocusedEditor = e.getData(CommonDataKeys.EDITOR)?.let(::getLanguage)
    val isLanguageBlacklisted =
        languageForFocusedEditor?.let { CodyLanguageUtil.isLanguageBlacklisted(it) } ?: false
    val languageName = languageForFocusedEditor?.displayName ?: ""
    val project = e.project
    e.presentation.isEnabledAndVisible =
        languageForFocusedEditor != null &&
            ConfigUtil.isCodyEnabled() &&
            ConfigUtil.isCodyAutocompleteEnabled() &&
            project != null &&
            !isLanguageBlacklisted &&
            CodyAuthService.getInstance(project).isActivated()
    e.presentation.text = "Disable Cody Autocomplete for $languageName"
  }
}
