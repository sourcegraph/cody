// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  class Test {
//^ start range.identifier[1]
//      ^^^^ symbol.identifier[1]
//        █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: class_declaration

// ------------------------------------

  class Test {
//^ start range.identifier[1]
      public int age;
//                █
  }
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: class_declaration

// ------------------------------------

  class Test {
      public Hello() {
//    ^ start range.function[1]
//           ^^^^^ symbol.function[1]
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: constructor_declaration

// ------------------------------------

  class Test {
      public Hello() {
//    ^ start range.function[1]
//       █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: constructor_declaration

// ------------------------------------

  class Test {
      public Hello() {
//    ^ start range.function[1]
          System.out.println("Hi!");
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: constructor_declaration

// ------------------------------------

  class Test {
      public Test() {
//    ^ start range.function[1]
//           ^^^^ symbol.function[1]
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: constructor_declaration

// ------------------------------------

  public record Point(int x, int y) {
//^ start range.function[1]
//              ^^^^^ symbol.function[1]
//                █
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: record_declaration

// ------------------------------------

  public interface Shape {
//^ start range.identifier[1]
//                 ^^^^^ symbol.identifier[1]
//                    █
      double calculateArea();
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: interface_declaration

// ------------------------------------

  public interface Shape {
      double calculateArea();
//    ^^^^^^^^^^^^^^^^^^^^^^^ range.function[1]
//           ^^^^^^^^^^^^^ symbol.function[1]
//               █
  }

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: method_declaration

// ------------------------------------

  public enum Day {
//^ start range.identifier[1]
//            ^^^ symbol.identifier[1]
//             █
      SUNDAY,
      MONDAY,
      TUESDAY,
      WEDNESDAY,
      THURSDAY,
      FRIDAY,
      SATURDAY
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: enum_declaration

// ------------------------------------

  public enum Month {
      JANUARY,
//    ^^^^^^^ symbol.identifier[1], range.identifier[1]
//       █
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

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: enum_constant

// ------------------------------------

  public enum Planet {
      EARTH(5.976e+24, 6.37814e6);
//    ^^^^^^^^^^^^^^^^^^^^^^^^^^^ range.identifier[1]
//              █
      private final double mass;
      private final double radius;
  }

// Nodes types:
// range.identifier[1]: enum_constant

// ------------------------------------

  public enum Planet {
//^ start range.identifier[1]
      EARTH(5.976e+24, 6.37814e6);
      private final double mass;
//                          █
      private final double radius;
  }
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: enum_declaration

// ------------------------------------

  public enum Planet {
      EARTH(5.976e+24, 6.37814e6);
      private final double mass;
      private final double radius;

      Planet(double mass, double radius) {
//    ^ start range.function[1]
//               █
          this.mass = mass;
          this.radius = radius;
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: constructor_declaration

// ------------------------------------

  public enum Planet {
      EARTH(5.976e+24, 6.37814e6);
      private final double mass;
      private final double radius;

      public double surfaceGravity() {
//    ^ start range.function[1]
//                  ^^^^^^^^^^^^^^ symbol.function[1]
//                       █
          return 6.67300E-11 * mass / (radius * radius);
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: method_declaration

// ------------------------------------

  public enum Planet {
      EARTH(5.976e+24, 6.37814e6);
      public static class InnerClass {
//    ^ start range.identifier[1]
//                        ^^^^^^^^^^ symbol.identifier[1]
//                         █
      }
//    ^ end range.identifier[1]
  }

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: class_declaration

