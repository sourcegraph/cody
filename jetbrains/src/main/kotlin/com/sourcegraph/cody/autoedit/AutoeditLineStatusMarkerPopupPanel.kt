package com.sourcegraph.cody.autoedit

import com.intellij.codeInsight.hint.EditorFragmentComponent
import com.intellij.codeInsight.hint.EditorHintListener
import com.intellij.codeInsight.hint.HintManager
import com.intellij.codeInsight.hint.HintManagerImpl
import com.intellij.diff.fragments.DiffFragment
import com.intellij.diff.util.DiffDrawUtil
import com.intellij.diff.util.DiffDrawUtil.InlineHighlighterBuilder
import com.intellij.diff.util.DiffDrawUtil.LineHighlighterBuilder
import com.intellij.diff.util.DiffUtil
import com.intellij.diff.util.TextDiffType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.util.Disposer
import com.intellij.ui.EditorTextField
import com.intellij.ui.Gray
import com.intellij.ui.HintHint
import com.intellij.ui.HintListener
import com.intellij.ui.JBColor
import com.intellij.ui.LightweightHint
import com.intellij.ui.RelativeFont
import com.intellij.ui.ScreenUtil
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.StartupUiUtil.labelFont
import com.sourcegraph.Icons
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import java.awt.Rectangle
import java.util.EventObject
import java.util.function.Consumer
import javax.swing.JComponent
import javax.swing.JPanel

/** This is a custom impl of [com.intellij.openapi.vcs.ex.LineStatusMarkerPopupPanel] */
class AutoeditLineStatusMarkerPopupPanel
private constructor(val editor: Editor, private val editorComponent: JComponent) :
    JPanel(BorderLayout()) {

  init {
    isOpaque = false

    add(editorComponent, BorderLayout.CENTER)
    add(MyAdvertiser().adComponent, BorderLayout.SOUTH)
  }

  val editorTextOffset: Int
    get() =
        EditorFragmentComponent.createEditorFragmentBorder(editor)
            .getBorderInsets(editorComponent)
            .left

  override fun getPreferredSize(): Dimension {
    val gap = JBUI.scale(10)
    val screenRectangle = ScreenUtil.getScreenRectangle(editor.component)
    val maxSize = Rectangle(screenRectangle.width - gap, screenRectangle.height - gap)

    val size = super.getPreferredSize()
    if (size.width > maxSize.width) {
      size.width = maxSize.width
      // Space for horizontal scrollbar
      size.height += JBUI.scale(20)
    }
    if (size.height > maxSize.height) {
      size.height = maxSize.height
    }
    return size
  }

  companion object {

    fun showPopupAt(
        editor: Editor,
        editorComponent: JComponent,
        logicalPosition: LogicalPosition,
        childDisposable: Disposable
    ) {
      val popupPanel = AutoeditLineStatusMarkerPopupPanel(editor, editorComponent)

      val hint = LightweightHint(popupPanel)
      val closeListener = HintListener { _ -> Disposer.dispose(childDisposable) }
      hint.addHintListener(closeListener)

      val point = HintManagerImpl.getHintPosition(hint, editor, logicalPosition, HintManager.RIGHT)
      point.y -= popupPanel.editorTextOffset // align the popup with the main editor
      point.x += popupPanel.editorTextOffset // add some space b/w the last character and the popup

      val flags =
          HintManager.HIDE_BY_CARET_MOVE or
              HintManager.HIDE_BY_TEXT_CHANGE or
              HintManager.UPDATE_BY_SCROLLING
      HintManagerImpl.getInstanceImpl()
          .showEditorHint(
              hint,
              editor,
              point,
              flags,
              /*timeout =*/ -1,
              /*reviveOnEditorChange = */ false,
              HintHint(editor, point))

      ApplicationManager.getApplication()
          .messageBus
          .connect(childDisposable)
          .subscribe<EditorHintListener>(
              EditorHintListener.TOPIC,
              object : EditorHintListener {
                override fun hintShown(
                    newEditor: Editor,
                    newHint: LightweightHint,
                    flags: Int,
                    hintInfo: HintHint
                ) {
                  // Ex: if popup re-shown by ToggleByWordDiffAction
                  val newPopupPanel = newHint.component
                  if (newPopupPanel is AutoeditLineStatusMarkerPopupPanel) {
                    if (newPopupPanel.editor == newEditor) {
                      hint.hide()
                    }
                  }
                }
              })

      if (!hint.isVisible) {
        closeListener.hintHidden(EventObject(hint))
      }
    }

    val borderColor: Color
      get() =
          JBColor.namedColor("VersionControl.MarkerPopup.borderColor", JBColor(Gray._206, Gray._75))

    fun installPopupEditorWordHighlighters(
        textField: EditorTextField,
        wordDiff: List<DiffFragment>?
    ) {
      if (wordDiff == null) return
      textField.addSettingsProvider { uEditor: EditorEx? ->
        for (fragment in wordDiff) {
          val vcsStart = fragment.startOffset1
          val vcsEnd = fragment.endOffset1
          val type = DiffUtil.getDiffType(fragment).inverse()

          DiffDrawUtil.createInlineHighlighter(uEditor!!, vcsStart, vcsEnd, type)
        }
      }
    }

    fun installMasterEditorWordHighlighters(
        editor: Editor,
        startLine: Int,
        endLine: Int,
        wordDiff: List<DiffFragment>,
        parentDisposable: Disposable
    ) {
      val currentTextRange = DiffUtil.getLinesRange(editor.document, startLine, endLine)

      DiffDrawUtil.setupLayeredRendering(
          editor, startLine, endLine, DiffDrawUtil.LAYER_PRIORITY_LST, parentDisposable)

      val currentStartOffset = currentTextRange.startOffset
      val highlighters: MutableList<RangeHighlighter> = ArrayList()

      highlighters.addAll(
          LineHighlighterBuilder(editor, startLine, endLine, TextDiffType.MODIFIED)
              .withLayerPriority(DiffDrawUtil.LAYER_PRIORITY_LST)
              .withIgnored(true)
              .withHideStripeMarkers(true)
              .withHideGutterMarkers(true)
              .done())

      for (fragment in wordDiff) {
        val currentStart = currentStartOffset + fragment.startOffset2
        val currentEnd = currentStartOffset + fragment.endOffset2
        val type = DiffUtil.getDiffType(fragment).inverse()

        highlighters.addAll(
            InlineHighlighterBuilder(editor, currentStart, currentEnd, type)
                .withLayerPriority(DiffDrawUtil.LAYER_PRIORITY_LST)
                .done())
      }

      Disposer.register(parentDisposable) {
        highlighters.forEach(Consumer { obj: RangeHighlighter -> obj.dispose() })
      }
    }

    fun TextDiffType.inverse() =
        when (this) {
          TextDiffType.DELETED -> TextDiffType.INSERTED
          TextDiffType.INSERTED -> TextDiffType.DELETED
          else -> this
        }
  }

  private class MyAdvertiser : Advertiser() {
    init {
      setBorder(JBUI.Borders.empty(3))
      setForeground(JBUI.CurrentTheme.CompletionPopup.Advertiser.foreground())
      setBackground(JBUI.CurrentTheme.CompletionPopup.Advertiser.background())

      addAdvertisement("Autoedit from Cody", Icons.SourcegraphLogo)
    }

    override fun adFont(): Font {
      val font = labelFont
      val relativeFont =
          RelativeFont.NORMAL.scale(JBUI.CurrentTheme.CompletionPopup.Advertiser.fontSizeOffset())
      return relativeFont.derive(font)
    }
  }
}
