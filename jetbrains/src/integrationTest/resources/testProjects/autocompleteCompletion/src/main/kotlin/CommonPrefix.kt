object CommonPrefix {
    fun sayHello(name: String) {
        println("Hello, $name!")
    }
}

fun main() {
    // say hello world
    [[caret]]CommonPrefix.
}
