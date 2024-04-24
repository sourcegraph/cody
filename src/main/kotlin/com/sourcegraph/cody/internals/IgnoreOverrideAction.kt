package com.sourcegraph.cody.internals

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.dsl.builder.*
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.TestingIgnoreOverridePolicy
import javax.swing.JComponent

data object ignoreOverrideModel {
  var enabled: Boolean = false
  var uriRe: String = ""
  var repoRe: String = ""
}

class IgnoreOverrideDialog(val project: Project) : DialogWrapper(project) {
  init {
    super.init()
    title = "Testing: Cody Ignore"
  }

  override fun createCenterPanel(): JComponent {
    return panel {
      lateinit var overrideCheckbox: Cell<JBCheckBox>
      row {
        overrideCheckbox =
            checkBox("Override policy for testing").bindSelected(ignoreOverrideModel::enabled)
      }
      row {
        label("URI Regex (ECMA-262):")
        textField().enabledIf(overrideCheckbox.selected).bindText(ignoreOverrideModel::uriRe)
      }
      row {
        label("Repo regex (ECMA-262):")
        textField().enabledIf(overrideCheckbox.selected).bindText(ignoreOverrideModel::repoRe)
      }
    }
  }

  override fun doOKAction() {
    CodyAgentService.withAgent(project) { agent ->
      agent.server.testingIgnoreOverridePolicy(
          if (ignoreOverrideModel.enabled) {
            TestingIgnoreOverridePolicy(
                uriRe = ignoreOverrideModel.uriRe,
                repoRe = ignoreOverrideModel.repoRe,
            )
          } else {
            null
          })
    }
    super.doOKAction()
  }
}

class IgnoreOverrideAction(val project: Project) : DumbAwareAction("Testing: Cody Ignore") {
  override fun actionPerformed(e: AnActionEvent) {
    IgnoreOverrideDialog(project).show()
  }
}
