package com.sourcegraph.cody.context.ui

import com.intellij.ide.BrowserUtil
import com.intellij.ide.HelpTooltip
import com.intellij.openapi.actionSystem.ActionToolbarPosition
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.openapi.ui.getTreePath
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckboxTreeBase
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.ToolbarDecorator.createDecorator
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.vcs.commit.NonModalCommitPanel.Companion.showAbove
import com.sourcegraph.cody.agent.EnhancedContextContextT
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.chat.ChatSession
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.context.RemoteRepo
import com.sourcegraph.cody.context.RemoteRepoUtils
import com.sourcegraph.cody.context.RepoInclusion
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.RemoteRepositoryState
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.vcs.CodebaseName
import java.awt.Dimension
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeExpansionListener
import javax.swing.tree.DefaultTreeModel
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
            ContextRepositoriesCheckboxRenderer(enhancedContextEnabled), treeRoot, checkPolicy) {
      // When collapsed, the horizontal scrollbar obscures the Chat Context summary & checkbox.
      // Prefer to clip. Users can resize the sidebar if desired.
      override fun getScrollableTracksViewportWidth(): Boolean = true
    }
  }

  protected abstract fun createCheckboxPolicy(): CheckboxTreeBase.CheckPolicy

  /** The toolbar decorator component. */
  protected val toolbar = run {
    createDecorator(tree)
        .disableUpDownActions()
        .setToolbarPosition(ActionToolbarPosition.RIGHT)
        .setVisibleRowCount(1)
        .setScrollPaneBorder(BorderFactory.createEmptyBorder())
        .setToolbarBorder(BorderFactory.createEmptyBorder())
  }

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
  @RequiresEdt
  protected fun resize() {
    val padding = 5
    // Set the minimum size to accommodate at least one toolbar button and an overflow ellipsis.
    // Because the buttons
    // are approximately square, use the toolbar width as a proxy for the button height.
    val toolbarButtonHeight = toolbar.actionsPanel.preferredSize.width
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
}

