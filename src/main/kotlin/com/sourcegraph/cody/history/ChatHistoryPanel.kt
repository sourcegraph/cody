package com.sourcegraph.cody.history

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.treeStructure.SimpleTree
import com.intellij.util.EditSourceOnDoubleClickHandler
import com.intellij.util.IconUtil
import com.intellij.util.ui.JBEmptyBorder
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.chat.actions.ExportChatsAction
import com.sourcegraph.cody.chat.actions.ExportChatsAction.Companion.INTERNAL_ID_DATA_KEY
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.history.node.LeafNode
import com.sourcegraph.cody.history.node.PeriodNode
import com.sourcegraph.cody.history.node.RootNode
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.ui.DurationGroupFormatter
import com.sourcegraph.cody.history.ui.HistoryTreeNodeRenderer
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.ui.DumbAwareBGTAction
import java.awt.BorderLayout
import java.awt.event.ActionEvent
import java.awt.event.KeyEvent
import javax.swing.AbstractAction
import javax.swing.Icon
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.KeyStroke
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath
import javax.swing.tree.TreeSelectionModel

class ChatHistoryPanel(
    private val project: Project,
    private val onSelect: (ChatState) -> Unit,
    private val onRemove: (ChatState) -> Unit,
    private val onRemoveAll: () -> Unit
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
        actionMap.put(ENTER_MAP_KEY, ActionWrapper(::selectLeaf))
        actionMap.put(DELETE_MAP_KEY, ActionWrapper(::removeLeaf))
      }

  private val exportAction = ActionManager.getInstance().getAction("cody.exportChats")

  private val exportChatsAsJson =
      object : JButton("Export All Chats As JSON", IconUtil.desaturate(Icons.Chat.Download)) {

        init {
          addActionListener { triggerChatExportAction(internalId = null) }
        }

        override fun isEnabled(): Boolean {
          return super.isEnabled() && !ExportChatsAction.isRunning.get()
        }
      }

  init {
    val group = DefaultActionGroup()
    group.add(
        LeafPopupAction(
            CodyBundle.getString("popup.select-chat"), null, ::hasLeafSelected, ::selectLeaf))
    group.add(
        LeafPopupAction(
            text = CodyBundle.getString("popup.export-chat"),
            icon = Icons.Chat.Download,
            isEnabled = { hasLeafSelected() && !ExportChatsAction.isRunning.get() },
            action = { triggerChatExportAction(internalId = getSelectedLeaf()?.chat?.internalId) }))
    group.add(
        LeafPopupAction(
            CodyBundle.getString("popup.remove-chat"),
            AllIcons.Actions.GC,
            ::hasLeafSelected,
            ::removeLeaf))
    group.addSeparator()
    group.add(
        LeafPopupAction(
            CodyBundle.getString("popup.remove-all-chats"),
            AllIcons.Actions.GC,
            isEnabled = { true },
            ::removeAllLeafs))

    PopupHandler.installPopupMenu(tree, group, "ChatActionsPopup")
    EditSourceOnDoubleClickHandler.install(tree, ::selectLeaf)
    val scrollPane = ScrollPaneFactory.createScrollPane(tree)
    val wrapper = JPanel(BorderLayout())
    wrapper.add(scrollPane, BorderLayout.CENTER)

    val actionWrapper = JPanel()
    actionWrapper.add(exportChatsAsJson)
    actionWrapper.border = JBEmptyBorder(JBUI.insets(20))
    wrapper.add(actionWrapper, BorderLayout.SOUTH)

    setContent(wrapper)
    HistoryService.getInstance(project).listenOnUpdate(::updatePresentation)
  }

  fun rebuildTree() {
    model.setRoot(buildTree())
  }

  private fun updatePresentation(chat: ChatState) {
    val leafNotInTree =
        root.periods().flatMap { it.leafs() }.none { it.chat.internalId == chat.internalId }
    if (leafNotInTree) {
      val periodText = DurationGroupFormatter.format(chat.getUpdatedTimeAt())
      val period = root.periods().find { it.periodText == periodText }
      if (period == null) {
        val newPeriod = PeriodNode(periodText)
        val newLeaf = LeafNode(chat)
        newPeriod.add(newLeaf)
        val newRoot = RootNode()
        newRoot.add(newPeriod)
        root.periods().forEach { newRoot.add(it) }
        model.setRoot(newRoot)
      } else {
        addChatToPeriodAndSort(period, chat)
      }
    } else {
      val currentPeriodText = DurationGroupFormatter.format(chat.getUpdatedTimeAt())
      val currentPeriod =
          root.periods().find { it.periodText == currentPeriodText }
              ?: PeriodNode(currentPeriodText)
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
        addChatToPeriodAndSort(currentPeriod, chat)
        model.reload(currentPeriod)
      } else {
        val sorted = currentPeriod.leafs().sortedByDescending { it.chat.getUpdatedTimeAt() }
        if (currentPeriod.leafs() != sorted) {
          currentPeriod.removeAllChildren()
          for (child in sorted) currentPeriod.add(child)
          model.reload(currentPeriod)
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

  private fun selectLeaf() {
    getSelectedLeaf()?.let { onSelect(it.chat) }
  }

  private fun triggerChatExportAction(internalId: String?) {
    exportAction.actionPerformed(
        AnActionEvent(
            /* inputEvent = */ null,
            /* dataContext = */ { dataId ->
              when (dataId) {
                CommonDataKeys.PROJECT.name -> project
                INTERNAL_ID_DATA_KEY.name -> internalId
                else -> null
              }
            },
            /* place = */ ActionPlaces.UNKNOWN,
            /* presentation = */ Presentation(),
            /* actionManager = */ ActionManager.getInstance(),
            /* modifiers = */ 0))
  }

  private fun removeLeaf() {
    getSelectedLeaf()?.let { selectedLeaf ->
      val period = selectedLeaf.parent as PeriodNode
      val selectedIndex = period.getIndex(selectedLeaf)
      onRemove(selectedLeaf.chat)
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

  private fun removeAllLeafs() {
    onRemoveAll()
    model.setRoot(RootNode())
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
      HistoryService.getInstance(project)
          .state
          .chats
          .filter {
            it.accountId == CodyAuthenticationManager.getInstance(project).getActiveAccount()?.id
          }
          .filter { it.messages.isNotEmpty() }
          .sortedByDescending { chat -> chat.getUpdatedTimeAt() }
          .groupBy { chat -> DurationGroupFormatter.format(chat.getUpdatedTimeAt()) }

  private class LeafPopupAction(
      text: String,
      icon: Icon?,
      private val isEnabled: () -> Boolean,
      private val action: () -> Unit
  ) : DumbAwareBGTAction(text, null, icon) {

    override fun update(e: AnActionEvent) {
      e.presentation.isEnabled = isEnabled()
    }

    override fun actionPerformed(event: AnActionEvent) = action()
  }

  private class ActionWrapper(private val action: () -> Unit) : AbstractAction() {

    override fun actionPerformed(p0: ActionEvent?) = action()
  }

  private fun getSelectedLeaf() = tree.selectionPath?.lastPathComponent as? LeafNode

  private fun hasLeafSelected() = tree.selectionPath?.lastPathComponent is LeafNode

  private companion object {

    private const val ENTER_MAP_KEY = "enter"
    private const val DELETE_MAP_KEY = "delete"
  }
}
