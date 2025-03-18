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
import com.intellij.ide.DataManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.DataProvider
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.util.Disposer
import com.intellij.ui.EditorTextField
import com.intellij.ui.ExperimentalUI
import com.intellij.ui.Gray
import com.intellij.ui.HintHint
import com.intellij.ui.HintListener
import com.intellij.ui.JBColor
import com.intellij.ui.LightweightHint
import com.intellij.ui.RelativeFont
import com.intellij.ui.ScreenUtil
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.StartupUiUtil.labelFont
import com.intellij.util.ui.UIUtil
import com.sourcegraph.Icons
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import java.awt.Rectangle
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.util.EventObject
import java.util.function.Consumer
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities

/** This is a custom impl of [com.intellij.openapi.vcs.ex.LineStatusMarkerPopupPanel] */
class AutoeditLineStatusMarkerPopupPanel
private constructor(
    editor: Editor,
    toolbar: ActionToolbar,
    editorComponent: JComponent?,
    additionalInfo: JComponent?
) : JPanel(BorderLayout()) {
  private val myEditorComponent: JComponent?
  val editor: Editor

  init {
    isOpaque = false

    this.editor = editor
    myEditorComponent = editorComponent
    val isEditorVisible = myEditorComponent != null

    val toolbarComponent = toolbar.component
    toolbarComponent.border = null
    toolbarComponent.background = TOOLBAR_BACKGROUND_COLOR

    val toolbarPanel: JComponent = JBUI.Panels.simplePanel(toolbarComponent)
    val outsideToolbarBorder =
        JBUI.Borders.customLine(borderColor, 1, 1, if (isEditorVisible) 0 else 1, 1)
    val insets =
        JBUI.insets(
            "VersionControl.MarkerPopup.borderInsets",
            if (ExperimentalUI.isNewUI()) JBUI.insets(6, 8, 6, 10) else JBInsets.create(1, 5))
    val insideToolbarBorder = JBUI.Borders.empty(insets)
    toolbarPanel.border =
        BorderFactory.createCompoundBorder(outsideToolbarBorder, insideToolbarBorder)
    toolbarPanel.background = TOOLBAR_BACKGROUND_COLOR

    if (additionalInfo != null) {
      toolbarPanel.add(additionalInfo, BorderLayout.EAST)
    }

    // 'empty space' to the right of toolbar
    val emptyPanel = JPanel()
    emptyPanel.isOpaque = false
    emptyPanel.preferredSize = Dimension()

    val topPanel = JPanel(BorderLayout())
    topPanel.isOpaque = false
    //        topPanel.add(toolbarPanel, BorderLayout.WEST) // todo: toolbar to be considered
    topPanel.add(emptyPanel, BorderLayout.CENTER)

    add(topPanel, BorderLayout.NORTH)
    if (myEditorComponent != null) add(myEditorComponent, BorderLayout.CENTER)

    add(MyAdvertiser().adComponent, BorderLayout.SOUTH)

    // transfer clicks into editor
    val listener: MouseAdapter =
        object : MouseAdapter() {
          override fun mousePressed(e: MouseEvent) {
            transferEvent(e, editor)
          }

          override fun mouseClicked(e: MouseEvent) {
            transferEvent(e, editor)
          }

          override fun mouseReleased(e: MouseEvent) {
            transferEvent(e, editor)
          }
        }
    emptyPanel.addMouseListener(listener)
  }

  val editorTextOffset: Int
    get() =
        EditorFragmentComponent.createEditorFragmentBorder(editor)
            .getBorderInsets(myEditorComponent)
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
    private val TOOLBAR_BACKGROUND_COLOR =
        JBColor.namedColor(
            "VersionControl.MarkerPopup.Toolbar.background", UIUtil.getPanelBackground())

    private fun transferEvent(e: MouseEvent, editor: Editor) {
      editor.contentComponent.dispatchEvent(
          SwingUtilities.convertMouseEvent(e.component, e, editor.contentComponent))
    }

    fun showPopupAt(
        editor: Editor,
        toolbar: ActionToolbar,
        editorComponent: JComponent?,
        additionalInfoPanel: JComponent?,
        logicalPosition: LogicalPosition,
        childDisposable: Disposable,
        dataProvider: DataProvider?
    ) {
      val popupPanel =
          AutoeditLineStatusMarkerPopupPanel(editor, toolbar, editorComponent, additionalInfoPanel)

      if (dataProvider != null) DataManager.registerDataProvider(popupPanel, dataProvider)
      toolbar.targetComponent = popupPanel

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
          .showEditorHint(hint, editor, point, flags, -1, false, HintHint(editor, point))

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
