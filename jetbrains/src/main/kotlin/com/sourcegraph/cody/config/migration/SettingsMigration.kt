package com.sourcegraph.cody.config.migration

import com.intellij.collaboration.async.CompletableFutureUtil.submitIOTask
import com.intellij.collaboration.async.CompletableFutureUtil.successOnEdt
import com.intellij.ide.util.RunOnceUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.api.SourcegraphApiRequestExecutor
import com.sourcegraph.cody.api.SourcegraphApiRequests
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.cody.auth.deprecated.DeprecatedCodyAccount
import com.sourcegraph.cody.auth.deprecated.DeprecatedCodyAccountManager
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyProjectSettings
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.cody.initialization.Activity
import com.sourcegraph.config.AccessTokenStorage
import com.sourcegraph.config.CodyApplicationService
import com.sourcegraph.config.CodyProjectService
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.config.UserLevelConfig
import com.sourcegraph.vcs.convertGitCloneURLToCodebaseNameOrError
import java.util.concurrent.CompletableFuture

class SettingsMigration : Activity {

  enum class AccountType {
    DOTCOM,
    ENTERPRISE
  }

  override fun runActivity(project: Project) {
    RunOnceUtil.runOnceForProject(project, "CodyProjectSettingsMigration") {
      migrateProjectSettings(project)
      migrateAccounts(project)
    }
    RunOnceUtil.runOnceForProject(project, "CodyHistoryLlmMigration") { migrateLlms(project) }
    RunOnceUtil.runOnceForProject(project, "CodyConvertUrlToCodebaseName") {
      migrateUrlsToCodebaseNames(project)
    }
    RunOnceUtil.runOnceForProject(project, "CodyAccountHistoryMigration") {
      organiseChatsByAccount(project)
    }
    RunOnceUtil.runOnceForApp("CodyApplicationSettingsMigration") { migrateApplicationSettings() }
    RunOnceUtil.runOnceForProject(project, "ToggleCodyToolWindowAfterMigration") {
      toggleCodyToolbarWindow(project)
    }
    RunOnceUtil.runOnceForProject(project, "CodyAccountsIdsRefresh") { refreshAccountsIds(project) }
    RunOnceUtil.runOnceForProject(project, "CodyAssignOrphanedChatsToActiveAccount") {
      migrateOrphanedChatsToActiveAccount(project)
    }
    RunOnceUtil.runOnceForProject(project, "DeprecatedChatLlmMigration") {
      DeprecatedChatLlmMigration.migrate(project)
    }
    RunOnceUtil.runOnceForProject(project, "ChatTagsLlmMigration") {
      ChatTagsLlmMigration.migrate(project)
    }
    RunOnceUtil.runOnceForProject(project, "CodyMigrateChatHistory-v2") {
      ChatHistoryMigration.migrate(project)
    }
    RunOnceUtil.runOnceForProject(project, "AccountsToCodyMigration") {
      AccountsMigration.migrate()
    }
  }

  private fun migrateOrphanedChatsToActiveAccount(project: Project) {
    val activeAccountId = DeprecatedCodyAccountManager.getInstance().account?.id
    HistoryService.getInstance(project)
        .state
        .chats
        .filter { it.accountId == null }
        .forEach { it.accountId = activeAccountId }
  }

  private fun refreshAccountsIds(project: Project) {
    val customRequestHeaders = extractCustomRequestHeaders(project)
    DeprecatedCodyAccountManager.getInstance().getAccounts().forEach { codyAccount ->
      val server = SourcegraphServerPath.from(codyAccount.server.url, customRequestHeaders)
      val token = DeprecatedCodyAccountManager.getInstance().getTokenForAccount(codyAccount)
      if (token != null) {
        loadUserDetails(
            SourcegraphApiRequestExecutor.Factory.instance,
            token,
            EmptyProgressIndicator(ModalityState.nonModal()),
            server) {
              codyAccount.id = it.id
              DeprecatedCodyAccountManager.getInstance().addOrUpdateAccountToken(codyAccount, token)
            }
      }
    }
  }

  private fun toggleCodyToolbarWindow(project: Project) {
    ApplicationManager.getApplication().invokeLater {
      val toolWindowManager = ToolWindowManager.getInstance(project)
      val toolWindow = toolWindowManager.getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
      toolWindow?.setAvailable(CodyApplicationSettings.instance.isCodyEnabled, null)
    }
  }

  private fun migrateAccounts(project: Project) {
    val customRequestHeaders = extractCustomRequestHeaders(project)
    val requestExecutorFactory = SourcegraphApiRequestExecutor.Factory.instance
    migrateDotcomAccount(project, requestExecutorFactory, customRequestHeaders)
    migrateEnterpriseAccount(project, requestExecutorFactory, customRequestHeaders)
  }

