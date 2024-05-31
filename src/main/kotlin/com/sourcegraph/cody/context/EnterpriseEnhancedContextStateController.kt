package com.sourcegraph.cody.context

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.EnhancedContextContextT
import com.sourcegraph.cody.agent.protocol.Repo
import com.sourcegraph.cody.context.RemoteRepoUtils.getRepositories
import com.sourcegraph.cody.context.ui.MAX_REMOTE_REPOSITORY_COUNT
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.RemoteRepositoryState
import com.sourcegraph.vcs.CodebaseName
import java.util.concurrent.TimeUnit

// The ephemeral, in-memory model of enterprise enhanced context state.
private class EnterpriseEnhancedContextModel {
  // What the user actually wrote
  @Volatile var rawSpec: String = ""

  // `rawSpec` after parsing and de-duping. This defines the order in which to display repositories.
  var specified: Set<String> = emptySet()

  // The names of repositories that have been manually deselected.
  var manuallyDeselected: Set<String> = emptySet()

  // What the Agent told us it is using for context.
  var configured: List<RemoteRepo> = emptyList()

  // Any repository we ever resolved. Used when re-selecting a de-selected repository without
  // re-resolving.
  val resolvedCache: MutableMap<String, Repo> = mutableMapOf()
}

/**
 * Provides the [EnterpriseEnhancedContextStateController] access to chat's representation of
 * enhanced context state. There are THREE representations:
 * - JetBrains Cody has a bespoke representation saved in its chat history. This is divorced from
 *   the TypeScript extension's saved chat history :shrug:
 * - The agent has a set of repositories that are actually used for enhanced context. This set can
 *   be read and written, however the agent may add a repository it has picked up and included
 *   automatically by examining the project.
 * - The chat sidebar UI presents a view of enhanced context to the user. (Including a text field in
 *   a popup, however that is only *read* by the controller so does not appear here--see
 *   [EnterpriseEnhancedContextStateController.updateRawSpec].)
 */
interface ChatEnhancedContextStateProvider {
  /** Updates JetBrains Cody's "chat history" copy of enhanced context state. */
  fun updateSavedState(updater: (EnhancedContextState) -> Unit)

  /** Updates the Agent-side state for the chat. */
  fun updateAgentState(repos: List<Repo>)

  /** Pushes a UI update to the chat side panel. */
  fun updateUI(repos: List<RemoteRepo>)

  /** Displays a message that remote repository resolution failed. */
  fun notifyRemoteRepoResolutionFailed()

  /** Displays a message that the user has reached the maximum number of remote repositories. */
  fun notifyRemoteRepoLimit()
}

/**
 * Reconciles the multiple, asynchronously updated copies of enhanced context state.
 *
 * Changes follow this flow:
 * 1. A chat is restored ([loadFromChatState]) which synthesizes a [rawSpec] and a
 *    `model.manuallyDeselected` set.
 * 2. When the raw spec is updated, we parse it and produce a "speculative set of repos"
 *    ([updateSpeculativeRepos]) These have not been resolved by the backend and may be totally
 *    bogus.
 * 3. When the speculative repos are resolved ([onResolvedRepos]) we can filter the
 *    `model.manuallyDeselected` ones and request the Agent to focus on a set of repositories
 *    (`chat.updateAgentState`).
 * 4. When the Agent has updated its state ([onAgentStateUpdated]) we finally learn which
 *    repositories are actually used, whether a repository is implicitly included by the Agent based
 *    on the project, and whether a repository is filtered by Context Filters.
 * 5. Finally, we can [updateUI].
 *
 * When the user updates the raw spec, the same process happens from step 2 to step 4, however we
 * also `chat.updateSavedState` to save the changes to the JetBrains-side copy of chat history.
 *
 * When the user checks and unchecks repositories, we already have all the resolved repository
 * details. We just update the JetBrains-side copy of chat history (`chat.updateSavedState`) and do
 * the `chat.updateAgentState` -> [onAgentStateUpdated] flow.
 */
