package com.sourcegraph.cody.autoedit

import com.intellij.diff.DiffApplicationSettings
import com.intellij.diff.comparison.ByWord
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.diff.util.DiffUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.BackgroundTaskUtil
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.TextRange
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

  override fun shouldPaintGutter() = true

  override fun showHintAt(editor: Editor, range: Range, mousePosition: Point?) {
    if (!myTracker.isValid()) return
    val disposable = Disposer.newDisposable()
    Disposer.register(disposable, myTracker.disposable)

    var editorComponent: JComponent? = null
    if (range.hasVcsLines()) {
      val content = MyLineStatusMarkerPopupActions.getVcsContent(myTracker, range).toString()
      val textField = AutoeditLineStatusMarkerPopupPanel.createTextField(editor, content)

      AutoeditLineStatusMarkerPopupPanel.installBaseEditorSyntaxHighlighters(
          myTracker.project,
          textField,
          myTracker.vcsDocument,
          MyLineStatusMarkerPopupActions.getVcsTextRange(myTracker, range),
          fileType)

      installWordDiff(editor, textField, range, disposable)

      editorComponent = AutoeditLineStatusMarkerPopupPanel.createEditorComponent(editor, textField)
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

    val vcsContent = MyLineStatusMarkerPopupActions.getVcsContent(myTracker, range)
    val currentContent = MyLineStatusMarkerPopupActions.getCurrentContent(myTracker, range)

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

  /**
   * This is a copy of [com.intellij.openapi.vcs.ex.LineStatusMarkerPopupActions]. The class methods
   * have been renamed between the earliest and latest supported versions.
   */
  object MyLineStatusMarkerPopupActions {
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
}