  private fun migrateLlms(project: Project) {
    HistoryService.getInstance(project)
        .state
        .chats
        .filter { it.llm == null }
        .forEach {
          val (model, provider, title) =
              modelToProviderAndTitle.getOrDefault(it.model, Triple(it.model, null, null))
          val llmState = LLMState()
          llmState.model = model
          llmState.title = title
          llmState.provider = provider
          it.llm = llmState
        }
  }

  private fun migrateUrlsToCodebaseNames(project: Project) {
    val enhancedContextState =
        HistoryService.getInstance(project).state.defaultEnhancedContext ?: return

    migrateUrlsToCodebaseNames(enhancedContextState)

    HistoryService.getInstance(project)
        .state
        .chats
        .mapNotNull(ChatState::enhancedContext)
        .forEach(Companion::migrateUrlsToCodebaseNames)
  }

  private val modelToProviderAndTitle =
      mapOf(
          "Claude 2 by Anthropic" to Triple("anthropic/claude-2", "Anthropic", "claude 2"),
          "Claude 2.0 by Anthropic" to Triple("anthropic/claude-2.0", "Anthropic", "Claude 2.0"),
          "Claude 2.1 by Anthropic" to
              Triple("anthropic/claude-2.1", "Anthropic", "Claude 2.1 Preview"),
          "Claude 2.1 Preview by Anthropic" to
              Triple("anthropic/claude-2.1", "Anthropic", "Claude 2.1 Preview"),
          "Claude Instant by Anthropic" to
              Triple("anthropic/claude-instant-1.2", "Anthropic", "Claude Instant"),
          "ChatGPT 3.5 Turbo by OpenAI" to
              Triple("openai/gpt-3.5-turbo", "OpenAI", "GPT-3.5 Turbo"),
          "ChatGPT 4 Turbo Preview by OpenAI" to
              Triple("openai/gpt-4-1106-preview", "OpenAI", "GPT-4 Turbo Preview"),
          "Mixtral 8x7B by Mistral" to
              Triple(
                  "fireworks/accounts/fireworks/models/mixtral-8x7b-instruct",
                  "Mistral",
                  "Mixtral 8x7B"))

  private fun migrateDotcomAccount(
      project: Project,
      requestExecutorFactory: SourcegraphApiRequestExecutor.Factory,
      customRequestHeaders: String
  ) {
    val dotcomAccessToken = extractDotcomAccessToken(project)
    if (!dotcomAccessToken.isNullOrEmpty()) {
      val server = SourcegraphServerPath.from(ConfigUtil.DOTCOM_URL, customRequestHeaders)
      val extractedAccountType = extractAccountType(project)
      val shouldSetAccountAsDefault = extractedAccountType == AccountType.DOTCOM
      if (shouldSetAccountAsDefault) {
        addAsDefaultAccountIfUnique(
            dotcomAccessToken,
            server,
            requestExecutorFactory,
            EmptyProgressIndicator(ModalityState.nonModal()))
      } else {
        addAccountIfUnique(
            dotcomAccessToken,
            server,
            requestExecutorFactory,
            EmptyProgressIndicator(ModalityState.nonModal()))
      }
    }
  }

  private fun migrateEnterpriseAccount(
      project: Project,
      requestExecutorFactory: SourcegraphApiRequestExecutor.Factory,
      customRequestHeaders: String
  ) {
    val enterpriseAccessToken = extractEnterpriseAccessToken(project)
    if (!enterpriseAccessToken.isNullOrEmpty()) {
      val enterpriseUrl = extractEnterpriseUrl(project)
      runCatching { SourcegraphServerPath.from(enterpriseUrl, customRequestHeaders) }
          .fold({
            val shouldSetAccountAsDefault = extractAccountType(project) == AccountType.ENTERPRISE
            if (shouldSetAccountAsDefault) {
              addAsDefaultAccountIfUnique(
                  enterpriseAccessToken,
                  it,
                  requestExecutorFactory,
                  EmptyProgressIndicator(ModalityState.nonModal()))
            } else {
              addAccountIfUnique(
                  enterpriseAccessToken,
                  it,
                  requestExecutorFactory,
                  EmptyProgressIndicator(ModalityState.nonModal()))
            }
          }) {
            LOG.warn("Unable to parse enterprise server url: '$enterpriseUrl'", it)
          }
    }
  }

  private fun addAccountIfUnique(
      accessToken: String,
      server: SourcegraphServerPath,
      requestExecutorFactory: SourcegraphApiRequestExecutor.Factory,
      progressIndicator: EmptyProgressIndicator,
  ) {
    loadUserDetails(requestExecutorFactory, accessToken, progressIndicator, server) {
      addAccount(DeprecatedCodyAccount(it.name, it.displayName, server, it.id), accessToken)
    }
  }

