package com.sourcegraph.cody.edit

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.wm.WindowManager
import com.intellij.ui.JBColor
import com.intellij.ui.components.fields.ExpandableTextField
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.chat.ui.LlmDropdown
import com.sourcegraph.cody.edit.sessions.EditCodeSession
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.event.FocusEvent
import java.awt.event.FocusListener
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingUtilities
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/** Pop up a user interface for giving Cody instructions to fix up code at the cursor. */
class EditCommandPrompt(val controller: FixupService, val editor: Editor, val dialogTitle: String) {
  private val logger = Logger.getInstance(EditCommandPrompt::class.java)

  private val offset = editor.caretModel.primaryCaret.offset

  private var dialog: EditCommandPrompt.InstructionsDialog? = null

  private val instructionsField =
      GhostTextField().apply {
        val screenWidth = getScreenWidth(editor)
        val preferredWidth = minOf(screenWidth / 2, DEFAULT_TEXT_FIELD_WIDTH)
        preferredSize = Dimension(preferredWidth, preferredSize.height)
        minimumSize = Dimension(preferredWidth, minimumSize.height)
      }

  val llmDropdown =
      LlmDropdown(
          modelUsage = ModelUsage.EDIT,
          project = controller.project,
          onSetSelectedItem = {},
          chatModelProviderFromState = null)

  // History navigation helper
  private val historyCursor = HistoryCursor()

  init {
    setupTextField()
    setupKeyListener()
  }

  fun displayPromptUI() {
    ApplicationManager.getApplication().invokeLater {
      val dlg = dialog
      if (dlg == null || dlg.isDisposed) {
        dialog = InstructionsDialog()
      }
      dialog?.show()
    }
  }

  fun getText(): String = instructionsField.text

  @RequiresEdt
  private fun setupTextField() {
    instructionsField.document.addDocumentListener(
        object : DocumentListener {
          override fun insertUpdate(e: DocumentEvent?) {
            handleDocumentChange()
          }

          override fun removeUpdate(e: DocumentEvent?) {
            handleDocumentChange()
          }

          override fun changedUpdate(e: DocumentEvent?) {
            handleDocumentChange()
          }

          private fun handleDocumentChange() {
            ApplicationManager.getApplication().invokeLater {
              updateOkButtonState()
              checkForInterruptions()
            }
          }
        })
  }

  @RequiresEdt
  private fun updateOkButtonState() {
    dialog?.isOKActionEnabled = instructionsField.text.isNotBlank()
  }

  @RequiresEdt
  private fun checkForInterruptions() {
    if (editor.isDisposed || editor.isViewer || !editor.document.isWritable) {
      dialog?.apply {
        close(DialogWrapper.CANCEL_EXIT_CODE)
        disposeIfNeeded()
      }
    }
  }

  @RequiresEdt
  private fun setupKeyListener() {
    instructionsField.addKeyListener(
        object : KeyAdapter() {
          override fun keyPressed(e: KeyEvent) {
            when (e.keyCode) {
              KeyEvent.VK_UP -> fetchPreviousHistoryItem()
              KeyEvent.VK_DOWN -> fetchNextHistoryItem()
            }
            updateOkButtonState()
          }
        })
  }

  @RequiresEdt
  private fun fetchPreviousHistoryItem() {
    updateTextFromHistory(historyCursor.getPreviousHistoryItem())
  }

  @RequiresEdt
  private fun fetchNextHistoryItem() {
    updateTextFromHistory(historyCursor.getNextHistoryItem())
  }

  @RequiresEdt
  private fun updateTextFromHistory(text: String) {
    instructionsField.text = text
    instructionsField.caretPosition = text.length
    updateOkButtonState()
  }

  private inner class HistoryCursor {
    private var historyIndex = -1

    fun getPreviousHistoryItem() = getHistoryItemByDelta(-1)

    fun getNextHistoryItem() = getHistoryItemByDelta(1)

    @RequiresEdt
    private fun getHistoryItemByDelta(delta: Int): String {
      if (promptHistory.isNotEmpty()) {
        historyIndex = (historyIndex + delta).coerceIn(0, promptHistory.size - 1)
        return promptHistory[historyIndex]
      }
      return ""
    }
  }

