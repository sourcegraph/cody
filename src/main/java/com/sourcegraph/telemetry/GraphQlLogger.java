package com.sourcegraph.telemetry;

import com.google.gson.JsonObject;
import com.intellij.openapi.project.Project;
import com.sourcegraph.cody.agent.CodyAgentService;
import com.sourcegraph.cody.agent.protocol.Event;
import com.sourcegraph.cody.config.CodyApplicationSettings;
import com.sourcegraph.cody.config.SourcegraphServerPath;
import com.sourcegraph.config.ConfigUtil;
import java.util.concurrent.CompletableFuture;
import org.jetbrains.annotations.NotNull;

public class GraphQlLogger {
  public static CompletableFuture<Boolean> logInstallEvent(@NotNull Project project) {
    CodyApplicationSettings codyApplicationSettings = CodyApplicationSettings.getInstance();
    if (codyApplicationSettings.getAnonymousUserId() != null && !project.isDisposed()) {
      var event = createEvent(ConfigUtil.getServerPath(project), "CodyInstalled", new JsonObject());
      return logEvent(project, event);
    }
    return CompletableFuture.completedFuture(false);
  }

  public static void logUninstallEvent(@NotNull Project project) {
    CodyApplicationSettings codyApplicationSettings = CodyApplicationSettings.getInstance();
    if (codyApplicationSettings.getAnonymousUserId() != null) {
      Event event =
          createEvent(ConfigUtil.getServerPath(project), "CodyUninstalled", new JsonObject());
      logEvent(project, event);
    }
  }

  public static void logCodyEvent(
      @NotNull Project project, @NotNull String componentName, @NotNull String action) {
    var eventName = "CodyJetBrainsPlugin:" + componentName + ":" + action;
    logEvent(project, createEvent(ConfigUtil.getServerPath(project), eventName, new JsonObject()));
  }

  @NotNull
  private static Event createEvent(
      @NotNull SourcegraphServerPath sourcegraphServerPath,
      @NotNull String eventName,
      @NotNull JsonObject eventParameters) {
    var updatedEventParameters = addGlobalEventParameters(eventParameters, sourcegraphServerPath);
    CodyApplicationSettings codyApplicationSettings = CodyApplicationSettings.getInstance();
    String anonymousUserId = codyApplicationSettings.getAnonymousUserId();
    return new Event(
        eventName, anonymousUserId != null ? anonymousUserId : "", "", updatedEventParameters);
  }

  @NotNull
  private static JsonObject addGlobalEventParameters(
      @NotNull JsonObject eventParameters, @NotNull SourcegraphServerPath sourcegraphServerPath) {
    // project specific properties
    var updatedEventParameters = eventParameters.deepCopy();
    updatedEventParameters.addProperty("serverEndpoint", sourcegraphServerPath.getUrl());
    // Extension specific properties
    JsonObject extensionDetails = new JsonObject();
    extensionDetails.addProperty("ide", "JetBrains");
    extensionDetails.addProperty("ideExtensionType", "Cody");
    extensionDetails.addProperty("version", ConfigUtil.getPluginVersion());
    updatedEventParameters.add("extensionDetails", extensionDetails);
    return updatedEventParameters;
  }

  // This could be exposed later (as public), but currently, we don't use it externally.
  private static CompletableFuture<Boolean> logEvent(
      @NotNull Project project, @NotNull Event event) {
    return CodyAgentService.withAgent(project)
        .thenCompose(
            agent ->
                agent
                    .getServer()
                    .logEvent(event)
                    .thenApply((ignored) -> true)
                    .exceptionally((ignored) -> false));
  }
}
