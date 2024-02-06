package com.sourcegraph.cody.commands.ui

import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBPanelWithEmptyText
import com.sourcegraph.cody.autocomplete.CodyEditorFactoryListener
import com.sourcegraph.cody.commands.CommandId
import java.awt.Component
import java.awt.Dimension
import java.awt.GridLayout
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.plaf.ButtonUI

class CommandsTabPanel(
    private val project: Project,
    private val executeCommand: (CommandId) -> Unit
) : JBPanelWithEmptyText(GridLayout(/* rows = */ 0, /* cols = */ 1)) {

  init {
    layout = BoxLayout(this, BoxLayout.Y_AXIS)
    CommandId.values().forEach { command -> addButton(command) }
  }

  private fun executeCommandWithContext(commandId: CommandId) {
    FileEditorManager.getInstance(project).selectedTextEditor?.let {
      CodyEditorFactoryListener.Util.informAgentAboutEditorChange(it, hasFileChanged = false) {
        ApplicationManager.getApplication().invokeLater { executeCommand(commandId) }
      }
    }
  }

  private fun addButton(commandId: CommandId) {
    val button = JButton(commandId.displayName)
    val indexOfFirst = commandId.displayName.indexOfFirst { it == commandId.mnemonic }
    if (indexOfFirst >= 0) {
      button.displayedMnemonicIndex = indexOfFirst
    } else {
      button.setMnemonic(commandId.mnemonic)
    }
    button.alignmentX = Component.CENTER_ALIGNMENT
    button.maximumSize = Dimension(Int.MAX_VALUE, button.getPreferredSize().height)
    val buttonUI = DarculaButtonUI.createUI(button) as ButtonUI
    button.setUI(buttonUI)
    button.addActionListener { executeCommandWithContext(commandId) }
    add(button)
  }
}
