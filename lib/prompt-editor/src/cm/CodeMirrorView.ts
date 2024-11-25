import { EditorView, NodeView } from 'prosemirror-view'
import {
  EditorView as CodeMirror, ViewUpdate, keymap as cmKeymap, drawSelection
} from "@codemirror/view"
import {defaultKeymap} from "@codemirror/commands"

import {exitCode} from "prosemirror-commands"
import {undo, redo} from "prosemirror-history"
import {keymap} from "prosemirror-keymap"
import { Node } from "prosemirror-model"
import { TextSelection, Selection, Command } from 'prosemirror-state'

export class CodeBlockView implements NodeView {
    private node: Node
    private view: EditorView
    private getPos: () => number|undefined
    private cm: CodeMirror
    public dom: HTMLElement
    private updating: boolean

  constructor(node:Node, view: EditorView, getPos: () => number|undefined ) {
    // Store for later
    this.node = node
    this.view = view
    this.getPos = getPos

    // Create a CodeMirror instance
    this.cm = new CodeMirror({
      doc: this.node.textContent,
      extensions: [
        cmKeymap.of([
          ...this.codeMirrorKeymap(),
          ...defaultKeymap
        ]),
        drawSelection(),
        CodeMirror.updateListener.of(update => this.forwardUpdate(update))
      ]
    })

    // The editor's outer node is our DOM representation
    this.dom = this.cm.dom

    // This flag is used to avoid an update loop between the outer and
    // inner editor
    this.updating = false
  }

  forwardUpdate(update: ViewUpdate) {
    if (this.updating || !this.cm.hasFocus) return
    let offset = this.getPos() + 1, {main} = update.state.selection
    let selFrom = offset + main.from, selTo = offset + main.to
    let pmSel = this.view.state.selection
    if (update.docChanged || pmSel.from != selFrom || pmSel.to != selTo) {
      let tr = this.view.state.tr
      update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
        if (text.length)
          tr.replaceWith(offset + fromA, offset + toA,
                         this.view.state.schema.text(text.toString()))
        else
          tr.delete(offset + fromA, offset + toA)
        offset += (toB - fromB) - (toA - fromA)
      })
      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo))
      this.view.dispatch(tr)
    }
  }
  setSelection(anchor: number, head: number) {
    this.cm.focus()
    this.updating = true
    this.cm.dispatch({selection: {anchor, head}})
    this.updating = false
  }
  codeMirrorKeymap() {
    let view = this.view
    return [
      {key: "ArrowUp", run: () => this.maybeEscape("line", -1)},
      {key: "ArrowLeft", run: () => this.maybeEscape("char", -1)},
      {key: "ArrowDown", run: () => this.maybeEscape("line", 1)},
      {key: "ArrowRight", run: () => this.maybeEscape("char", 1)},
      {key: "Ctrl-Enter", run: () => {
        if (!exitCode(view.state, view.dispatch)) return false
        view.focus()
        return true
      }},
      {key: "Ctrl-z", mac: "Cmd-z",
       run: () => undo(view.state, view.dispatch)},
      {key: "Shift-Ctrl-z", mac: "Shift-Cmd-z",
       run: () => redo(view.state, view.dispatch)},
      {key: "Ctrl-y", mac: "Cmd-y",
       run: () => redo(view.state, view.dispatch)}
    ]
  }

  maybeEscape(unit: 'line'|'char', dir: 1|-1) {
    let {state} = this.cm, {main} = state.selection
    if (!main.empty) return false
    if (unit == "line") main = state.doc.lineAt(main.head)
    if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false
    let targetPos = this.getPos() + (dir < 0 ? 0 : this.node.nodeSize)
    let selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
    let tr = this.view.state.tr.setSelection(selection).scrollIntoView()
    this.view.dispatch(tr)
    this.view.focus()
  }
  update(node: Node) {
    if (node.type != this.node.type) return false
    this.node = node
    if (this.updating) return true
    let newText = node.textContent, curText = this.cm.state.doc.toString()
    if (newText != curText) {
      let start = 0, curEnd = curText.length, newEnd = newText.length
      while (start < curEnd &&
             curText.charCodeAt(start) == newText.charCodeAt(start)) {
        ++start
      }
      while (curEnd > start && newEnd > start &&
             curText.charCodeAt(curEnd - 1) == newText.charCodeAt(newEnd - 1)) {
        curEnd--
        newEnd--
      }
      this.updating = true
      this.cm.dispatch({
        changes: {
          from: start, to: curEnd,
          insert: newText.slice(start, newEnd)
        }
      })
      this.updating = false
    }
    return true
  }

  selectNode() { this.cm.focus() }
  stopEvent() { return true }
}


function arrowHandler(dir: 'left'|'right'|'up'|'down'): Command {
  return (state, dispatch, view) => {
    if (state.selection.empty && view?.endOfTextblock(dir)) {
      let side = dir == "left" || dir == "up" ? -1 : 1
      let $head = state.selection.$head
      let nextPos = Selection.near(
        state.doc.resolve(side > 0 ? $head.after() : $head.before()), side)
      if (nextPos.$head && nextPos.$head.parent.type.name == "code_block") {
        dispatch?.(state.tr.setSelection(nextPos))
        return true
      }
    }
    return false
  }
}

export const codeArrowHandlers = keymap({
  ArrowLeft: arrowHandler("left"),
  ArrowRight: arrowHandler("right"),
  ArrowUp: arrowHandler("up"),
  ArrowDown: arrowHandler("down")
})
