// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  <?php
  class Creature {
//^ start range.function[1]
//      ^^^^^^^^ symbol.function[1]
//        █
  }
//^ end range.function[1]
  ?>

// Nodes types:
// symbol.function[1]: name
// range.function[1]: class_declaration

// ------------------------------------

  <?php
  class Animal {
      public $name;
//           ^^^^^ range.identifier[1]
//        █
      public $type;
  }
  ?>

// Nodes types:
// range.identifier[1]: variable_name

// ------------------------------------

  <?php
  interface Stringer {
//^ start range.function[1]
//        █
      public function string();
  }
//^ end range.function[1]
  ?>

// Nodes types:
// range.function[1]: interface_declaration

// ------------------------------------

  <?php
  interface Stringer {
      public function string();
//    ^^^^^^^^^^^^^^^^^^^^^^^^^ range.function[1]
//        █
  }
  ?>

// Nodes types:
// range.function[1]: method_declaration

// ------------------------------------

  <?php
  class key {
//^ start range.function[1]
//      ^^^ symbol.function[1]
//        █
  }
//^ end range.function[1]
  ?>

// Nodes types:
// symbol.function[1]: name
// range.function[1]: class_declaration

// ------------------------------------
<?php
$person = new class {
    //  |
};
?>

// ------------------------------------

$shortDeclaration = 4;
//  |

// ------------------------------------

<?php
const $name = "Tom";
//  |
?>

// ------------------------------------

  <?php
  function nestedVar() {
//^ start range.function[1]
      $y = 4;
//        █
  }
//^ end range.function[1]
  ?>

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  <?php
  function greet() {
//^ start range.function[1]
//        █
  }
//^ end range.function[1]
  ?>

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  <?php
  public function DisplayName() {
//       ^ start range.function[1]
//        █
      return $this->firstName . " " . $this->lastName;
  }
//^ end range.function[1]
  ?>

// Nodes types:
// range.function[1]: function_definition

