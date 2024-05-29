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

// ------------------------------------

public enum Month {
    JANUARY,
//     |
    FEBRUARY,
    MARCH,
    APRIL,
    MAY,
    JUNE,
    JULY,
    AUGUST,
    SEPTEMBER,
    OCTOBER,
    NOVEMBER,
    DECEMBER
}

// ------------------------------------

public enum Planet {
    EARTH(5.976e+24, 6.37814e6);
//            |
    private final double mass;
    private final double radius;
}

// ------------------------------------

public enum Planet {
    EARTH(5.976e+24, 6.37814e6);
    private final double mass;
//                        |
    private final double radius;
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
    EARTH(5.976e+24, 6.37814e6);
    public static class InnerClass {
//                       |
    }
}
