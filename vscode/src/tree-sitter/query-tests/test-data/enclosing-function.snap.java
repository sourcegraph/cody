// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  class Test {
      public Hello() {
//    ^ start range.function[1]
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
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
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: constructor_declaration

// ------------------------------------

  public record Point(int x, int y) {
//^ start range.function[1]
//                █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: record_declaration

// ------------------------------------

  public interface MyFunctionalInterface {
      void myMethod();
  }

  public class MyClass {
      public void main(String[] args) {
          MyFunctionalInterface func = () -> {
//                                     ^ start range.function[1]
              System.out.println("Hello, world!");
//                     █
          };
//        ^ end range.function[1]
      }
  }

// Nodes types:
// range.function[1]: lambda_expression

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
//                       █
          return 6.67300E-11 * mass / (radius * radius);
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: method_declaration

// ------------------------------------

  public enum Planet {
      CONSTANT1(() -> {
//              ^ start range.function[1]
//                █
  });
//^ end range.function[1]
  }

// Nodes types:
// range.function[1]: lambda_expression

