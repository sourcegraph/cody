package com.sourcegraph.cody.context.ui

import com.intellij.ide.BrowserUtil
import com.intellij.ide.HelpTooltip
import com.intellij.openapi.actionSystem.ActionToolbarPosition
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.openapi.ui.getTreePath
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckboxTreeBase
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.TitledSeparator
import com.intellij.ui.ToolbarDecorator
import com.intellij.ui.ToolbarDecorator.createDecorator
import com.intellij.ui.awt.RelativePoint
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.EnhancedContextContextT
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.agent.protocol.Repo
import com.sourcegraph.cody.chat.ChatSession
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.context.*
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.Point
import java.awt.event.ActionEvent
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.*
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeExpansionListener
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreeSelectionModel
import kotlin.math.max

/**
 * A panel for configuring context in chats. Consumer and Enterprise context panels are designed
 * around a tree whose layout grows and shrinks as the tree view nodes are expanded and collapsed.
 */
abstract class EnhancedContextPanel
@RequiresEdt
constructor(protected val project: Project, protected val chatSession: ChatSession) : JPanel() {
  init {
    // TODO: When Kotlin @RequiresEdt annotations are instrumented, remove this manual assertion.
    ApplicationManager.getApplication().assertIsDispatchThread()
  }

  companion object {
    /** Creates an EnhancedContextPanel for `chatSession`. */
    fun create(project: Project, chatSession: ChatSession): EnhancedContextPanel {
      val isDotcomAccount =
          CodyAuthenticationManager.getInstance(project).getActiveAccount()?.isDotcomAccount()
              ?: false
      return if (isDotcomAccount) {
        ConsumerEnhancedContextPanel(project, chatSession)
      } else {
        EnterpriseEnhancedContextPanel(project, chatSession)
      }
    }
  }

  /** Gets whether enhanced context is enabled. */
  val isEnhancedContextEnabled: Boolean
    get() = enhancedContextEnabled.get()

  /**
   * Whether enhanced context is enabled. Set this when enhance context is toggled in the panel UI.
   * This is read on background threads by `isEnhancedContextEnabled`.
   */
  protected val enhancedContextEnabled = AtomicBoolean(true)

  /**
   * Sets this EnhancedContextPanel's configuration as the project's default enhanced context state.
   */
  fun setContextFromThisChatAsDefault() {
    ApplicationManager.getApplication().executeOnPooledThread {
      getContextState()?.let { HistoryService.getInstance(project).updateDefaultContextState(it) }
    }
  }

  /** Gets the chat session's enhanced context state. */
  protected fun getContextState(): EnhancedContextState? {
    if (CodyAuthenticationManager.getInstance(project).getActiveAccount() == null) {
      // There is no active account, so there is no enhanced context either
      return null
    }
    val historyService = HistoryService.getInstance(project)
    return historyService.getContextReadOnly(chatSession.getInternalId())
        ?: historyService.getDefaultContextReadOnly()
  }

  /** Reads, modifies, and writes back the chat's enhanced context state. */
  protected fun updateContextState(modifyContext: (EnhancedContextState) -> Unit) {
    val contextState = getContextState() ?: EnhancedContextState()
    modifyContext(contextState)
    HistoryService.getInstance(project)
        .updateContextState(chatSession.getInternalId(), contextState)
    HistoryService.getInstance(project).updateDefaultContextState(contextState)
  }

  /**
   * The root node of the tree view. This node is not visible. Add entries to the enhanced context
   * treeview as roots of this node.
   */
  protected val treeRoot = CheckedTreeNode(CodyBundle.getString("context-panel.tree.root"))

  /**
   * The mutable model of tree nodes. Call `treeModel.reload()`, etc. when the tree model changes.
   */
  protected val treeModel = DefaultTreeModel(treeRoot)

  /** The tree component. */
  protected val tree = run {
    val checkPolicy = createCheckboxPolicy()
    object :
            CheckboxTree(
                ContextRepositoriesCheckboxRenderer(enhancedContextEnabled),
                treeRoot,
                checkPolicy) {
          // When collapsed, the horizontal scrollbar obscures the Chat Context summary & checkbox.
          // Prefer to clip. Users can resize the sidebar if desired.
          override fun getScrollableTracksViewportWidth(): Boolean = true
        }
        .apply { selectionModel.selectionMode = TreeSelectionModel.SINGLE_TREE_SELECTION }
  }

  protected abstract fun createCheckboxPolicy(): CheckboxTreeBase.CheckPolicy

  init {
    layout = VerticalFlowLayout(VerticalFlowLayout.BOTTOM, 0, 0, true, false)
    tree.model = treeModel
  }

  /** Creates the component with the enhanced context panel UI. */
  protected abstract fun createPanel(): JComponent

  val panel = createPanel()

  init {
    // TODO: Resizing synchronously causes the element *now* under the pointer to get a click on
    // mouse up, which can
    // check/uncheck a checkbox you were not aiming at.
    tree.addTreeExpansionListener(
        object : TreeExpansionListener {
          override fun treeExpanded(event: TreeExpansionEvent) {
            if (event.path.pathCount == 2) {
              // The top-level node was expanded, so expand the entire tree.
              expandAllNodes()
            }
            resize()
          }

          override fun treeCollapsed(event: TreeExpansionEvent) {
            resize()
          }
        })

    add(panel)
  }

  /**
   * Adjusts the layout to accommodate the expanded rows in the treeview, and revalidates layout.
   */
  @RequiresEdt abstract fun resize()

  @RequiresEdt
  private fun expandAllNodes(rowCount: Int = tree.rowCount) {
    for (i in 0 until tree.rowCount) {
      tree.expandRow(i)
    }

    if (tree.getRowCount() != rowCount) {
      expandAllNodes(tree.rowCount)
    }
  }

  abstract fun updateFromAgent(enhancedContextStatus: EnhancedContextContextT)

  abstract fun updateFromSavedState(state: EnhancedContextState)
}

