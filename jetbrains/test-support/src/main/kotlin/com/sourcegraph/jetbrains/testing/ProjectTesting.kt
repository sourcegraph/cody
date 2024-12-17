import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
final class ProjectTesting {
  companion object {
    @JvmStatic
    fun getInstance(project: Project): ProjectTesting =
        project.getService(ProjectTesting::class.java)
  }
}
