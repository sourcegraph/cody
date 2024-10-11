import clojure from 'highlight.js/lib/languages/clojure'
import dart from 'highlight.js/lib/languages/dart'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import elixir from 'highlight.js/lib/languages/elixir'
import fortran from 'highlight.js/lib/languages/fortran'
import groovy from 'highlight.js/lib/languages/groovy'
import haskell from 'highlight.js/lib/languages/haskell'
import http from 'highlight.js/lib/languages/http'
import jsonc from 'highlight.js/lib/languages/json'
import matlab from 'highlight.js/lib/languages/matlab'
import nix from 'highlight.js/lib/languages/nix'
import ocaml from 'highlight.js/lib/languages/ocaml'
import scala from 'highlight.js/lib/languages/scala'
import verilog from 'highlight.js/lib/languages/verilog'
import vhdl from 'highlight.js/lib/languages/vhdl'
import html from 'highlight.js/lib/languages/xml' // highlight.js uses 'xml' for HTML/XML
import { common } from 'lowlight'

export const SYNTAX_HIGHLIGHTING_LANGUAGES = {
    ...common,
    clojure,
    dart,
    dockerfile,
    elixir,
    fortran,
    groovy,
    haskell,
    html,
    http,
    jsonc,
    matlab,
    nix,
    ocaml,
    scala,
    verilog,
    vhdl,
}
