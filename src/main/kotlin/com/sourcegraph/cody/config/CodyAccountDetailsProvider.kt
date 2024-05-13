package com.sourcegraph.cody.config

import com.intellij.collaboration.async.CompletableFutureUtil.submitIOTask
import com.intellij.collaboration.async.CompletableFutureUtil.successOnEdt
import com.intellij.collaboration.util.ProgressIndicatorsProvider
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.sourcegraph.cody.api.SourcegraphApiRequestExecutor
import com.sourcegraph.cody.api.SourcegraphApiRequests
import com.sourcegraph.cody.auth.ui.LoadingAccountsDetailsProvider
import java.util.concurrent.CompletableFuture

class CodyAccountDetailsProvider(
    progressIndicatorsProvider: ProgressIndicatorsProvider,
    private val accountManager: CodyAccountManager,
    private val accountsModel: CodyAccountListModel
) : LoadingAccountsDetailsProvider<CodyAccount, CodyAccountDetails>(progressIndicatorsProvider) {

  override fun scheduleLoad(
      account: CodyAccount,
      indicator: ProgressIndicator
  ): CompletableFuture<DetailsLoadingResult<CodyAccountDetails>> {

    return ProgressManager.getInstance()
        .submitIOTask(indicator) { indicator ->
          val token =
              accountsModel.newCredentials.getOrElse(account) {
                accountManager.findCredentials(account)
              } ?: return@submitIOTask noToken()
          val executor =
              service<SourcegraphApiRequestExecutor.Factory>().create(account.server, token)

          val accountDetails = SourcegraphApiRequests.CurrentUser(executor, indicator).getDetails()
          val image =
              accountDetails.avatarURL?.let { url ->
                CachingCodyUserAvatarLoader.getInstance().requestAvatar(executor, url).join()
              }
          DetailsLoadingResult(accountDetails, image, null, false)
        }
        .successOnEdt(indicator.modalityState) {
          accountsModel.accountsListModel.contentsChanged(account)
          it
        }
  }

  private fun noToken() =
      DetailsLoadingResult<CodyAccountDetails>(null, null, "Missing access token", true)
}