class EnterpriseEnhancedContextPanel(project: Project, chatSession: ChatSession) :
    EnhancedContextPanel(project, chatSession) {
  companion object {
    fun JBPopup.showAbove(component: JComponent) {
      val northWest = RelativePoint(component, Point(0, -this.size.height))
      show(northWest)
    }

    private const val ENTER_MAP_KEY = "enter"
  }

  // TODO: We need to kick off setting the agent state with
  // controller.loadFrom...(getContextState()) etc.
  private var controller =
      EnterpriseEnhancedContextStateController(
          project,
          object : ChatEnhancedContextStateProvider {
            override fun updateSavedState(modifyContext: (EnhancedContextState) -> Unit) {
              runInEdt { updateContextState(modifyContext) }
            }

            override fun updateAgentState(repos: List<Repo>) {
              chatSession.sendWebviewMessage(
                  WebviewMessage(
                      command = "context/choose-remote-search-repo", explicitRepos = repos))
            }

            override fun updateUI(repos: List<RemoteRepo>) {
              runInEdt { updateTree(repos) }
            }

            override fun notifyRemoteRepoResolutionFailed() = runInEdt {
              RemoteRepoResolutionFailedNotification().notify(project)
            }

            override fun notifyRemoteRepoLimit() = runInEdt {
              RemoteRepoLimitNotification().notify(project)
            }
          })

  private var endpointName: String = ""

  private val repoPopupController =
      RemoteRepoPopupController(project).apply {
        onAccept = { spec ->
          ApplicationManager.getApplication().executeOnPooledThread {
            controller.updateRawSpec(spec)
          }
        }
      }

  init {
    tree.inputMap.put(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), ENTER_MAP_KEY)
    tree.actionMap.put(
        ENTER_MAP_KEY,
        object : AbstractAction() {
          override fun actionPerformed(e: ActionEvent) {
            repoPopupController
                .createPopup(tree.width, endpointName, controller.rawSpec)
                .showAbove(tree)
          }
        })

    tree.addMouseListener(
        object : MouseAdapter() {
          fun targetForEvent(e: MouseEvent): Any? =
              tree.getClosestPathForLocation(e.x, e.y)?.lastPathComponent

          // We cache the target of the mouse press, so that if the tree expands before the click
          // event is generated, we can detect the mouse click event is on a different node and
          // suppress the popup.
          private var pressedTarget: Any? = null

          override fun mousePressed(e: MouseEvent) {
            super.mousePressed(e)
            pressedTarget = targetForEvent(e)
          }

          override fun mouseClicked(e: MouseEvent) {
            var clickTarget = targetForEvent(e)
            if (e.clickCount == 1 &&
                e.button == MouseEvent.BUTTON1 &&
                pressedTarget === clickTarget &&
                clickTarget is ContextTreeEditReposNode) {
              repoPopupController
                  .createPopup(tree.width, endpointName, controller.rawSpec)
                  .showAbove(tree)
            }
          }
        })
  }

  @RequiresEdt
  override fun createPanel(): JComponent {
    val separator = TitledSeparator(CodyBundle.getString("chat.enhanced_context.title"), tree)
    HelpTooltip()
        .setTitle(CodyBundle.getString("context-panel.tree.help-tooltip.title"))
        .setDescription(
            CodyBundle.getString("context-panel.tree.help-tooltip.description")
                .fmt(MAX_REMOTE_REPOSITORY_COUNT.toString()))
        .setLink(CodyBundle.getString("context-panel.tree.help-tooltip.link.text")) {
          BrowserUtil.open(CodyBundle.getString("context-panel.tree.help-tooltip.link.href"))
        }
        .setLocation(HelpTooltip.Alignment.LEFT)
        .setInitialDelay(
            1500) // Tooltip can interfere with the treeview, so cool off on showing it.
        .installOn(separator)

    val panel = JPanel()
    panel.layout = BorderLayout()
    panel.add(separator, BorderLayout.NORTH)
    panel.add(tree, BorderLayout.CENTER)
    return panel
  }

  override fun resize() {
    val padding = 5
    tree.preferredSize = Dimension(0, padding + tree.rowCount * tree.rowHeight)
    panel.parent?.revalidate()
  }

  override fun createCheckboxPolicy(): CheckboxTreeBase.CheckPolicy =
      CheckboxTreeBase.CheckPolicy(
          /* checkChildrenWithCheckedParent = */ false,
          /* uncheckChildrenWithUncheckedParent = */ false,
          /* checkParentWithCheckedChild = */ false,
          /* uncheckParentWithUncheckedChild = */ false)

  override fun updateFromAgent(enhancedContextStatus: EnhancedContextContextT) {
    ApplicationManager.getApplication().executeOnPooledThread {
      controller.updateFromAgent(enhancedContextStatus)
    }
  }

  override fun updateFromSavedState(state: EnhancedContextState) {
    controller.loadFromChatState(state.remoteRepositories)
  }

  private val contextRoot =
      object :
          ContextTreeEnterpriseRootNode(0, { checked -> enhancedContextEnabled.set(checked) }) {
        override fun isChecked(): Boolean {
          return enhancedContextEnabled.get()
        }
      }

  private val editReposNode =
      ContextTreeEditReposNode(false) {
        val popup = repoPopupController.createPopup(tree.width, endpointName, controller.rawSpec)
        popup.showAbove(tree)
      }

  init {
    controller.loadFromChatState(getContextState()?.remoteRepositories)
    endpointName =
        CodyAuthenticationManager.getInstance(project).getActiveAccount()?.server?.displayName
            ?: CodyBundle.getString("context-panel.remote-repo.generic-endpoint-name")

    treeRoot.add(contextRoot)
    treeModel.reload()
    resize()
  }

  @RequiresEdt
  private fun updateTree(repos: List<RemoteRepo>) {
    // TODO: When Kotlin @RequiresEdt annotations are instrumented, remove this manual assertion.
    ApplicationManager.getApplication().assertIsDispatchThread()

    val remotesPath = treeModel.getTreePath(contextRoot.userObject)
    val wasExpanded = remotesPath != null && tree.isExpanded(remotesPath)
    contextRoot.removeAllChildren()
    repos
        .map { repo ->
          ContextTreeRemoteRepoNode(repo) {
            ApplicationManager.getApplication().executeOnPooledThread {
              controller.setRepoEnabledInContextState(repo.name, !repo.isEnabled)
            }
          }
        }
        .forEach { contextRoot.add(it) }

    // Add the node to add/edit the repository list.
    editReposNode.hasRemovableRepos = repos.count { it.inclusion == RepoInclusion.MANUAL } > 0
    contextRoot.add(editReposNode)

    contextRoot.numActiveRepos = repos.count { it.isEnabled }
    treeModel.reload(contextRoot)
    if (wasExpanded) {
      tree.expandPath(remotesPath)
    }

    resize()
  }
}

