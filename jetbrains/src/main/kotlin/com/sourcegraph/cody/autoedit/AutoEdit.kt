package com.sourcegraph.cody.autoedit

import com.intellij.codeInsight.hint.HintManagerImpl
import com.intellij.codeInsight.lookup.impl.LookupCellRenderer
import com.intellij.codeWithMe.ClientId
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.CaretListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.openapi.editor.event.EditorMouseListener
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfoRt
import com.intellij.ui.ComponentUtil
import com.intellij.ui.RelativeFont
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.StartupUiUtil.labelFont
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.accessibility.AccessibleContextUtil
import com.intellij.util.ui.accessibility.ScreenReader
import com.intellij.util.ui.update.Activatable
import com.intellij.util.ui.update.UiNotifyConnector
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditResult
import java.awt.Font
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.ComponentListener

class AutoEdit(
    val project: Project,
    val editor: Editor,
    val autocompleteEditResult: AutocompleteEditResult
) : Disposable {

  private val advertiser = NewUILookupAdvertiser()

  private val myUi = AutoEditUi(this, advertiser)

  private val myClientId: ClientId = ClientId.current

  fun showAutoEdit(): Boolean {
    ApplicationManager.getApplication().assertIsDispatchThread()
    if (ApplicationManager.getApplication().isHeadlessEnvironment) return true

    if (!UIUtil.isShowing(editor.contentComponent)) {
      hideAutoEdit()
      return false
    }

    return doShowAutoEdit()
  }

  private fun doShowAutoEdit(): Boolean {
    if (ScreenReader.isActive()) {
      myUi.wrapperPanel.mainPanel.isFocusable = true
    }
    try {
      HintManagerImpl.getExternalComponent(editor).rootPane.layeredPane.add(myUi.wrapperPanel)
      val p = myUi.calculatePosition().location
      myUi.wrapperPanel.mainPanel.location = p
    } catch (e: Exception) {
      LOG.error(e)
    }

    if (!myUi.wrapperPanel.isVisible || !myUi.wrapperPanel.isShowing) {
      hideAutoEdit()
      return false
    }

    return true
  }

  private fun addListeners() {
    editor.document.addDocumentListener(
        object : DocumentListener {
          override fun documentChanged(e: DocumentEvent) {
            if (canHide()) {
              hideAutoEdit()
            }
          }
        },
        this)

    val mouseListener: EditorMouseListener =
        object : EditorMouseListener {
          override fun mouseClicked(e: EditorMouseEvent) {
            e.consume()
            hideAutoEdit()
          }
        }

    editor.caretModel.addCaretListener(
        object : CaretListener {
          override fun caretPositionChanged(e: CaretEvent) {
            if (canHide()) {
              hideAutoEdit()
            }
          }
        },
        this)
    editor.selectionModel.addSelectionListener(
        object : SelectionListener {
          override fun selectionChanged(e: SelectionEvent) {
            if (canHide()) {
              hideAutoEdit()
            }
          }
        },
        this)
    editor.addEditorMouseListener(mouseListener, this)

    val editorComponent = editor.contentComponent
    if (editorComponent.isShowing) {
      Disposer.register(
          this,
          UiNotifyConnector.installOn(
              editorComponent,
              object : Activatable {
                override fun hideNotify() {
                  hideAutoEdit()
                }
              }))

      val window = ComponentUtil.getWindow(editorComponent)
      if (window != null) {
        val windowListener: ComponentListener =
            object : ComponentAdapter() {
              override fun componentMoved(event: ComponentEvent) {
                hideAutoEdit()
              }
            }

        window.addComponentListener(windowListener)
        Disposer.register(this) { window.removeComponentListener(windowListener) }
      }
    }
  }

  private fun canHide(): Boolean {
    return ClientId.isCurrentlyUnderLocalId
  }

  fun hideAutoEdit() {
    ApplicationManager.getApplication().assertIsDispatchThread()

    doHide()
  }

  private fun doHide() {
    if (myClientId != ClientId.current) {
      LOG.error(ClientId.current.toString() + " tries to hide lookup of " + myClientId)
    } else {
      try {
        Disposer.dispose(this)
      } catch (e: Throwable) {
        LOG.error(e)
      }
    }
  }

  init {
    myUi.wrapperPanel.mainPanel.isFocusable = false
    myUi.wrapperPanel.mainPanel.border = null

    // a new top level frame just got the focus. This is important to prevent screen readers
    // from announcing the title of the top level frame when the list is shown (or hidden),
    // as they usually do when a new top-level frame receives the focus.
    // This is not relevant on Mac. This breaks JBR a11y on Mac.
    if (SystemInfoRt.isWindows) {
      AccessibleContextUtil.setParent(myUi.wrapperPanel, editor.contentComponent)
    }

    myUi.wrapperPanel.mainPanel.background = LookupCellRenderer.BACKGROUND_COLOR
    advertiser.addAdvertisement("Auto Edit from Cody", Icons.SourcegraphLogo)

    addListeners()
  }

  override fun dispose() {
    ApplicationManager.getApplication().assertIsDispatchThread()

    val layeredPane = HintManagerImpl.getExternalComponent(editor).rootPane.layeredPane
    layeredPane.remove(myUi.wrapperPanel)
    layeredPane.invalidate()
    layeredPane.repaint()
  }

  private class NewUILookupAdvertiser : Advertiser() {
    init {
      setBorder(JBUI.Borders.empty())
      setForeground(JBUI.CurrentTheme.CompletionPopup.Advertiser.foreground())
      setBackground(JBUI.CurrentTheme.CompletionPopup.Advertiser.background())
    }

    override fun adFont(): Font {
      val font = labelFont
      val relativeFont =
          RelativeFont.NORMAL.scale(JBUI.CurrentTheme.CompletionPopup.Advertiser.fontSizeOffset())
      return relativeFont.derive(font)
    }
  }

  companion object {
    private val LOG = Logger.getInstance(AutoEdit::class.java)
  }
}
