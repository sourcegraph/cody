# cody-icons-font

Contains the [cody-icons](font) font, used by the VS Code extension to show Cody-related icons.

## Character Table

| Character | Icon                           | Font Character |
| --------- | ------------------------------ | -------------- |
| `A`       | ![A icon](svg-originals/A.svg) | 0041           |
| `B`       | ![B icon](svg-originals/B.svg) | 0042           |
| `C`       | ![C icon](svg-originals/C.svg) | 0043           |
| `D`       | ![D icon](svg-originals/D.svg) | 0044           |
| `E`       | ![E icon](svg-originals/E.svg) | 0045           |
| `F`       | ![F icon](svg-originals/F.svg) | 0046           |
| `H`       | ![H icon](svg-originals/H.svg) | 0048           |

## Regenerating

1. Regenerate the font file from the SVGs:

```sh
pnpm run font
```

## Use the regenerated font file with new changes in VS Code

1. Replace the `vscode/resources/cody-icons.ttf` with the newly generated `cody-icons.ttf` file

```sh
cp font/cody-icons.ttf ../../vscode/resources/cody-icons.ttf
```

2. Register the icons in `vscode/package.json` in the `icons` field.
