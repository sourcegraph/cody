rootProject.name = "Sourcegraph"

include(":jetbrains-shared")

project(":jetbrains-shared").projectDir = file("../jetbrains-shared")

val isCiServer = System.getenv().containsKey("CI")

buildCache { local { isEnabled = !isCiServer } }
