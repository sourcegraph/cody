class Test {
//      |
}

// ------------------------------------

class Test {
    public int age;
//              |
}

// ------------------------------------

class Test {
    public Hello() {
//           |
    }
}

// ------------------------------------

class Test {
    public Hello() {
//     |
    }
}

// ------------------------------------

class Test {
    public Hello() {
        System.out.println("Hi!");
//           |
    }
}

// ------------------------------------

class Test {
    public Test() {
//           |
    }
}

// ------------------------------------

public record Point(int x, int y) {
//              |
}

// ------------------------------------

public interface Shape {
//                  |
    double calculateArea();
}

// ------------------------------------

public interface Shape {
    double calculateArea();
    //         |
}

// ------------------------------------

public enum Day {
//           |
    SUNDAY,
    MONDAY,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY
}
