package com.sourcegraph.website;

import com.intellij.dvcs.repo.VcsRepositoryManager;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.application.ApplicationInfo;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vcs.VcsDataKeys;
import com.intellij.openapi.vcs.history.VcsFileRevision;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.vcs.log.VcsLogCommitSelection;
import com.intellij.vcs.log.VcsLogDataKeys;
import com.intellij.vcsUtil.VcsUtil;
import com.sourcegraph.common.BrowserOpener;
import com.sourcegraph.common.ErrorNotification;
import com.sourcegraph.common.ui.DumbAwareEDTAction;
import com.sourcegraph.config.ConfigUtil;
import com.sourcegraph.vcs.RepoUtil;
import com.sourcegraph.vcs.RevisionContext;
import com.sourcegraph.vcs.VCSType;
import git4idea.GitVcs;
import java.util.Optional;
import org.jetbrains.annotations.NotNull;

/** JetBrains IDE action to open a selected revision in Sourcegraph. */
public class OpenRevisionAction extends DumbAwareEDTAction {
  private final Logger logger = Logger.getInstance(this.getClass());

  @Override
  public void actionPerformed(@NotNull AnActionEvent event) {
    Project project = event.getProject();
    if (project == null) {
      return;
    }

    // This action handles events for both log and history views, so attempt to load from any
    // possible option.
    RevisionContext context =
        getHistoryRevisionContext(event)
            .or(() -> getLogRevisionContext(event))
            .or(() -> getEditorRevisionContext(event))
            .orElse(null);

    if (context == null) {
      VirtualFile file = event.getDataContext().getData(VcsDataKeys.VCS_VIRTUAL_FILE);
      if (file != null) {
        // This cannot run on EDT (Event Dispatch Thread) because it may block for a long time.
        ApplicationManager.getApplication()
            .executeOnPooledThread(
                () -> {
                  if (RepoUtil.getVcsType(project, file) == VCSType.PERFORCE) {
                    // Perforce doesn't have a history view, so we'll just open the file in
                    // Sourcegraph.
                    ErrorNotification.INSTANCE.show(
                        project,
                        "This feature is not yet supported for Perforce. If you want to see Perforce support sooner than later, please raise this at support@sourcegraph.com.");
                  } else {
                    ErrorNotification.INSTANCE.show(project, "Could not find revision to open.");
                  }
                });
      } else {
        ErrorNotification.INSTANCE.show(project, "Could not find revision to open.");
      }
      return;
    }

    if (project.getProjectFilePath() == null) {
      ErrorNotification.INSTANCE.show(
          project, "No project file path found (project: " + project.getName() + ")");
      return;
    }

    String productName = ApplicationInfo.getInstance().getVersionName();
    String productVersion = ApplicationInfo.getInstance().getFullVersion();

    // This cannot run on EDT (Event Dispatch Thread) because it may block for a long time.
    ApplicationManager.getApplication()
        .executeOnPooledThread(
            () -> {
              String remoteUrl;
              try {
                remoteUrl = RepoUtil.getRemoteRepoUrl(project, context.getRepoRoot());
              } catch (Exception e) {
                throw new RuntimeException(e);
              }

              String url;
              try {
                url =
                    URLBuilder.buildCommitUrl(
                        ConfigUtil.getServerPath().getUrl(),
                        context.getRevisionNumber(),
                        remoteUrl,
                        productName,
                        productVersion);
              } catch (IllegalArgumentException e) {
                logger.warn(
                    "Unable to build commit view URI for url "
                        + ConfigUtil.getServerPath().getUrl()
                        + ", revision "
                        + context.getRevisionNumber()
                        + ", product "
                        + productName
                        + ", version "
                        + productVersion,
                    e);
                return;
              }
              BrowserOpener.INSTANCE.openInBrowser(project, url);
            });
  }

  @Override
  public void update(@NotNull AnActionEvent event) {
    event.getPresentation().setEnabledAndVisible(true);
  }

  @NotNull
  private Optional<RevisionContext> getHistoryRevisionContext(@NotNull AnActionEvent event) {
    Project project = event.getProject();
    VcsFileRevision revisionObject = event.getDataContext().getData(VcsDataKeys.VCS_FILE_REVISION);
    VirtualFile file = event.getDataContext().getData(VcsDataKeys.VCS_VIRTUAL_FILE);

    if (project == null || revisionObject == null || file == null) {
      return Optional.empty();
    }

    String revision = revisionObject.getRevisionNumber().toString();
    VirtualFile root = VcsUtil.getVcsRootFor(project, file);
    if (root == null) {
      return Optional.empty();
    }
    return Optional.of(new RevisionContext(revision, root));
  }

  @NotNull
  private Optional<RevisionContext> getLogRevisionContext(@NotNull AnActionEvent event) {
    VcsLogCommitSelection log =
        event.getDataContext().getData(VcsLogDataKeys.VCS_LOG_COMMIT_SELECTION);
    Project project = event.getProject();

    if (project == null) {
      return Optional.empty();
    }
    if (log == null || log.getCommits().isEmpty()) {
      return Optional.empty();
    }

    String revision = log.getCommits().get(0).getHash().asString();
    VirtualFile root = log.getCommits().get(0).getRoot();
    return Optional.of(new RevisionContext(revision, root));
  }

  private Optional<RevisionContext> getEditorRevisionContext(@NotNull AnActionEvent event) {
    Project project = event.getProject();

    if (project == null) {
      return Optional.empty();
    }

    return VcsRepositoryManager.getInstance(project).getRepositories().stream()
        .filter(it -> it.getVcs().getName().equals(GitVcs.NAME))
        .findFirst()
        .map(
            repository ->
                new RevisionContext(repository.getCurrentRevision(), repository.getRoot()));
  }
}
