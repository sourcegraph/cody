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

public interface MyFunctionalInterface {
    void myMethod();
}

public class MyClass {
    public void main(String[] args) {
        MyFunctionalInterface func = () -> {
            System.out.println("Hello, world!");
//                   |
        };
    }
}

// ------------------------------------

public enum Planet {
    EARTH(5.976e+24, 6.37814e6);
    private final double mass;
    private final double radius;

    Planet(double mass, double radius) {
//             |
        this.mass = mass;
        this.radius = radius;
    }
}

// ------------------------------------

public enum Planet {
    EARTH(5.976e+24, 6.37814e6);
    private final double mass;
    private final double radius;

    public double surfaceGravity() {
//                     |
        return 6.67300E-11 * mass / (radius * radius);
    }
}

// ------------------------------------

public enum Planet {
    CONSTANT1(() -> {
//              |
});
}
