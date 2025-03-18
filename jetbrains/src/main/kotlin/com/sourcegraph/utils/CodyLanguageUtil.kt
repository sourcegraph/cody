package com.sourcegraph.utils

import com.intellij.lang.Language
import com.intellij.lang.LanguageUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.findDocument
import com.sourcegraph.config.ConfigUtil

object CodyLanguageUtil {

  @JvmStatic
  fun getLanguageForLastActiveEditor(e: AnActionEvent): Language? {
    val project = e.project ?: return null
    return e.getData(PlatformDataKeys.LAST_ACTIVE_FILE_EDITOR)?.file?.findDocument()?.let {
      getLanguage(project, it)
    }
  }

  @JvmStatic
  fun getLanguage(project: Project, document: Document): Language? {
    return LanguageUtil.getLanguageForPsi(
        project, FileDocumentManager.getInstance().getFile(document))
  }

  @JvmStatic
  fun isLanguageBlacklisted(language: Language): Boolean {
    return ConfigUtil.getBlacklistedAutocompleteLanguageIds().contains(language.id)
  }
}
