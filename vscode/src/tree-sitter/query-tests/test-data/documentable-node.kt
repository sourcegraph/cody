package main

class Creature {
    //  |
}

// ------------------------------------

data class Animal(
        val name: String,
        //      |
        val type: String
)

// ------------------------------------

data class User(
        val name: String,
        val firstName: String,
        val lastName: String,
        //      |
        val email: String
)

// ------------------------------------

interface Stringer {
    //     |
    fun string(): String
}

// ------------------------------------

interface SuperStringer {
    fun string(): String
    //  |
}

// ------------------------------------

typealias Key = Int
//  |

// ------------------------------------

val person =
        object {
            //  |
        }

// ------------------------------------

val people =
        object {
            //  |
        }

// ------------------------------------

val shortDeclaration = 4
//      |

// ------------------------------------

const val name = "Tom"
//      |

// ------------------------------------

fun nestedVar() {
    val y = 4
    //  |
}

// ------------------------------------

fun greet() {
    //  |
}

// ------------------------------------

fun getDisplayName(u: User): String {
    //           |
    return u.firstName + " " + u.lastName
}
