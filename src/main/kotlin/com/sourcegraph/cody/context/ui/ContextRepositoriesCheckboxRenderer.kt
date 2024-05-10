package com.sourcegraph.cody.context.ui

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.ui.ThreeStateCheckBox
import com.sourcegraph.cody.context.RepoInclusion
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.JTree

class ContextRepositoriesCheckboxRenderer(private val enhancedContextEnabled: AtomicBoolean) :
    CheckboxTree.CheckboxTreeCellRenderer() {

  override fun customizeRenderer(
      tree: JTree?,
      node: Any?,
      selected: Boolean,
      expanded: Boolean,
      leaf: Boolean,
      row: Int,
      hasFocus: Boolean
  ) {
    val style =
        if (ApplicationInfo.getInstance().build.baselineVersion > 233) "style='color:#808080'"
        else ""

    when (node) {
      // Consumer context node renderers
      is ContextTreeLocalRepoNode -> {
        val projectPath = node.project.basePath?.replace(System.getProperty("user.home"), "~")
        textRenderer.appendHTML(
            "<b>${node.project.name}</b> <i ${style}>${projectPath}</i>",
            SimpleTextAttributes.REGULAR_ATTRIBUTES)
      }

      // Enterprise context node renderers

      is ContextTreeEnterpriseRootNode -> {
        textRenderer.appendHTML(
            CodyBundle.getString("context-panel.tree.node-chat-context.detailed")
                .fmt(style, node.numRepos.toString(), node.endpointName),
            SimpleTextAttributes.REGULAR_ATTRIBUTES)
        // The root element controls enhanced context which includes editor selection, etc. Do not
        // display unchecked/bar even if the child repos are unchecked.
        myCheckbox.state =
            if (node.isChecked) {
              ThreeStateCheckBox.State.SELECTED
            } else {
              ThreeStateCheckBox.State.NOT_SELECTED
            }
        toolTipText = ""
        myCheckbox.toolTipText = ""
      }
      is ContextTreeRemotesNode -> {
        textRenderer.append(
            CodyBundle.getString("context-panel.tree.node-remote-repositories"),
            SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
        myCheckbox.isVisible = false
      }
      is ContextTreeRemoteRepoNode -> {
        val isEnhancedContextEnabled = enhancedContextEnabled.get()

        textRenderer.appendHTML(node.repo.displayName, SimpleTextAttributes.REGULAR_ATTRIBUTES)
        textRenderer.icon = node.repo.icon
        toolTipText =
            when {
              node.repo.isIgnored == true ->
                  CodyBundle.getString("context-panel.tree.node-ignored.tooltip")
              node.repo.inclusion == RepoInclusion.AUTO ->
                  CodyBundle.getString("context-panel.tree.node-auto.tooltip")
              else -> node.repo.name
            }
        myCheckbox.state =
            when {
              isEnhancedContextEnabled &&
                  node.repo.isEnabled == true &&
                  node.repo.isIgnored != true -> ThreeStateCheckBox.State.SELECTED
              node.repo.isEnabled == true -> ThreeStateCheckBox.State.DONT_CARE
              else -> ThreeStateCheckBox.State.NOT_SELECTED
            }
        myCheckbox.isEnabled = isEnhancedContextEnabled && node.repo.inclusion != RepoInclusion.AUTO
        myCheckbox.toolTipText =
            when {
              node.repo.inclusion == RepoInclusion.AUTO ->
                  CodyBundle.getString("context-panel.tree.node-auto.tooltip")
              else -> CodyBundle.getString("context-panel.tree.node.checkbox.remove-tooltip")
            }
      }

      // Fallback
      is CheckedTreeNode -> {
        textRenderer.appendHTML(
            "<b>${node.userObject}</b>", SimpleTextAttributes.REGULAR_ATTRIBUTES)
      }
    }
  }
}
