package com.sourcegraph.cody.autoedit

import com.intellij.diff.DiffApplicationSettings
import com.intellij.diff.comparison.ByWord
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.BackgroundTaskUtil
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vcs.ex.LineStatusMarkerPopupActions
import com.intellij.openapi.vcs.ex.LineStatusMarkerPopupPanel
import com.intellij.openapi.vcs.ex.LineStatusMarkerPopupRenderer
import com.intellij.openapi.vcs.ex.LineStatusTrackerI
import com.intellij.openapi.vcs.ex.Range
import com.intellij.ui.EditorTextField
import java.awt.Point
import javax.swing.JComponent

class AutoeditLineStatusMarkerPopupRenderer(tracker: LineStatusTrackerI<*>) :
    LineStatusMarkerPopupRenderer(tracker) {
  override fun createToolbarActions(
      editor: Editor,
      range: Range,
      mousePosition: Point?
  ): MutableList<AnAction> {
    return mutableListOf()
  }

  override fun shouldPaintGutter() = true // TODO: do we want it?

  override fun showHintAt(editor: Editor, range: Range, mousePosition: Point?) {
    if (!myTracker.isValid()) return
    val disposable = Disposer.newDisposable()

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

    val actions: List<AnAction> = createToolbarActions(editor, range, mousePosition)
    val toolbar = LineStatusMarkerPopupPanel.buildToolbar(editor, actions, disposable)

    val additionalInfoPanel = createAdditionalInfoPanel(editor, range, mousePosition, disposable)

    // todo: consider deriving this from `originalText`
    val column =
        editor.document.text
            .lines()
            .drop(range.line1)
            .take(range.line2 - range.line1)
            .maxBy { it.length }
            ?.length ?: 0
    val logicalPosition = LogicalPosition(range.line1, column + 4)

    AutoeditLineStatusMarkerPopupPanel.showPopupAt(
        editor, toolbar, editorComponent, additionalInfoPanel, logicalPosition, disposable, null)
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
}