class ConsumerEnhancedContextPanel(project: Project, chatSession: ChatSession) :
    EnhancedContextPanel(project, chatSession) {
  private val enhancedContextNode =
      ContextTreeRootNode(CodyBundle.getString("context-panel.tree.node-chat-context")) { isChecked
        ->
        enhancedContextEnabled.set(isChecked)
        updateContextState { it.isEnabled = isChecked }
      }

  private val localContextNode =
      ContextTreeLocalRootNode(
          CodyBundle.getString("context-panel.tree.node-local-project"), enhancedContextEnabled)
  private val localProjectNode = ContextTreeLocalRepoNode(project, enhancedContextEnabled)

  private fun prepareTree() {
    treeRoot.add(enhancedContextNode)
    localContextNode.add(localProjectNode)
    enhancedContextNode.add(localContextNode)

    val contextState = getContextState()
    updateFromSavedState(contextState ?: EnhancedContextState())

    treeModel.reload()
    resize()
  }

  private var toolbar: ToolbarDecorator? = null

  @RequiresEdt
  override fun createPanel(): JComponent {
    val toolbar =
        createDecorator(tree)
            .disableUpDownActions()
            .setToolbarPosition(ActionToolbarPosition.RIGHT)
            .setVisibleRowCount(1)
            .setScrollPaneBorder(BorderFactory.createEmptyBorder())
            .setToolbarBorder(BorderFactory.createEmptyBorder())
            .addExtraAction(ReindexButton(project))
            .addExtraAction(HelpButton())
    this.toolbar = toolbar
    return toolbar.createPanel()
  }

  override fun createCheckboxPolicy(): CheckboxTreeBase.CheckPolicy =
      CheckboxTreeBase.CheckPolicy(
          /* checkChildrenWithCheckedParent = */ true,
          /* uncheckChildrenWithUncheckedParent = */ true,
          /* checkParentWithCheckedChild = */ true,
          /* uncheckParentWithUncheckedChild = */ false)

  override fun resize() {
    val padding = 5
    // Set the minimum size to accommodate at least one toolbar button and an overflow ellipsis.
    // Because the buttons
    // are approximately square, use the toolbar width as a proxy for the button height.
    val toolbarButtonHeight = toolbar?.actionsPanel?.preferredSize?.width ?: 0
    val preferredSizeNumVisibleButtons = 1
    panel.preferredSize =
        Dimension(
            0,
            padding +
                max(
                    tree.rowCount * tree.rowHeight,
                    preferredSizeNumVisibleButtons * toolbarButtonHeight))
    panel.parent?.revalidate()
  }

  override fun updateFromAgent(enhancedContextStatus: EnhancedContextContextT) {
    // No-op. The consumer panel relies solely on JetBrains-side state.
  }

  override fun updateFromSavedState(state: EnhancedContextState) {
    ApplicationManager.getApplication().invokeLater {
      enhancedContextNode.isChecked = state.isEnabled ?: true
    }
  }

  init {
    prepareTree()
  }
}
