package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.ui.DocumentAdapter
import com.sourcegraph.cody.chat.CodyChatMessageHistory
import com.sourcegraph.cody.ui.AutoGrowingTextArea
import java.awt.BorderLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.KeyStroke
import javax.swing.event.DocumentEvent
import javax.swing.text.DefaultEditorKit

class PromptPanel(
    chatMessageHistory: CodyChatMessageHistory,
    onSendMessageAction: () -> Unit,
    sendButton: JButton,
    isGenerating: () -> Boolean
) : JPanel(BorderLayout()) {

  private val autoGrowingTextArea = AutoGrowingTextArea(3, 9, this)
  val textArea = autoGrowingTextArea.textArea
  private var isInHistoryMode = true

  init {
    textArea.emptyText.text = "Ask a question about this code..."

    val upperMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (isInHistoryMode) {
              chatMessageHistory.popUpperMessage(textArea)
            } else {
              val defaultAction = textArea.actionMap[DefaultEditorKit.upAction]
              defaultAction.actionPerformed(null)
            }
          }
        }
    val lowerMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (isInHistoryMode) {
              chatMessageHistory.popLowerMessage(textArea)
            } else {
              val defaultAction = textArea.actionMap[DefaultEditorKit.downAction]
              defaultAction.actionPerformed(null)
            }
          }
        }
    val sendMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (sendButton.isEnabled) {
              onSendMessageAction()
              isInHistoryMode = true
            }
          }
        }
    sendMessageAction.registerCustomShortcutSet(DEFAULT_SUBMIT_ACTION_SHORTCUT, textArea)
    upperMessageAction.registerCustomShortcutSet(POP_UPPER_MESSAGE_ACTION_SHORTCUT, textArea)
    lowerMessageAction.registerCustomShortcutSet(POP_LOWER_MESSAGE_ACTION_SHORTCUT, textArea)
    textArea.addKeyListener(
        object : KeyAdapter() {
          override fun keyReleased(e: KeyEvent) {
            val keyCode = e.keyCode
            if (keyCode != KeyEvent.VK_UP && keyCode != KeyEvent.VK_DOWN) {
              isInHistoryMode = textArea.getText().isEmpty()
            }
          }
        })
    textArea.document.addDocumentListener(
        object : DocumentAdapter() {
          override fun textChanged(e: DocumentEvent) {
            val empty = textArea.getText().isEmpty()
            sendButton.isEnabled = !empty && !isGenerating()
          }
        })
    add(autoGrowingTextArea.scrollPane, BorderLayout.CENTER)
    border = BorderFactory.createEmptyBorder(0, 0, 10, 0)
  }

  fun reset() {
    textArea.text = ""
    isInHistoryMode = true
  }

  companion object {
    private val JUST_ENTER = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), null)

    val UP = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_UP, 0), null)
    val DOWN = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_DOWN, 0), null)
    val DEFAULT_SUBMIT_ACTION_SHORTCUT = CustomShortcutSet(JUST_ENTER)
    val POP_UPPER_MESSAGE_ACTION_SHORTCUT = CustomShortcutSet(UP)
    val POP_LOWER_MESSAGE_ACTION_SHORTCUT = CustomShortcutSet(DOWN)
  }
}
