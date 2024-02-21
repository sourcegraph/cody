package com.sourcegraph.cody.chat.ui

import com.intellij.ide.highlighter.HighlighterFactory
import com.intellij.lang.Language
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Computable
import com.intellij.util.ui.SwingHelper
import com.sourcegraph.cody.ui.AttributionButtonController
import java.util.concurrent.atomic.AtomicReference
import javax.swing.JComponent
import javax.swing.JEditorPane

sealed interface MessagePart

class TextPart(val component: JEditorPane) : MessagePart {
  fun updateText(text: String) {
    SwingHelper.setHtml(component, text, null)
  }
}

class CodeEditorPart(
    val component: JComponent,
    private val editor: EditorEx,
    val attribution: AttributionButtonController
) : MessagePart {

  private var recognizedLanguage: Language? = null
  private val _text = AtomicReference("")
  var text: String
    set(value) {
      _text.set(value)
    }
    get() = _text.get()

  fun updateCode(project: Project, code: String, language: String?) {
    recognizeLanguage(language)
    updateText(project, code)
  }

  fun recognizeLanguage(languageName: String?) {
    if (recognizedLanguage != null) return
    val language =
        Language.getRegisteredLanguages()
            .filter { it != Language.ANY }
            .firstOrNull { it.displayName.equals(languageName, ignoreCase = true) }
    if (language != null) {
      val fileType =
          FileTypeManager.getInstance().findFileTypeByLanguage(language)
              ?: PlainTextFileType.INSTANCE
      val settings = EditorColorsManager.getInstance().schemeForCurrentUITheme
      val editorHighlighter = HighlighterFactory.createHighlighter(fileType, settings, null)
      editor.highlighter = editorHighlighter
      recognizedLanguage = language
    }
  }

  private fun updateText(project: Project, text: String) {
    this.text = text
    WriteCommandAction.runWriteCommandAction(
        project, Computable { editor.document.replaceText(text, System.currentTimeMillis()) })
  }
}