class EnterpriseEnhancedContextPanel(project: Project, chatSession: ChatSession) :
    EnhancedContextPanel(project, chatSession) {
  // Cache the raw user input so the user can reopen the popup to make corrections without starting
  // from scratch.
  private var rawSpec: String = ""

  @RequiresEdt
  override fun createPanel(): JComponent {
    toolbar.setEditActionName(CodyBundle.getString("context-panel.button.edit-repositories"))
    toolbar.setEditAction {
      val controller = RemoteRepoPopupController(project)
      controller.onAccept = { spec ->
        rawSpec = spec
        ApplicationManager.getApplication().executeOnPooledThread { applyRepoSpec(spec) }
      }

      val popup = controller.createPopup(tree.width, rawSpec)
      popup.showAbove(tree)
    }
    return toolbar.createPanel()
  }

  override fun createCheckboxPolicy(): CheckboxTreeBase.CheckPolicy =
      CheckboxTreeBase.CheckPolicy(
          /* checkChildrenWithCheckedParent = */ true,
          /* uncheckChildrenWithUncheckedParent = */ true,
          /* checkParentWithCheckedChild = */ true,
          /* uncheckParentWithUncheckedChild = */ false)

  override fun updateFromAgent(enhancedContextStatus: EnhancedContextContextT) {
    val repos = mutableListOf<RemoteRepo>()

    for (group in enhancedContextStatus.groups) {
      val provider = group.providers.firstOrNull() ?: continue
      val name = group.displayName
      val enabled = provider.state == "ready"
      val ignored = provider.isIgnored == true
      val inclusion =
          when (provider.inclusion) {
            "auto" -> RepoInclusion.AUTO
            "explicit" -> RepoInclusion.MANUAL
            else -> null
          }
      repos.add(RemoteRepo(name, isEnabled = enabled, isIgnored = ignored, inclusion = inclusion))
    }

    runInEdt {
      updateTree(repos)
      resize()
    }
  }

  private val remotesNode = ContextTreeRemotesNode()
  private val contextRoot =
      object :
          ContextTreeEnterpriseRootNode(
              "", 0, 0, { checked -> enhancedContextEnabled.set(checked) }) {
        override fun isChecked(): Boolean {
          return enhancedContextEnabled.get()
        }
      }

  init {
    val contextState = getContextState()

    val cleanedRepos =
        contextState?.remoteRepositories?.filter { it.codebaseName != null }?.toSet()?.toList()
            ?: emptyList()
    rawSpec = cleanedRepos.map { it.codebaseName }.joinToString("\n")

    val endpoint =
        CodyAuthenticationManager.getInstance(project).getActiveAccount()?.server?.displayName
            ?: CodyBundle.getString("context-panel.remote-repo.generic-endpoint-name")
    contextRoot.endpointName = endpoint
    contextRoot.add(remotesNode)

    treeRoot.add(contextRoot)
    treeModel.reload()
    resize()

    HelpTooltip()
        .setTitle(CodyBundle.getString("context-panel.tree.help-tooltip.title"))
        .setDescription(
            CodyBundle.getString("context-panel.tree.help-tooltip.description")
                .fmt(MAX_REMOTE_REPOSITORY_COUNT.toString(), endpoint))
        .setLink(CodyBundle.getString("context-panel.tree.help-tooltip.link.text")) {
          BrowserUtil.open(CodyBundle.getString("context-panel.tree.help-tooltip.link.href"))
        }
        .setLocation(HelpTooltip.Alignment.LEFT)
        .setInitialDelay(
            1500) // Tooltip can interfere with the treeview, so cool off on showing it.
        .installOn(tree)

    // Update the Agent-side state for this chat.
    val enabledRepos = cleanedRepos.filter { it.isEnabled }.mapNotNull { it.codebaseName }
    RemoteRepoUtils.resolveReposWithErrorNotification(
        project, enabledRepos.map { CodebaseName(it) }) { repos ->
          chatSession.sendWebviewMessage(
              WebviewMessage(command = "context/choose-remote-search-repo", explicitRepos = repos))
        }
  }

  @RequiresEdt
  private fun updateTree(enabledRepos: List<RemoteRepo>) {
    // TODO: When Kotlin @RequiresEdt annotations are instrumented, remove this manual assertion.
    ApplicationManager.getApplication().assertIsDispatchThread()

    val remotesPath = treeModel.getTreePath(remotesNode.userObject)
    val wasExpanded = remotesPath != null && tree.isExpanded(remotesPath)
    val remoteNodes = remotesNode.children().toList().filterIsInstance<ContextTreeRemoteRepoNode>()

    remoteNodes.forEach { node ->
      node.repo.isEnabled = enabledRepos.find { it.name == node.repo.name } != null
    }

    enabledRepos.forEach { repo ->
      val remoteNode = remoteNodes.find { it.repo.name == repo.name }
      if (remoteNode == null) {
        remotesNode.add(
            ContextTreeRemoteRepoNode(repo) { checked ->
              setRepoEnabledInContextState(repo.name, checked)
            })
      }
    }

    contextRoot.numRepos = enabledRepos.count { it.isIgnored != true }
    contextRoot.numIgnoredRepos = enabledRepos.count { it.isIgnored == true }
    treeModel.reload(contextRoot)
    if (wasExpanded) {
      tree.expandPath(remotesPath)
    }
  }

  // Given a textual list of repos, extract a best effort list of repositories from it and update
  // context settings.
  private fun applyRepoSpec(spec: String) {
    val repos =
        spec
            .split(Regex("""\s+"""))
            .filter { it -> it != "" }
            .toSet()
            .take(MAX_REMOTE_REPOSITORY_COUNT)
    RemoteRepoUtils.resolveReposWithErrorNotification(
        project, repos.map { it -> CodebaseName(it) }.toList()) { trimmedRepos ->
          runInEdt {
            // Update the plugin's copy of the state.
            updateContextState { state ->
              state.remoteRepositories.clear()
              state.remoteRepositories.addAll(
                  trimmedRepos.map { repo ->
                    RemoteRepositoryState().apply {
                      codebaseName = repo.name
                      isEnabled = true
                    }
                  })
            }

            // Update the Agent state. This triggers the tree view update.
            chatSession.sendWebviewMessage(
                WebviewMessage(
                    command = "context/choose-remote-search-repo", explicitRepos = trimmedRepos))
          }
        }
  }

  private fun setRepoEnabledInContextState(repoName: String, enabled: Boolean) {
    var enabledRepos = listOf<CodebaseName>()

    updateContextState { contextState ->
      contextState.remoteRepositories.find { it.codebaseName == repoName }?.isEnabled = enabled
      enabledRepos =
          contextState.remoteRepositories
              .filter { it.isEnabled }
              .mapNotNull { it.codebaseName }
              .map { CodebaseName(it) }
    }

    RemoteRepoUtils.getRepositories(project, enabledRepos)
        .completeOnTimeout(null, 15, TimeUnit.SECONDS)
        .thenApply { repos ->
          if (repos == null) {
            runInEdt { RemoteRepoResolutionFailedNotification().notify(project) }
            return@thenApply
          }
          chatSession.sendWebviewMessage(
              WebviewMessage(command = "context/choose-remote-search-repo", explicitRepos = repos))
        }
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
    ApplicationManager.getApplication().invokeLater {
      enhancedContextNode.isChecked = contextState?.isEnabled ?: true
    }

    treeModel.reload()
    resize()
  }

  @RequiresEdt
  override fun createPanel(): JComponent {
    toolbar.addExtraAction(ReindexButton(project))
    toolbar.addExtraAction(HelpButton())
    return toolbar.createPanel()
  }

  override fun createCheckboxPolicy(): CheckboxTreeBase.CheckPolicy =
      CheckboxTreeBase.CheckPolicy(
          /* checkChildrenWithCheckedParent = */ true,
          /* uncheckChildrenWithUncheckedParent = */ true,
          /* checkParentWithCheckedChild = */ true,
          /* uncheckParentWithUncheckedChild = */ false)

  override fun updateFromAgent(enhancedContextStatus: EnhancedContextContextT) {
    // No-op. The consumer panel relies solely on JetBrains-side state.
  }

  init {
    prepareTree()
  }
}
