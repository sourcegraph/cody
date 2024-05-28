package com.sourcegraph.cody.context.ui

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.ui.ThreeStateCheckBox
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.chat.ui.pluralize
import com.sourcegraph.cody.context.RepoInclusion
import com.sourcegraph.cody.context.RepoSelectionStatus
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

      is ContextTreeEditReposNode -> {
        toolTipText = ""
        myCheckbox.isVisible = false
        textRenderer.appendHTML(
            CodyBundle.getString(
                    when {
                      node.hasRemovableRepos -> "context-panel.tree.node-edit-repos.label-edit"
                      else -> "context-panel.tree.node-edit-repos.label-add"
                    })
                .fmt(style),
            SimpleTextAttributes.REGULAR_ATTRIBUTES)
        textRenderer.icon =
            when {
              node.hasRemovableRepos -> Icons.Actions.Edit
              else -> Icons.Actions.Add
            }
      }
      is ContextTreeEnterpriseRootNode -> {
        textRenderer.appendHTML(
            CodyBundle.getString("context-panel.tree.node-chat-context.detailed")
                .fmt(
                    style,
                    node.numActiveRepos.toString(),
                    "repository".pluralize(node.numActiveRepos)),
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
      is ContextTreeRemoteRepoNode -> {
        val isEnhancedContextEnabled = enhancedContextEnabled.get()

        textRenderer.appendHTML(
            CodyBundle.getString("context-panel.tree.node-remote-repo.label")
                .fmt(
                    style,
                    node.repo.name,
                    when {
                      // TODO: Handle missing remote repos with a "not found" string
                      node.repo.inclusion == RepoInclusion.AUTO && node.repo.isIgnored ->
                          CodyBundle.getString("context-panel.tree.node-remote-repo.auto-ignored")
                      node.repo.inclusion == RepoInclusion.AUTO ->
                          CodyBundle.getString("context-panel.tree.node-remote-repo.auto")
                      node.repo.isIgnored ->
                          CodyBundle.getString("context-panel.tree.node-remote-repo.ignored")
                      node.repo.selectionStatus == RepoSelectionStatus.NOT_FOUND ->
                          CodyBundle.getString("context-panel.tree.node-remote-repo.not-found")
                      else -> ""
                    }),
            SimpleTextAttributes.REGULAR_ATTRIBUTES)

        textRenderer.icon = node.repo.icon

        toolTipText =
            when {
              node.repo.isIgnored -> CodyBundle.getString("context-panel.tree.node-ignored.tooltip")
              node.repo.inclusion == RepoInclusion.AUTO ->
                  CodyBundle.getString("context-panel.tree.node-auto.tooltip")
              else -> node.repo.name
            }
        myCheckbox.state =
            when {
              isEnhancedContextEnabled && node.repo.isEnabled && !node.repo.isIgnored ->
                  ThreeStateCheckBox.State.SELECTED
              node.repo.isEnabled -> ThreeStateCheckBox.State.DONT_CARE
              else -> ThreeStateCheckBox.State.NOT_SELECTED
            }
        myCheckbox.isEnabled =
            isEnhancedContextEnabled &&
                node.repo.inclusion != RepoInclusion.AUTO &&
                node.repo.selectionStatus != RepoSelectionStatus.NOT_FOUND
        myCheckbox.toolTipText =
            when {
              node.repo.inclusion == RepoInclusion.AUTO ->
                  CodyBundle.getString("context-panel.tree.node-auto.tooltip")
              node.repo.selectionStatus == RepoSelectionStatus.NOT_FOUND ->
                  CodyBundle.getString("context-panel.tree.node-remote-repo.not-found")
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