  private inner class InstructionsDialog :
      DialogWrapper(editor.project, false, IdeModalityType.MODELESS) {
    init {
      init()
      title = dialogTitle
      instructionsField.text = controller.getLastPrompt()
      dialog = this
      updateOkButtonState()
    }

    override fun getPreferredFocusedComponent() = instructionsField

    @RequiresEdt
    override fun createCenterPanel(): JComponent {
      val result = generatePromptUI(offset)
      updateOkButtonState()
      return result
    }

    @RequiresEdt
    override fun doOKAction() {
      val text = instructionsField.text
      super.doOKAction()
      if (text.isNotBlank()) {
        addToHistory(text)
        val project = editor.project
        // TODO: How do we show user feedback when an error like this happens?
        if (project == null) {
          logger.warn("Project was null when trying to add an edit session")
          return
        }
        controller.addSession(EditCodeSession(controller, editor, project, text, llmDropdown.item))
      }
    }

    @RequiresEdt
    override fun doCancelAction() {
      super.doCancelAction()
      dialog?.disposeIfNeeded()
      dialog = null
    }
  } // InstructionsDialog

  @RequiresEdt
  private fun generatePromptUI(offset: Int): JPanel {
    val root = JPanel(BorderLayout())

    val topRow = JPanel(BorderLayout())
    val (line, col) = editor.offsetToLogicalPosition(offset).let { Pair(it.line, it.column) }
    val file = FileDocumentManager.getInstance().getFile(editor.document)?.name ?: "unknown file"
    topRow.add(JLabel("Editing $file at $line:$col"), BorderLayout.CENTER)

    val southRow = JPanel(BorderLayout())

    val historyLabel =
        JLabel().apply {
          text =
              if (promptHistory.isNotEmpty()) {
                "↑↓ for history"
              } else {
                ""
              }
          font = font.deriveFont(font.size - 1f)
        }
    southRow.add(historyLabel, BorderLayout.CENTER)

    southRow.add(llmDropdown, BorderLayout.EAST)

    root.add(topRow, BorderLayout.NORTH)
    root.add(southRow, BorderLayout.SOUTH)
    root.add(instructionsField, BorderLayout.CENTER)

    return root
  }

  private fun getScreenWidth(editor: Editor): Int {
    val frame = WindowManager.getInstance().getIdeFrame(editor.project)
    val screenSize = frame?.component?.let { SwingUtilities.getWindowAncestor(it).size }
    return screenSize?.width ?: DEFAULT_TEXT_FIELD_WIDTH
  }

  inner class GhostTextField : ExpandableTextField(), FocusListener, Disposable {

    init {
      // Disposer.register(this@EditCommandPrompt, this@GhostTextField)
      addFocusListener(this)
    }

    override fun paintComponent(g: Graphics) {
      super.paintComponent(g)

      if (text.isEmpty()) {
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2.color = JBColor.GRAY
        val fontMetrics = g2.fontMetrics
        val x = insets.left + fontMetrics.charWidth('G')
        val y =
            insets.top +
                (height - insets.top - insets.bottom - fontMetrics.height) / 2 +
                fontMetrics.ascent
        g2.drawString(GHOST_TEXT, x, y)
      }
    }

    override fun focusGained(e: FocusEvent?) {
      repaint()
    }

    override fun focusLost(e: FocusEvent?) {
      repaint()
    }

    override fun dispose() {
      removeFocusListener(this)
    }
  }

  companion object {
    const val DEFAULT_TEXT_FIELD_WIDTH: Int = 620 // TODO: make this smarter

    const val GHOST_TEXT = "Instructions (@ to include code)"

    // Going with a global history for now, shared across edit-code prompts.
    val promptHistory = mutableListOf<String>()

    @RequiresEdt
    fun addToHistory(prompt: String) {
      if (prompt.isNotBlank() && !promptHistory.contains(prompt)) {
        promptHistory.add(prompt)
      }
    }
  }
}