  private fun addAsDefaultAccountIfUnique(
      accessToken: String,
      server: SourcegraphServerPath,
      requestExecutorFactory: SourcegraphApiRequestExecutor.Factory,
      progressIndicator: EmptyProgressIndicator,
  ) {
    loadUserDetails(requestExecutorFactory, accessToken, progressIndicator, server) {
      val codyAccount = DeprecatedCodyAccount(it.name, it.displayName, server, it.id)
      addAccount(codyAccount, accessToken)
      if (!DeprecatedCodyAccountManager.getInstance().hasActiveAccount())
          DeprecatedCodyAccountManager.getInstance().setActiveAccount(codyAccount)
    }
  }

  private fun loadUserDetails(
      requestExecutorFactory: SourcegraphApiRequestExecutor.Factory,
      accessToken: String,
      progressIndicator: EmptyProgressIndicator,
      server: SourcegraphServerPath,
      onSuccess: (SourcegraphApiRequests.CurrentUser.CodyAccountDetails) -> Unit
  ): CompletableFuture<Unit> =
      service<ProgressManager>()
          .submitIOTask(progressIndicator) {
            runCatching {
              SourcegraphApiRequests.CurrentUser(
                      requestExecutorFactory.create(server, accessToken), progressIndicator)
                  .getDetails()
            }
          }
          .successOnEdt(progressIndicator.modalityState) { accountDetailsResult ->
            accountDetailsResult.fold(onSuccess) {
              LOG.warn("Unable to load user details for '${server.url}' account", it)
            }
          }

  private fun addAccount(codyAccount: DeprecatedCodyAccount, token: String) {
    if (isAccountUnique(codyAccount)) {
      DeprecatedCodyAccountManager.getInstance().addOrUpdateAccountToken(codyAccount, token)
    }
  }

  private fun isAccountUnique(codyAccount: DeprecatedCodyAccount): Boolean {
    return DeprecatedCodyAccountManager.getInstance()
        .isAccountUnique(codyAccount.name, codyAccount.server)
  }

  private fun extractEnterpriseUrl(project: Project): String {
    // Project level
    val projectLevelUrl = project.service<CodyProjectService>().sourcegraphUrl
    if (!projectLevelUrl.isNullOrEmpty()) {
      return addSlashIfNeeded(projectLevelUrl)
    }

    // Application level
    val applicationLevelUrl = service<CodyApplicationService>().sourcegraphUrl
    if (!applicationLevelUrl.isNullOrEmpty()) {
      return addSlashIfNeeded(applicationLevelUrl)
    }

    // User level or default
    val userLevelUrl = UserLevelConfig.getSourcegraphUrl()
    return if (userLevelUrl.isNotEmpty()) addSlashIfNeeded(userLevelUrl) else ""
  }

  private fun extractCustomRequestHeaders(project: Project): String {
    // Project level
    val projectLevelCustomRequestHeaders =
        project.service<CodyProjectService>().getCustomRequestHeaders()
    if (!projectLevelCustomRequestHeaders.isNullOrEmpty()) {
      return projectLevelCustomRequestHeaders
    }

    // Application level
    val applicationLevelCustomRequestHeaders =
        service<CodyApplicationService>().getCustomRequestHeaders()
    return if (!applicationLevelCustomRequestHeaders.isNullOrEmpty()) {
      applicationLevelCustomRequestHeaders
    } else ""
  }

  private fun extractDefaultBranchName(project: Project): String {
    // Project level
    val projectLevelDefaultBranchName = project.service<CodyProjectService>().defaultBranchName
    if (!projectLevelDefaultBranchName.isNullOrEmpty()) {
      return projectLevelDefaultBranchName
    }

    // Application level
    val applicationLevelDefaultBranchName = service<CodyApplicationService>().defaultBranchName
    if (!applicationLevelDefaultBranchName.isNullOrEmpty()) {
      return applicationLevelDefaultBranchName
    }

    // User level or default
    val userLevelDefaultBranchName = UserLevelConfig.getDefaultBranchName()
    return userLevelDefaultBranchName ?: "main"
  }

  private fun extractRemoteUrlReplacements(project: Project): String {
    // Project level
    val projectLevelReplacements = project.service<CodyProjectService>().getRemoteUrlReplacements()
    if (!projectLevelReplacements.isNullOrEmpty()) {
      return projectLevelReplacements
    }

    // Application level
    val applicationLevelReplacements = service<CodyApplicationService>().getRemoteUrlReplacements()
    if (!applicationLevelReplacements.isNullOrEmpty()) {
      return applicationLevelReplacements
    }

    // User level or default
    val userLevelRemoteUrlReplacements = UserLevelConfig.getRemoteUrlReplacements()
    return userLevelRemoteUrlReplacements ?: ""
  }