class EnterpriseEnhancedContextStateController(
    val project: Project,
    val chat: ChatEnhancedContextStateProvider
) {
  private val logger = Logger.getInstance(EnterpriseEnhancedContextStateController::class.java)
  private val model_ = EnterpriseEnhancedContextModel()
  private var epoch = 0

  val rawSpec: String
    get(): String = model_.rawSpec

  private fun <T> withModel(f: (EnterpriseEnhancedContextModel) -> T): T {
    assert(!ApplicationManager.getApplication().isDispatchThread) {
      "Must not use model from EDT, it may block"
    }
    synchronized(model_) {
      return f(model_)
    }
  }

  /**
   * Loads the set of repositories from the JetBrains-side copy of chat history and starts the
   * process of resolving the mentioned repositories, configuring Agent to use them, and eventually
   * updating the UI.
   */
  fun loadFromChatState(remoteRepositories: List<RemoteRepositoryState>?) {
    val cleanedRepos =
        remoteRepositories?.filter { it.codebaseName != null }?.toSet()?.toList() ?: emptyList()

    // Start trying to resolve these cached repos. Note, we try to resolve everything, even
    // deselected repos.
    ApplicationManager.getApplication().executeOnPooledThread {
      // Remember which repositories have been manually deselected.
      withModel { model ->
        model.rawSpec = cleanedRepos.map { it.codebaseName }.joinToString("\n")
        model.manuallyDeselected =
            cleanedRepos.filter { !it.isEnabled }.mapNotNull { it.codebaseName }.toSet()
      }

      updateSpeculativeRepos(cleanedRepos.mapNotNull { it.codebaseName })
    }
  }

  /**
   * Updates the text spec of the repository list when it is edited by the user. This does not reset
   * the manually deselected set because the user may have edited an unrelated part of the spec.
   * However, if a repository is removed from the spec, we remove it from the manually deselected
   * set for it to be selected by default if it is re-added later. This saves the updated repository
   * list to the JetBrains-side copy of chat history.
   */
  fun updateRawSpec(newSpec: String) {
    val speculative = withModel { model ->
      model.rawSpec = newSpec
      val speculative = newSpec.split(Regex("""\s+""")).filter { it != "" }.toSet().toList()

      // If a repository name has been removed from the list of speculative repos, then forget that
      // it was manually deselected in order for it to be default selected if it is added back.

      // TODO: Improve the accuracy of removals when there's an Agent API that maps specified name
      // ->
      // resolved name.
      // Today we only have names go in and a set of repositories come out, in different
      // (alphabetical) order.
      model.manuallyDeselected =
          model.manuallyDeselected.filter { speculative.contains(it) }.toSet()
      speculative
    }
    updateSpeculativeRepos(speculative)
  }

  // Builds the initial list of repositories and kicks off the process of resolving them.
  private fun updateSpeculativeRepos(repos: List<String>) {
    assert(!ApplicationManager.getApplication().isDispatchThread) {
      "updateSpeculativeRepos should not be used on EDT, it may block"
    }

    var thisEpoch =
        synchronized(this) {
          withModel { model -> model.specified = repos.toSet() }
          ++epoch
        }

    // Consult the repo resolution cache.
    val resolved = mutableSetOf<Repo>()
    val toResolve = mutableSetOf<String>()
    withModel { model ->
      for (repo in repos) {
        val cached = model.resolvedCache[repo]
        when {
          cached == null -> toResolve.add(repo)
          else -> resolved.add(cached)
        }
      }
    }

    // Remotely resolve the repositories that we couldn't resolve locally.
    if (toResolve.size > 0) {
      val newlyResolvedRepos =
          getRepositories(project, toResolve.map { CodebaseName(it) }.toList())
              .completeOnTimeout(emptyList(), 15, TimeUnit.SECONDS)
              .get()

      // Update the cache of resolved repositories.
      withModel { model -> model.resolvedCache.putAll(newlyResolvedRepos.associateBy { it.name }) }

      resolved.addAll(newlyResolvedRepos)
    }

    synchronized(this) {
      if (epoch != thisEpoch) {
        // We've kicked off another update in the meantime, so run with that one.
        return
      }
      if (repos.isNotEmpty() && resolved.isEmpty()) {
        chat.notifyRemoteRepoResolutionFailed()
        return
      }
      updateSavedState()
      onResolvedRepos(resolved.toList())
    }
  }

  private fun onResolvedRepos(repos: List<Repo>) {
    var resolvedRepos = repos.associateBy { repo -> repo.name }

    // Update the Agent state. This eventually produces `updateFromAgent` which triggers the tree
    // view update.
    val reposToSendToAgent = withModel { model ->
      model.specified
          .mapNotNull { repoSpecName -> resolvedRepos[repoSpecName] }
          .filter { !model.manuallyDeselected.contains(it.name) }
          .take(MAX_REMOTE_REPOSITORY_COUNT)
    }
    chat.updateAgentState(reposToSendToAgent)
  }

  fun updateFromAgent(enhancedContextStatus: EnhancedContextContextT) {
    // Collect the configured repositories from the Agent reported state.
    val repos = mutableListOf<RemoteRepo>()

    for (group in enhancedContextStatus.groups) {
      val provider = group.providers.firstOrNull() ?: continue
      val name = group.displayName
      val id = provider.id ?: continue
      val enablement =
          when {
            provider.state == "ready" -> RepoSelectionStatus.SELECTED
            else -> RepoSelectionStatus.DESELECTED
          }
      val ignored = provider.isIgnored == true
      val inclusion =
          when (provider.inclusion) {
            "auto" -> RepoInclusion.AUTO
            "manual" -> RepoInclusion.MANUAL
            else -> RepoInclusion.MANUAL
          }
      repos.add(RemoteRepo(name, id, enablement, isIgnored = ignored, inclusion))
    }

    withModel { model -> model.configured = repos }
    updateUI()
  }

  private fun updateUI() {
    val usedRepos: MutableMap<String, RemoteRepo> = mutableMapOf()
    val repos = mutableListOf<RemoteRepo>()

    withModel { model ->
      // Compute the merged representation of repositories.
      usedRepos.putAll(model.configured.associateBy { it.name })

      // Visit the repositories in the order specified by the user.
      repos.addAll(
          model.specified.map {
            usedRepos.getOrDefault(
                it,
                // If the repo was manually deselected, then we show it as de-selected.
                // The repo was not manually deselected, yet isn't in the configured repos, hence it
                // is not found.
                // TODO: We could speculatively consult Cody Ignore to see if the deselected repo
                // *would* have been ignored.
                RemoteRepo(
                    it,
                    null,
                    if (model.manuallyDeselected.contains(it)) {
                      RepoSelectionStatus.DESELECTED
                    } else {
                      RepoSelectionStatus.NOT_FOUND
                    },
                    isIgnored = false,
                    RepoInclusion.MANUAL))
          })
    }

    // Finally, if there are any remaining repos configured by the agent which are not used,
    // represent them now.
    repos.addAll(usedRepos.values.filter { !repos.contains(it) })

    // ...and push the list to the UI.
    chat.updateUI(repos)
  }

  fun setRepoEnabledInContextState(repoName: String, enabled: Boolean) {
    withModel { model ->
      val atLimit = model.configured.count { it.isEnabled } >= MAX_REMOTE_REPOSITORY_COUNT
      val repos = model.configured.map { Repo(it.name, it.id!!) }.toMutableList()

      if (enabled) {
        if (atLimit) {
          chat.notifyRemoteRepoLimit()
          return@withModel
        }
        model.manuallyDeselected = model.manuallyDeselected.filter { it != repoName }.toSet()
        val repoToAdd = synchronized(model.resolvedCache) { model.resolvedCache[repoName] }
        if (repoToAdd == null) {
          logger.warn("failed to find repo $repoName in the resolved cache; will not enable it")
          return@withModel
        }
        repos.add(repoToAdd)
      } else {
        model.manuallyDeselected = model.manuallyDeselected.plus(repoName)
        repos.removeIf { it.name == repoName }
      }
      updateSavedState()

      // Update the Agent state. This eventually produces `updateFromAgent` which triggers the tree
      // view update.
      chat.updateAgentState(repos)
    }
  }

  // Pushes a state update to the JetBrains chat history copy of the enhanced context state. This
  // simply takes
  // whatever the user specified (`model.specified`) and saves it, along with which repos were
  // deselected
  // (`model.manuallyDeselected`).
  private fun updateSavedState() {
    val reposToWriteToState = withModel { model ->
      model.specified.map { repoSpecName ->
        RemoteRepositoryState().apply {
          codebaseName = repoSpecName
          // Note, we don't limit to MAX_REMOTE_REPOSITORY_COUNT here. We may raise or lower
          // that limit in future versions anyway, so we just record what is manually deselected
          // and apply the limit when updating Agent-side state.
          isEnabled = !model.manuallyDeselected.contains(repoSpecName)
        }
      }
    }

    chat.updateSavedState { state ->
      state.remoteRepositories.clear()
      state.remoteRepositories.addAll(reposToWriteToState)
    }
  }

  fun requestUIUpdate() {
    ApplicationManager.getApplication().executeOnPooledThread(this::updateUI)
  }
}
