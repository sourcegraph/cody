package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.ui.DocumentAdapter
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.chat.ChatSession
import com.sourcegraph.cody.chat.CodyChatMessageHistory
import com.sourcegraph.cody.chat.ui.SendButton
import com.sourcegraph.cody.ui.AutoGrowingTextArea
import com.sourcegraph.cody.vscode.CancellationToken
import java.awt.Dimension
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.JLayeredPane
import javax.swing.KeyStroke
import javax.swing.border.EmptyBorder
import javax.swing.event.AncestorEvent
import javax.swing.event.AncestorListener
import javax.swing.event.DocumentEvent

class PromptPanel(private val chatSession: ChatSession) : JLayeredPane() {

  private val autoGrowingTextArea = AutoGrowingTextArea(5, 9, this)
  private val scrollPane = autoGrowingTextArea.scrollPane
  private val textArea = autoGrowingTextArea.textArea
  private val promptMessageHistory = CodyChatMessageHistory(CHAT_MESSAGE_HISTORY_CAPACITY)
  private val sendButton = SendButton()

  init {
    textArea.emptyText.text = "Ask a question about this code..."

    sendButton.addActionListener { _ -> chatSession.sendMessage(getTextAndReset()) }

    val upperMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            promptMessageHistory.popUpperMessage(textArea)
          }
        }
    val lowerMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            promptMessageHistory.popLowerMessage(textArea)
          }
        }
    val sendMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (sendButton.isEnabled) {
              chatSession.sendMessage(getTextAndReset())
            }
          }
        }

    addAncestorListener(
        object : AncestorListener {
          override fun ancestorAdded(event: AncestorEvent?) {
            textArea.requestFocusInWindow()
            textArea.caretPosition = textArea.document.length
          }

          override fun ancestorRemoved(event: AncestorEvent?) {}

          override fun ancestorMoved(event: AncestorEvent?) {}
        })

    sendMessageAction.registerCustomShortcutSet(DEFAULT_SUBMIT_ACTION_SHORTCUT, textArea)
    upperMessageAction.registerCustomShortcutSet(POP_UPPER_MESSAGE_ACTION_SHORTCUT, textArea)
    lowerMessageAction.registerCustomShortcutSet(POP_LOWER_MESSAGE_ACTION_SHORTCUT, textArea)

    textArea.addKeyListener(
        object : KeyAdapter() {
          override fun keyReleased(e: KeyEvent) {
            val keyCode = e.keyCode
            if (keyCode != KeyEvent.VK_UP && keyCode != KeyEvent.VK_DOWN) {}
          }
        })
    textArea.document.addDocumentListener(
        object : DocumentAdapter() {
          override fun textChanged(e: DocumentEvent) {
            refreshSendButton()
          }
        })
    scrollPane.border = EmptyBorder(JBUI.emptyInsets())
    scrollPane.background = UIUtil.getPanelBackground()

    // Set initial bounds for the scrollPane (100x100) to ensure proper initialization;
    // later adjusted dynamically based on component resizing in the component listener.
    scrollPane.setBounds(0, 0, 100, 100)

    add(scrollPane, DEFAULT_LAYER)

    add(sendButton, PALETTE_LAYER, 0)

    scrollPane.setBounds(0, 0, width, scrollPane.preferredSize.height)

    preferredSize = Dimension(scrollPane.width, scrollPane.height)

    addComponentListener(
        object : ComponentAdapter() {
          override fun componentResized(e: ComponentEvent?) {
            revalidate()
            val jButtonPreferredSize = sendButton.preferredSize
            sendButton.setBounds(
                scrollPane.width - jButtonPreferredSize.width,
                scrollPane.height - jButtonPreferredSize.height,
                jButtonPreferredSize.width,
                jButtonPreferredSize.height)
          }
        })
  }

  @RequiresEdt
  fun refreshSendButton() {
    sendButton.isEnabled =
        textArea.getText().isNotEmpty() && chatSession.getCancellationToken().isDone
  }

  fun registerCancellationToken(cancellationToken: CancellationToken) {
    cancellationToken.onFinished {
      ApplicationManager.getApplication().invokeLater { refreshSendButton() }
    }
  }

  override fun revalidate() {
    super.revalidate()

    scrollPane.setBounds(0, 0, width, scrollPane.preferredSize.height)
    preferredSize = Dimension(scrollPane.width, scrollPane.height)
  }

  private fun getTextAndReset(): String {
    val text = textArea.text
    promptMessageHistory.messageSent(text)
    textArea.text = ""
    return text
  }

  companion object {
    private const val CHAT_MESSAGE_HISTORY_CAPACITY = 100
    private val JUST_ENTER = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), null)

    val UP = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_UP, 0), null)
    val DOWN = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_DOWN, 0), null)
    val DEFAULT_SUBMIT_ACTION_SHORTCUT = CustomShortcutSet(JUST_ENTER)
    val POP_UPPER_MESSAGE_ACTION_SHORTCUT = CustomShortcutSet(UP)
    val POP_LOWER_MESSAGE_ACTION_SHORTCUT = CustomShortcutSet(DOWN)
  }
}
