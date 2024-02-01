package com.sourcegraph.cody.history

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.treeStructure.SimpleTree
import com.intellij.util.EditSourceOnDoubleClickHandler
import com.sourcegraph.cody.history.node.LeafNode
import com.sourcegraph.cody.history.node.PeriodNode
import com.sourcegraph.cody.history.node.RootNode
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.ui.DurationGroupFormatter
import com.sourcegraph.cody.history.ui.HistoryTreeNodeRenderer
import com.sourcegraph.common.CodyBundle
import java.awt.event.ActionEvent
import java.awt.event.KeyEvent
import javax.swing.AbstractAction
import javax.swing.Icon
import javax.swing.KeyStroke
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath
import javax.swing.tree.TreeSelectionModel

class HistoryTree(
    private val onSelect: (ChatState) -> Unit,
    private val onDelete: (ChatState) -> Unit
) : SimpleToolWindowPanel(true, true) {

  private val model = DefaultTreeModel(buildTree())
  private val root
    get() = model.root as RootNode

  private val tree =
      SimpleTree(model).apply {
        isRootVisible = false
        cellRenderer = HistoryTreeNodeRenderer()
        selectionModel.selectionMode = TreeSelectionModel.SINGLE_TREE_SELECTION
        inputMap.put(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), ENTER_MAP_KEY)
        inputMap.put(KeyStroke.getKeyStroke(KeyEvent.VK_DELETE, 0), DELETE_MAP_KEY)
        actionMap.put(ENTER_MAP_KEY, ActionWrapper(::selectSelected))
        actionMap.put(DELETE_MAP_KEY, ActionWrapper(::deleteSelected))
      }

  init {
    val group = DefaultActionGroup()
    group.add(
        LeafPopupAction(tree, CodyBundle.getString("popup.select-chat"), null, ::selectSelected))
    group.addSeparator()
    group.add(
        LeafPopupAction(
            tree, CodyBundle.getString("popup.remove-chat"), AllIcons.Actions.GC, ::deleteSelected))
    PopupHandler.installPopupMenu(tree, group, "ChatActionsPopup")
    EditSourceOnDoubleClickHandler.install(tree, ::selectSelected)
    setContent(ScrollPaneFactory.createScrollPane(tree))
    HistoryService.getInstance().listenOnUpdate(::updatePresentation)
  }

  private fun updatePresentation(chat: ChatState) {
    val leafNotInTree =
        root.periods().flatMap { it.leafs() }.none { it.chat.internalId == chat.internalId }
    if (leafNotInTree) {
      val periodText = DurationGroupFormatter.format(chat.getUpdatedTimeAt())
      val periodNotInTree = root.periods().none { it.periodText == periodText }
      if (periodNotInTree) {
        val newPeriod = PeriodNode(periodText)
        val newLeaf = LeafNode(chat)
        root.add(newPeriod.also { it.add(newLeaf) })
        model.reload(root)
      } else {
        val period = root.periods().find { it.periodText == periodText }!!
        addChatToPeriodAndSort(period, chat)
      }
    } else {
      val currentPeriodText = DurationGroupFormatter.format(chat.getUpdatedTimeAt())
      val currentPeriod = root.periods().find { it.periodText == currentPeriodText }
      val leafWithChangedPeriod =
          root
              .periods()
              .filter { it.periodText != currentPeriodText }
              .flatMap { it.leafs() }
              .find { it.chat.internalId == chat.internalId }

      if (leafWithChangedPeriod != null) {
        val previousPeriod = leafWithChangedPeriod.parent as? PeriodNode
        previousPeriod?.let { period ->
          period.remove(leafWithChangedPeriod)
          if (period.childCount == 0) period.removeFromParent()
          model.reload(period)
        }
        currentPeriod?.let { period ->
          addChatToPeriodAndSort(period, chat)
          model.reload(period)
        }
      } else {
        currentPeriod?.let { period ->
          val sorted = period.leafs().sortedByDescending { it.chat.getUpdatedTimeAt() }
          if (period.leafs() != sorted) {
            period.removeAllChildren()
            for (child in sorted) period.add(child)
            model.reload(period)
          }
        }
      }
    }
  }

  private fun addChatToPeriodAndSort(period: PeriodNode, chat: ChatState) {
    val extended = period.leafs() + LeafNode(chat)
    val sorted = extended.sortedByDescending { it.chat.getUpdatedTimeAt() }
    period.removeAllChildren()
    for (child in sorted) period.add(child)
    model.reload(period)
  }

  private fun selectSelected() {
    tree.selectedLeafOrNull()?.let { onSelect(it.chat) }
  }

  private fun deleteSelected() {
    tree.selectedLeafOrNull()?.let { selectedLeaf ->
      val period = selectedLeaf.parent as PeriodNode
      val selectedIndex = period.getIndex(selectedLeaf)
      onDelete(selectedLeaf.chat)
      model.removeNodeFromParent(selectedLeaf)
      if (model.getChildCount(period) == 0) model.removeNodeFromParent(period)

      val leafsCount = period.childCount
      if (leafsCount > 0) {
        val newIndex = if (selectedIndex < leafsCount) selectedIndex else selectedIndex - 1
        val previousLeaf = period.getChildAt(newIndex) as LeafNode
        val path = TreePath(previousLeaf.path)
        val row = tree.getRowForPath(path)
        tree.setSelectionRow(row)
      }
    }
  }

  private fun buildTree(): DefaultMutableTreeNode {
    val root = RootNode()
    for ((period, chats) in getChatsGroupedByPeriod()) {
      val periodNode = PeriodNode(period)
      for (chat in chats) {
        periodNode.add(LeafNode(chat))
      }
      root.add(periodNode)
    }
    return root
  }

  private fun getChatsGroupedByPeriod(): Map<String, List<ChatState>> =
      HistoryService.getInstance()
          .state
          .chats
          .sortedByDescending { chat -> chat.getUpdatedTimeAt() }
          .groupBy { chat -> DurationGroupFormatter.format(chat.getUpdatedTimeAt()) }

  private class LeafPopupAction(
      private val tree: SimpleTree,
      text: String,
      icon: Icon? = null,
      private val action: () -> Unit
  ) : AnAction(text, null, icon) {
    override fun update(e: AnActionEvent) {
      super.update(e)
      e.presentation.isEnabled = tree.selectedLeafOrNull() != null
    }

    override fun actionPerformed(event: AnActionEvent) {
      action()
    }
  }

  private class ActionWrapper(private val action: () -> Unit) : AbstractAction() {
    override fun actionPerformed(p0: ActionEvent?) {
      action()
    }
  }

  private companion object {

    private const val ENTER_MAP_KEY = "enter"
    private const val DELETE_MAP_KEY = "delete"

    private fun SimpleTree.selectedLeafOrNull() = selectionPath?.lastPathComponent as? LeafNode
  }
}
