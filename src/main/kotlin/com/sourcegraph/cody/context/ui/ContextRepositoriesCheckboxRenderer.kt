package com.sourcegraph.cody.context.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.SimpleTextAttributes
import javax.swing.JTree

class ContextRepositoriesCheckboxRenderer : CheckboxTree.CheckboxTreeCellRenderer() {

  override fun customizeRenderer(
      tree: JTree?,
      value: Any?,
      selected: Boolean,
      expanded: Boolean,
      leaf: Boolean,
      row: Int,
      hasFocus: Boolean
  ) {
    when (value) {
      is CheckedTreeNode -> {
        when (val userObject = value.userObject) {
          is Project -> {
            textRenderer.appendHTML(
                "<b>${userObject.name}</b> - <i>${userObject.basePath}</i>",
                SimpleTextAttributes.REGULAR_ATTRIBUTES)
          }
          is String -> {
            textRenderer.appendHTML(userObject, SimpleTextAttributes.REGULAR_ATTRIBUTES)
          }
        }
      }
    }
  }
}
