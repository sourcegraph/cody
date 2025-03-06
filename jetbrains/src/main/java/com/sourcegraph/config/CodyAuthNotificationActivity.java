package com.sourcegraph.config;

import com.intellij.notification.Notification;
import com.intellij.notification.NotificationType;
import com.intellij.notification.Notifications;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowManager;
import com.sourcegraph.Icons;
import com.sourcegraph.cody.CodyToolWindowFactory;
import com.sourcegraph.cody.auth.CodyAuthService;
import com.sourcegraph.cody.config.CodyApplicationSettings;
import com.sourcegraph.cody.initialization.Activity;
import com.sourcegraph.common.NotificationGroups;
import com.sourcegraph.common.ui.DumbAwareEDTAction;
import org.jetbrains.annotations.NotNull;

public class CodyAuthNotificationActivity implements Activity {

  @Override
  public void runActivity(@NotNull Project project) {
    if (!CodyApplicationSettings.getInstance().isGetStartedNotificationDismissed()
        && !CodyAuthService.getInstance(project).isActivated()) {
      showOpenCodySidebarNotification(project);
    }
  }

  private void showOpenCodySidebarNotification(@NotNull Project project) {
    // Display notification
    Notification notification =
        new Notification(
            NotificationGroups.CODY_AUTH,
            "Open Cody sidebar to get started",
            "",
            NotificationType.WARNING);

    AnAction openCodySidebar =
        new DumbAwareEDTAction("Open Cody") {
          @Override
          public void actionPerformed(@NotNull AnActionEvent anActionEvent) {
            notification.expire();
            ToolWindowManager toolWindowManager = ToolWindowManager.getInstance(project);
            ToolWindow toolWindow =
                toolWindowManager.getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID);
            if (toolWindow != null) {
              toolWindow.setAvailable(true, null);
              toolWindow.activate(null);
            }
          }
        };

    AnAction neverShowAgainAction =
        new DumbAwareEDTAction("Never Show Again") {
          @Override
          public void actionPerformed(@NotNull AnActionEvent anActionEvent) {
            notification.expire();
            CodyApplicationSettings.getInstance().setGetStartedNotificationDismissed(true);
          }
        };
    notification.setIcon(Icons.CodyLogo);
    notification.addAction(openCodySidebar);
    notification.addAction(neverShowAgainAction);
    Notifications.Bus.notify(notification);
  }
}
