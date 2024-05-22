package com.sourcegraph.cody.commands.ui

import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.ex.ActionManagerEx
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.ui.TitledSeparator
import com.intellij.ui.components.JBPanelWithEmptyText
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.cody.edit.actions.DocumentCodeAction
import com.sourcegraph.cody.edit.actions.EditCodeAction
import com.sourcegraph.cody.edit.actions.TestCodeAction
import com.sourcegraph.cody.ignore.CommandPanelIgnoreBanner
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.ignore.IgnorePolicy
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.GridLayout
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.plaf.ButtonUI

class CommandsTabPanel(
    private val project: Project,
    private val executeCommand: (CommandId) -> Unit
) :
    JBPanelWithEmptyText(GridLayout(/* rows = */ 0, /* cols = */ 1)),
    IgnoreOracle.FocusedFileIgnorePolicyListener,
    FixupService.ActiveFixupSessionStateListener {
  private val ignoreBanner = CommandPanelIgnoreBanner()
  private val buttons = mutableMapOf<String, JButton>()

  @Volatile private var ignorePolicy: IgnorePolicy = IgnorePolicy.USE

  @Volatile private var isInlineEditInProgress: Boolean = false

  init {
    layout = BoxLayout(this, BoxLayout.Y_AXIS)
    setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10))

    fun addSeparator(name: String) {
      val separator = TitledSeparator(name)
      separator.maximumSize = Dimension(Int.MAX_VALUE, separator.preferredSize.height)
      add(separator)
    }

    addSeparator("Edit Commands")
    addInlineEditActionButton(EditCodeAction.ID)
    addInlineEditActionButton(DocumentCodeAction.ID)
    addInlineEditActionButton(TestCodeAction.ID)

    addSeparator("Chat Commands")
    CommandId.values().forEach { command -> addCommandButton(command) }

    IgnoreOracle.getInstance(project).addListener(this)
    FixupService.getInstance(project).addListener(this)
  }

  private fun addInlineEditActionButton(actionId: String) {
    val action = ActionManagerEx.getInstanceEx().getAction(actionId)
    val button =
        addButton(
            actionId, action.templatePresentation.text, action.templatePresentation.mnemonic) {
              val editor =
                  FileEditorManager.getInstance(project).selectedTextEditor ?: return@addButton
              val dataContext = (editor as? EditorEx)?.dataContext ?: return@addButton
              val managerEx = ActionManagerEx.getInstanceEx()
              val event =
                  AnActionEvent(
                      null, dataContext, ActionPlaces.UNKNOWN, Presentation(), managerEx, 0)
              ActionUtil.performActionDumbAwareWithCallbacks(action, event)
            }

    val betaIcon = JLabel(Icons.Edit.Beta)
    betaIcon.border = BorderFactory.createEmptyBorder(0, 5, 0, 0)
    button.add(betaIcon, BorderLayout.LINE_START)
  }

  private fun addCommandButton(commandId: CommandId) {
    addButton(commandId.id, commandId.displayName, commandId.mnemonic) { executeCommand(commandId) }
  }

  private fun addButton(
      actionId: String,
      displayName: String,
      mnemonic: Int,
      action: () -> Unit
  ): JButton {
    val button = JButton(displayName)
    buttons[actionId] = button

    button.layout = BorderLayout()
    ActionManagerEx.getInstanceEx().getAction(actionId).shortcutSet.shortcuts.firstOrNull()?.let {
      val shortcutLabel = JLabel(KeymapUtil.getShortcutText(it))
      shortcutLabel.border = BorderFactory.createEmptyBorder(0, 0, 0, 10)
      button.add(shortcutLabel, BorderLayout.LINE_END)
    }
    button.mnemonic = mnemonic
    button.displayedMnemonicIndex = displayName.indexOfFirst { it.code == mnemonic }
    button.alignmentX = Component.CENTER_ALIGNMENT
    button.alignmentY = Component.TOP_ALIGNMENT
    button.maximumSize = Dimension(Int.MAX_VALUE, button.getPreferredSize().height)
    val buttonUI = DarculaButtonUI.createUI(button) as ButtonUI
    button.setUI(buttonUI)
    button.addActionListener { action() }
    add(button)
    return button
  }

  private fun update() {
    // Dis/enable all the buttons.
    for ((actionId, button) in buttons) {
      // We block only DocumentCodeAction and TestCodeAction, for EditCodeAction we will block the
      // button on the edit dialog
      val shouldBlockInlineEditAction =
          isInlineEditInProgress &&
              (actionId == DocumentCodeAction.ID || actionId == TestCodeAction.ID)
      button.isEnabled = ignorePolicy == IgnorePolicy.USE && !shouldBlockInlineEditAction
    }

    when (ignorePolicy) {
      IgnorePolicy.USE -> {
        remove(ignoreBanner)
      }
      IgnorePolicy.IGNORE -> {
        add(ignoreBanner, 0)
      }
    }
    revalidate()
    repaint()
  }

  override fun focusedFileIgnorePolicyChanged(policy: IgnorePolicy) {
    this.ignorePolicy = policy
    runInEdt { update() }
  }

  override fun fixupSessionStateChanged(isInProgress: Boolean) {
    this.isInlineEditInProgress = isInProgress
    runInEdt { update() }
  }
}
