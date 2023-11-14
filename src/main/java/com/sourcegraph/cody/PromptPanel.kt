package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.ui.DocumentAdapter
import com.sourcegraph.cody.chat.CodyChatMessageHistory
import com.sourcegraph.cody.ui.AutoGrowingTextArea
import java.awt.BorderLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.BorderFactory
import javax.swing.JPanel
import javax.swing.KeyStroke
import javax.swing.event.DocumentEvent
import javax.swing.text.DefaultEditorKit

class PromptPanel(
    project: Project,
    chatMessageHistory: CodyChatMessageHistory,
    onSendMessageAction: (Project) -> Unit,
    onTextChangedSetButtonEnabled: (Boolean) -> Unit
) : JPanel(BorderLayout()) {

  private val autoGrowingTextArea = AutoGrowingTextArea(3, 9, this)
  val promptInput = autoGrowingTextArea.textArea
  private var isInHistoryMode = true

  init {
    val upperMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (isInHistoryMode) {
              chatMessageHistory.popUpperMessage(promptInput)
            } else {
              val defaultAction = promptInput.actionMap[DefaultEditorKit.upAction]
              defaultAction.actionPerformed(null)
            }
          }
        }
    val lowerMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (isInHistoryMode) {
              chatMessageHistory.popLowerMessage(promptInput)
            } else {
              val defaultAction = promptInput.actionMap[DefaultEditorKit.downAction]
              defaultAction.actionPerformed(null)
            }
          }
        }
    val sendMessageAction: AnAction =
        object : DumbAwareAction() {
          override fun actionPerformed(e: AnActionEvent) {
            if (promptInput.getText().isNotEmpty()) {
              onSendMessageAction(project)
            }
          }
        }
    sendMessageAction.registerCustomShortcutSet(DEFAULT_SUBMIT_ACTION_SHORTCUT, promptInput)
    upperMessageAction.registerCustomShortcutSet(POP_UPPER_MESSAGE_ACTION_SHORTCUT, promptInput)
    lowerMessageAction.registerCustomShortcutSet(POP_LOWER_MESSAGE_ACTION_SHORTCUT, promptInput)
    promptInput.addKeyListener(
        object : KeyAdapter() {
          override fun keyReleased(e: KeyEvent) {
            val keyCode = e.keyCode
            if (keyCode != KeyEvent.VK_UP && keyCode != KeyEvent.VK_DOWN) {
              isInHistoryMode = promptInput.getText().isEmpty()
            }
          }
        })
    // Enable/disable the send button based on whether promptInput is empty
    promptInput.document.addDocumentListener(
        object : DocumentAdapter() {
          override fun textChanged(e: DocumentEvent) {
            // extract method instead of passing sendActionPanel
            onTextChangedSetButtonEnabled(promptInput.getText().isNotEmpty())
          }
        })
    add(autoGrowingTextArea.scrollPane, BorderLayout.CENTER)
    border = BorderFactory.createEmptyBorder(0, 0, 10, 0)
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
