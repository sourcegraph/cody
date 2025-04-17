# cody-icons-font

Contains the [cody-icons](font) font, used by the VS Code extension to show Cody-related icons.

## Character Table

| Character | Icon                           | Font Character | Title                 |
| --------- | ------------------------------ | -------------- | --------------------- |
| `A`       | ![A icon](svg-originals/A.svg) | 0041           | cody-logo             |
| `B`       | ![B icon](svg-originals/B.svg) | 0042           | cody-logo-heavy       |
| `C`       | ![C icon](svg-originals/C.svg) | 0043           | anthropic-logo        |
| `D`       | ![D icon](svg-originals/D.svg) | 0044           | openai-logo           |
| `E`       | ![E icon](svg-originals/E.svg) | 0045           | mistral-logo          |
| `F`       | ![F icon](svg-originals/F.svg) | 0046           | ollama-logo           |
| `G`       | ![G icon](svg-originals/G.svg) | 0047           | gemini-logo           |
| `H`       | ![H icon](svg-originals/H.svg) | 0048           | new-comment-icon      |
| `I`       | ![I icon](svg-originals/I.svg) | 0049           | discord-logo          |
| `J`       | ![J icon](svg-originals/J.svg) | 004A           | cody-logo-heavy-slash |
| `K`       | ![K icon](svg-originals/K.svg) | 004B           | command-keyboard-icon |
| `L`       | ![L icon](svg-originals/L.svg) | 004C           | option-keyboard-icon  |
| `M`       | ![M icon](svg-originals/M.svg) | 004D           | k-keyboard-icon       |
| `N`       | ![N icon](svg-originals/N.svg) | 004E           | l-keyboard-icon       |
| `O`       | ![O icon](svg-originals/O.svg) | 004F           | tab-keyboard-icon     |

## Preparing the Images

1. Add the .svg files to both the `svg-originals` and `svg-outlined` folders.
2. Update the Chracter Table above accordingly

## Regenerating

1. Regenerate the font file from the SVGs:

```sh
pnpm run font
```

## Use the regenerated font file with new changes in VS Code

1. Replace the `vscode/resources/cody-icons.ttf` with the newly generated `cody-icons.ttf` file

```sh
cp font/cody-icons.ttf ../../vscode/resources/cody-icons.ttf
cp font/cody-icons.woff ../../vscode/resources/cody-icons.woff
```

2. Register the icons in `vscode/package.json` in the `icons` field.
