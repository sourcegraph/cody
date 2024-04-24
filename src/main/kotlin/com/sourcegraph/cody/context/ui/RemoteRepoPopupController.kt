package com.sourcegraph.cody.context.ui

import com.intellij.codeInsight.AutoPopupController
import com.intellij.codeInsight.completion.BaseCompletionService
import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.ex.FocusChangeListener
import com.intellij.openapi.editor.highlighter.EditorHighlighterFactory
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.JBPopupListener
import com.intellij.openapi.ui.popup.LightweightWindowEvent
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFileFactory
import com.intellij.ui.SoftWrapsEditorCustomization
import com.intellij.util.LocalTimeCounter
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBDimension
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.context.RemoteRepoFileType
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.ui.DumbAwareBGTAction
import com.sourcegraph.utils.CodyEditorUtil
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JPanel
import javax.swing.border.CompoundBorder

const val MAX_REMOTE_REPOSITORY_COUNT = 10

class RemoteRepoPopupController(val project: Project) {
  var onAccept: (spec: String) -> Unit = {}

  @RequiresEdt
  fun createPopup(width: Int, initialValue: String = ""): JBPopup {
    val psiFile =
        PsiFileFactory.getInstance(project)
            .createFileFromText(
                "RepositoryList",
                RemoteRepoFileType.INSTANCE,
                initialValue,
                LocalTimeCounter.currentTime(),
                true,
                false)
    psiFile.putUserData<Boolean>(BaseCompletionService.FORBID_WORD_COMPLETION, false)
    DaemonCodeAnalyzer.getInstance(project).setHighlightingEnabled(psiFile, true)

    val document = PsiDocumentManager.getInstance(project).getDocument(psiFile)!!

    val editor = EditorFactory.getInstance().createEditor(document, project)
    editor.putUserData<Boolean>(AutoPopupController.ALWAYS_AUTO_POPUP, true)
    editor.putUserData<Boolean>(CodyEditorUtil.KEY_EDITOR_WANTS_AUTOCOMPLETE, false)

    // Put the cursor at the end of the first line. This is a more convenient place to insert new
    // repositories.
    editor.caretModel.moveToLogicalPosition(LogicalPosition(0, document.getLineEndOffset(0)))

    if (editor is EditorEx) {
      editor.apply {
        SoftWrapsEditorCustomization.ENABLED.customize(this)
        setHorizontalScrollbarVisible(false)
        setVerticalScrollbarVisible(true)
        highlighter =
            EditorHighlighterFactory.getInstance()
                .createEditorHighlighter(project, RemoteRepoFileType.INSTANCE)
        addFocusListener(
            object : FocusChangeListener {
              override fun focusGained(editor: Editor) {
                super.focusGained(editor)
                val project = editor.project
                if (project != null) {
                  AutoPopupController.getInstance(project).scheduleAutoPopup(editor)
                }
              }
            })
      }
    }
    editor.settings.apply {
      additionalLinesCount = 0
      additionalColumnsCount = 1
      isRightMarginShown = false
      setRightMargin(-1)
      isFoldingOutlineShown = false
      isLineNumbersShown = false
      isLineMarkerAreaShown = false
      isIndentGuidesShown = false
      isVirtualSpace = false
      isWheelFontChangeEnabled = false
      isAdditionalPageAtBottom = false
      lineCursorWidth = 1
    }
    editor.contentComponent.apply { border = CompoundBorder(JBUI.Borders.empty(2), border) }

    val panel = JPanel(BorderLayout()).apply { add(editor.component, BorderLayout.CENTER) }
    val shortcut = KeymapUtil.getShortcutsText(CommonShortcuts.CTRL_ENTER.shortcuts)
    val scaledHeight = JBDimension(0, 100).height
    val popup =
        (JBPopupFactory.getInstance()
                .createComponentPopupBuilder(panel, editor.contentComponent)
                .apply {
                  setAdText(
                      CodyBundle.getString("context-panel.remote-repo.select-repo-advertisement")
                          .fmt(MAX_REMOTE_REPOSITORY_COUNT.toString(), shortcut))
                  setCancelOnClickOutside(true)
                  setMayBeParent(true)
                  setMinSize(Dimension(width, scaledHeight))
                  setRequestFocus(true)
                  setResizable(true)
                  addListener(
                      object : JBPopupListener {
                        override fun onClosed(event: LightweightWindowEvent) {
                          EditorFactory.getInstance().releaseEditor(editor)
                        }
                      })
                })
            .createPopup()

    val okAction =
        object : DumbAwareBGTAction() {
          override fun actionPerformed(event: AnActionEvent) {
            unregisterCustomShortcutSet(popup.content)
            popup.closeOk(event.inputEvent)
            // We don't use the Psi elements here, because the Annotator may be slow, etc.
            onAccept(document.text)
          }
        }
    okAction.registerCustomShortcutSet(CommonShortcuts.CTRL_ENTER, popup.content)

    return popup
  }
}