  private fun extractDotcomAccessToken(project: Project): String? {
    // Project level overrides secure storage
    val projectLevelAccessToken = project.service<CodyProjectService>().getDotComAccessToken()
    if (projectLevelAccessToken != null) {
      return projectLevelAccessToken
    }

    // Get token from secure storage
    val securelyStoredAccessToken = AccessTokenStorage.getDotComAccessToken()
    if (securelyStoredAccessToken.isEmpty) {
      return null // Uer denied access to token storage
    }
    if (securelyStoredAccessToken.get().isNotEmpty()) {
      return securelyStoredAccessToken.get()
    }

    // No secure token found, so use app-level token.
    val codyApplicationService = service<CodyApplicationService>()
    val unsafeApplicationLevelAccessToken = codyApplicationService.dotComAccessToken
    return unsafeApplicationLevelAccessToken ?: ""
  }

  private fun extractEnterpriseAccessToken(project: Project): String? {
    // Project level overrides secure storage
    val unsafeProjectLevelAccessToken =
        project.service<CodyProjectService>().getEnterpriseAccessToken()
    if (unsafeProjectLevelAccessToken != null) {
      return unsafeProjectLevelAccessToken
    }

    // Get token from secure storage
    val securelyStoredAccessToken = AccessTokenStorage.getEnterpriseAccessToken()
    if (securelyStoredAccessToken.isEmpty) {
      return null // Uer denied access to token storage
    }
    if (securelyStoredAccessToken.get().isNotEmpty()) {
      return securelyStoredAccessToken.get()
    }

    // No secure token found, so use app-level token.
    val service = service<CodyApplicationService>()
    val unsafeApplicationLevelAccessToken = service.enterpriseAccessToken
    return unsafeApplicationLevelAccessToken ?: ""
  }

  private fun migrateProjectSettings(project: Project) {
    val codyProjectSettings = project.service<CodyProjectSettings>()
    codyProjectSettings.defaultBranchName = extractDefaultBranchName(project)
    codyProjectSettings.remoteUrlReplacements = extractRemoteUrlReplacements(project)
  }

  private fun addSlashIfNeeded(url: String): String {
    return if (url.endsWith("/")) url else "$url/"
  }

  private fun extractAccountType(project: Project): AccountType {
    return project.service<CodyProjectService>().getInstanceType()?.let { toAccountType(it) }
        ?: service<CodyApplicationService>().getInstanceType()?.let { toAccountType(it) }
        ?: AccountType.DOTCOM
  }

  private fun toAccountType(it: String): AccountType? {
    return runCatching { AccountType.valueOf(it) }.getOrNull()
  }

  private fun migrateApplicationSettings() {
    val codyApplicationSettings = service<CodyApplicationSettings>()
    val codyApplicationService = service<CodyApplicationService>()
    codyApplicationSettings.isCodyEnabled = codyApplicationService.isCodyEnabled
    codyApplicationSettings.isCodyAutocompleteEnabled =
        if (codyApplicationService.isCodyAutocompleteEnabled == true) true
        else codyApplicationService.areCodyCompletionsEnabled ?: false
    codyApplicationSettings.isCodyDebugEnabled = codyApplicationService.isCodyDebugEnabled ?: false
    codyApplicationSettings.isCodyVerboseDebugEnabled =
        codyApplicationService.isCodyVerboseDebugEnabled ?: false
    codyApplicationSettings.anonymousUserId = codyApplicationService.anonymousUserId
    codyApplicationSettings.isInstallEventLogged = codyApplicationService.isInstallEventLogged
  }

  companion object {
    private val LOG = logger<SettingsMigration>()

    fun migrateUrlsToCodebaseNames(enhancedContextState: EnhancedContextState) {
      val remoteRepositories =
          enhancedContextState.remoteRepositories
              .onEach { remoteRepositoryState ->
                runCatching {
                      remoteRepositoryState.remoteUrl?.let { remoteUrl ->
                        convertGitCloneURLToCodebaseNameOrError(remoteUrl)
                      }
                    }
                    .getOrNull()
                    ?.let { remoteRepositoryState.codebaseName = it.value }
              }
              .filter { it.codebaseName != null }
              .distinctBy { it.codebaseName }
              .toMutableList()
      enhancedContextState.remoteRepositories = remoteRepositories
    }

    fun organiseChatsByAccount(project: Project) {
      val historyService = HistoryService.getInstance(project)
      val historyState = historyService.state
      historyState.chats.forEach { oldState ->
        val accountId = oldState.accountId
        if (accountId == null) return@forEach
        val newState =
            historyState.accountData.find { it.accountId == accountId }
                ?: (AccountData(accountId).also { historyState.accountData += it })
        newState.defaultLlm = historyState.defaultLlm
        newState.defaultEnhancedContext = historyState.defaultEnhancedContext
        if (newState.chats.find { it.internalId == oldState.internalId } == null) {
          newState.chats.add(oldState)
        }
      }
    }
  }
}
