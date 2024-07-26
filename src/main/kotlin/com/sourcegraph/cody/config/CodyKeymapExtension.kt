package com.sourcegraph.cody.config

import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.keymap.KeymapExtension
import com.intellij.openapi.keymap.KeymapGroup
import com.intellij.openapi.keymap.KeymapGroupFactory
import com.intellij.openapi.keymap.impl.ui.ActionsTreeUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Condition
import com.sourcegraph.common.CodyBundle

class CodyKeymapExtension : KeymapExtension {
  override fun createGroup(filtered: Condition<in AnAction>?, project: Project?): KeymapGroup? {
    val result =
        KeymapGroupFactory.getInstance().createGroup(CodyBundle.getString("cody.plugin-name"))
    val actions = ActionsTreeUtil.getActions("Cody.AllActions").toList()
    actions.filterIsInstance<ActionGroup>().forEach { actionGroup ->
      val keymapGroup = KeymapGroupFactory.getInstance().createGroup(actionGroup.templateText)
      ActionsTreeUtil.getActions(ActionManager.getInstance().getId(actionGroup)).forEach {
        ActionsTreeUtil.addAction(keymapGroup, it, filtered, true)
      }
      result.addGroup(keymapGroup)
    }

    return result
  }
}
