package com.sourcegraph.config;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import com.sourcegraph.find.Search;
import java.util.Optional;
import org.apache.commons.lang3.StringUtils;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

@Deprecated(since = "3.1.0")
@State(
    name = "ApplicationConfig",
    storages = {@Storage("sourcegraph.xml")})
public class CodyApplicationService implements PersistentStateComponent<CodyApplicationService> {
  @Nullable public String instanceType;
  @Nullable public String url;

  // Remove this after 2024-08-01 when surely everyone migrated to the secure storage.
  @Deprecated(since = "3.0.7")
  @Nullable
  public String dotComAccessToken;

  public boolean isDotComAccessTokenSet;

  // Remove this after 2024-08-01 when surely everyone migrated to the secure storage.
  @Deprecated(since = "3.0.7")
  @Nullable
  public String enterpriseAccessToken;

  public boolean isEnterpriseAccessTokenSet;
  @Nullable public String customRequestHeaders;
  @Nullable public String defaultBranch;
  @Nullable public String remoteUrlReplacements;
  @Nullable public String anonymousUserId;
  public boolean isInstallEventLogged;
  public boolean isUrlNotificationDismissed;

  // Use isCodyAutocompleteEnabled instead. Remove this after 2024-01-01.
  @Deprecated(since = "3.0.4")
  @Nullable
  public Boolean areCodyCompletionsEnabled; // kept for backwards compatibility

  public boolean isCodyEnabled = true;
  @Nullable public Boolean isCodyAutocompleteEnabled = true;
  public boolean isAccessTokenNotificationDismissed;
  @Nullable public Boolean authenticationFailedLastTime;
  @Nullable public Boolean isCodyDebugEnabled;
  @Nullable public Boolean isCodyVerboseDebugEnabled;

  @Nullable
  public String
      lastUpdateNotificationPluginVersion; // The version of the plugin that last notified the user

  // about an update

  @NotNull
  public static CodyApplicationService getInstance() {
    return ApplicationManager.getApplication().getService(CodyApplicationService.class);
  }

  @Nullable
  public String getInstanceType() {
    return instanceType;
  }

  @Nullable
  public String getSourcegraphUrl() {
    return url;
  }

  @Nullable
  public String getCustomRequestHeaders() {
    return customRequestHeaders;
  }

  @Nullable
  public String getDefaultBranchName() {
    return defaultBranch;
  }

  @Nullable
  public String getRemoteUrlReplacements() {

    return remoteUrlReplacements;
  }

  @Nullable
  public Search getLastSearch() {
    // TODO
    return null;
  }

  public boolean isCodyAutocompleteEnabled() {
    return Optional.ofNullable(isCodyAutocompleteEnabled) // the current key takes priority
        .or(() -> Optional.ofNullable(areCodyCompletionsEnabled)) // fallback to the old key
        .orElse(false);
  }

  @Nullable
  public CodyApplicationService getState() {
    return this;
  }

  @Override
  public void loadState(@NotNull CodyApplicationService settings) {
    this.instanceType = settings.instanceType;
    this.url = settings.url;
    this.dotComAccessToken = settings.dotComAccessToken;
    boolean loadedIsDotComAccessTokenSet = settings.isDotComAccessTokenSet;
    this.isDotComAccessTokenSet =
        loadedIsDotComAccessTokenSet || StringUtils.isNotEmpty(settings.dotComAccessToken);
    this.enterpriseAccessToken = settings.enterpriseAccessToken;
    boolean loadedIsEnterpriseAccessTokenSet = settings.isEnterpriseAccessTokenSet;
    this.isEnterpriseAccessTokenSet =
        loadedIsEnterpriseAccessTokenSet || StringUtils.isNotEmpty(settings.enterpriseAccessToken);
    this.customRequestHeaders = settings.customRequestHeaders;
    this.defaultBranch = settings.defaultBranch;
    this.remoteUrlReplacements = settings.remoteUrlReplacements;
    this.anonymousUserId = settings.anonymousUserId;
    this.isUrlNotificationDismissed = settings.isUrlNotificationDismissed;
    this.areCodyCompletionsEnabled = settings.areCodyCompletionsEnabled;
    this.isCodyEnabled = settings.isCodyEnabled;
    this.isCodyAutocompleteEnabled = settings.isCodyAutocompleteEnabled;
    this.isAccessTokenNotificationDismissed = settings.isAccessTokenNotificationDismissed;
    this.authenticationFailedLastTime = settings.authenticationFailedLastTime;
    this.lastUpdateNotificationPluginVersion = settings.lastUpdateNotificationPluginVersion;
    this.isCodyDebugEnabled = settings.isCodyDebugEnabled;
    this.isCodyVerboseDebugEnabled = settings.isCodyVerboseDebugEnabled;
  }
}
