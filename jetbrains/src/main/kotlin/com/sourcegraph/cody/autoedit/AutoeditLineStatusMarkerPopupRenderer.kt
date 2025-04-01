package com.sourcegraph.cody.autoedit

import com.intellij.diff.DiffApplicationSettings
import com.intellij.diff.comparison.ByWord
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.diff.util.DiffUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.highlighter.EditorHighlighterFactory
import com.intellij.openapi.editor.highlighter.FragmentedEditorHighlighter
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.BackgroundTaskUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vcs.ex.LineStatusMarkerPopupPanel.getEditorBackgroundColor
import com.intellij.openapi.vcs.ex.LineStatusMarkerPopupRenderer
import com.intellij.openapi.vcs.ex.LineStatusTrackerI
import com.intellij.openapi.vcs.ex.Range
import com.intellij.ui.EditorTextField
import com.intellij.util.ui.JBUI
import java.awt.Point
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.border.Border

class AutoeditLineStatusMarkerPopupRenderer(tracker: LineStatusTrackerI<*>) :
    LineStatusMarkerPopupRenderer(tracker) {
  override fun createToolbarActions(
      editor: Editor,
      range: Range,
      mousePosition: Point?
  ): MutableList<AnAction> {
    return mutableListOf()
  }

  override fun shouldPaintGutter() = true

  override fun showHintAt(editor: Editor, range: Range, mousePosition: Point?) {
    if (!myTracker.isValid()) return
    val disposable = Disposer.newDisposable()
    Disposer.register(disposable, myTracker.disposable)

    var editorComponent: JComponent? = null
    if (range.hasVcsLines()) {
      val content = LineStatusMarkerPopupActions.getVcsContent(myTracker, range).toString()
      val textField = LineStatusMarkerPopupPanel.createTextField(editor, content)

      LineStatusMarkerPopupPanel.installBaseEditorSyntaxHighlighters(
          myTracker.project,
          textField,
          myTracker.vcsDocument,
          LineStatusMarkerPopupActions.getVcsTextRange(myTracker, range),
          fileType)

      installWordDiff(editor, textField, range, disposable)

      editorComponent = LineStatusMarkerPopupPanel.createEditorComponent(editor, textField)
    }

    if (editorComponent == null) {
      disposable.dispose()
      return
    }

    // Find max column in the range
    val column =
        editor.document.text
            .lines()
            .drop(range.line1)
            .take(range.line2 - range.line1)
            .maxBy { it.length }
            ?.length ?: 0
    val logicalPosition = LogicalPosition(range.line1, column + 4)

    AutoeditLineStatusMarkerPopupPanel.showPopupAt(
        editor, editorComponent, logicalPosition, disposable)
  }

  private fun installWordDiff(
      editor: Editor,
      textField: EditorTextField,
      range: Range,
      disposable: Disposable
  ) {
    if (!DiffApplicationSettings.getInstance().SHOW_LST_WORD_DIFFERENCES) return
    if (!range.hasLines() || !range.hasVcsLines()) return

    val vcsContent = LineStatusMarkerPopupActions.getVcsContent(myTracker, range)
    val currentContent = LineStatusMarkerPopupActions.getCurrentContent(myTracker, range)

    val wordDiff =
        BackgroundTaskUtil.tryComputeFast(
            { indicator: ProgressIndicator? ->
              ByWord.compare(vcsContent, currentContent, ComparisonPolicy.DEFAULT, indicator!!)
            },
            200)
    if (wordDiff == null) return

    AutoeditLineStatusMarkerPopupPanel.installMasterEditorWordHighlighters(
        editor, range.line1, range.line2, wordDiff, disposable)
    AutoeditLineStatusMarkerPopupPanel.installPopupEditorWordHighlighters(textField, wordDiff)
  }

  object LineStatusMarkerPopupActions {
    fun getVcsContent(tracker: LineStatusTrackerI<*>, range: Range): CharSequence {
      return DiffUtil.getLinesContent(tracker.vcsDocument, range.vcsLine1, range.vcsLine2)
    }

    fun getCurrentContent(tracker: LineStatusTrackerI<*>, range: Range): CharSequence {
      return DiffUtil.getLinesContent(tracker.document, range.line1, range.line2)
    }

    fun getVcsTextRange(tracker: LineStatusTrackerI<*>, range: Range): TextRange {
      return DiffUtil.getLinesRange(tracker.vcsDocument, range.vcsLine1, range.vcsLine2)
    }
  }

  object LineStatusMarkerPopupPanel {

    fun createEditorComponent(editor: Editor, popupEditor: JComponent?): JComponent {
      val editorComponent: JPanel = JBUI.Panels.simplePanel(popupEditor)
      editorComponent.border = createEditorFragmentBorder()
      editorComponent.background = getEditorBackgroundColor(editor)
      return editorComponent
    }

    fun createEditorFragmentBorder(): Border {
      val outsideEditorBorder =
          JBUI.Borders.customLine(
              com.intellij.openapi.vcs.ex.LineStatusMarkerPopupPanel.getBorderColor(), 1)
      val insideEditorBorder = JBUI.Borders.empty(2)
      return BorderFactory.createCompoundBorder(outsideEditorBorder, insideEditorBorder)
    }

    fun createTextField(editor: Editor, content: String): EditorTextField {
      val field = EditorTextField(content)
      field.border = null
      field.setOneLineMode(false)
      field.ensureWillComputePreferredSize()
      field.setFontInheritedFromLAF(false)

      field.addSettingsProvider { uEditor: EditorEx ->
        uEditor.setVerticalScrollbarVisible(true)
        uEditor.setHorizontalScrollbarVisible(true)
        uEditor.settings.isUseSoftWraps = false

        uEditor.isRendererMode = true
        uEditor.setBorder(null)

        uEditor.colorsScheme = editor.colorsScheme
        uEditor.backgroundColor = getEditorBackgroundColor(editor)
        uEditor.settings.isCaretRowShown = false

        uEditor.settings.setTabSize(editor.settings.getTabSize(editor.project))
        uEditor.settings.setUseTabCharacter(editor.settings.isUseTabCharacter(editor.project))
      }

      return field
    }

    fun installBaseEditorSyntaxHighlighters(
        project: Project?,
        textField: EditorTextField,
        vcsDocument: Document,
        vcsTextRange: TextRange,
        fileType: FileType
    ) {
      val highlighter =
          EditorHighlighterFactory.getInstance().createEditorHighlighter(project, fileType)
      highlighter.setText(vcsDocument.immutableCharSequence)
      val fragmentedHighlighter = FragmentedEditorHighlighter(highlighter, vcsTextRange)
      textField.addSettingsProvider { uEditor: EditorEx ->
        uEditor.highlighter = fragmentedHighlighter
      }
    }
  }
}
