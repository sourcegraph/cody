package com.sourcegraph.cody.context.ui

import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.TextFieldWithAutoCompletion
import com.intellij.ui.TextFieldWithAutoCompletionListProvider
import com.intellij.util.Alarm
import com.sourcegraph.cody.config.DialogValidationUtils
import com.sourcegraph.cody.context.RemoteRepoUtils
import java.net.URL
import java.util.concurrent.TimeUnit
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import org.jetbrains.annotations.NotNull

class AddRepositoryDialog(private val project: Project, private val addAction: (String) -> Unit) :
    DialogWrapper(project) {

  private val repoUrlInputField = TextFieldWithAutoCompletion.create(project, listOf(), false, null)

  init {
    init()
    title = "Add Remote Repository"
    setOKButtonText("Add")
    setValidationDelay(100)
  }

  override fun doValidateAll(): List<ValidationInfo> {
    fun validateNonEmpty() =
        DialogValidationUtils.custom(repoUrlInputField, "Remote repository URL cannot be empty") {
          repoUrlInputField.text.isNotBlank()
        }

    fun validateValidUrl() =
        DialogValidationUtils.custom(repoUrlInputField, "Remote repository URL must be valid") {
          val url =
              if (repoUrlInputField.text.startsWith("http")) repoUrlInputField.text
              else "http://" + repoUrlInputField.text
          runCatching { URL(url) }.isSuccess
        }

    fun validateRepoExists() =
        DialogValidationUtils.custom(
            repoUrlInputField, "Remote repository not found on the server") {
              val repo =
                  RemoteRepoUtils.getRepository(project, repoUrlInputField.text)
                      .completeOnTimeout(null, 2, TimeUnit.SECONDS)
                      .get()
              repo != null
            }

    return listOfNotNull(validateNonEmpty() ?: validateValidUrl() ?: validateRepoExists())
  }

  override fun getValidationThreadToUse(): Alarm.ThreadToUse {
    return Alarm.ThreadToUse.POOLED_THREAD
  }

  override fun doOKAction() {
    addAction(repoUrlInputField.text)
    close(OK_EXIT_CODE, true)
  }

  override fun createCenterPanel(): JComponent {
    val panel = JPanel()
    val label = JLabel("Repository URL: ")
    panel.add(label)

    // TODO: we can provide repository suggestions using `provider.setItems` method
    val completionProvider: TextFieldWithAutoCompletionListProvider<String> =
        object : TextFieldWithAutoCompletionListProvider<String>(listOf()) {
          @NotNull
          override fun getLookupString(@NotNull s: String): String {
            return s
          }
        }

    repoUrlInputField.setPreferredWidth(300)
    repoUrlInputField.installProvider(completionProvider)
    repoUrlInputField.addDocumentListener(
        object : DocumentListener {
          override fun documentChanged(event: com.intellij.openapi.editor.event.DocumentEvent) {
            initValidation()
          }
        })

    panel.add((repoUrlInputField))

    return panel
  }
}
