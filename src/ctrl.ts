import { Solitaire, SolitairePov, _deck } from 'lheadsup'
import { read, write, owrite } from './play'
import { createSignal, createMemo, createEffect } from 'solid-js'
import { Table } from './table'

const pile_pos = (() => {

  let res = {}
  for (let i = 0; i < 7; i++) {
    let x = 1.3 + i * 1.1
    let y = 0.2

    res[`p-${i}`] = `${x}-${y}`
  }
  return res
})()


function make_solitaire(fen: string, hooks: any) {

  let _pov = createSignal(SolitairePov.from_fen(fen), { equals: false })

  createEffect(() => {
    let fen = read(hooks._receive_fen)

    if (fen) {
      owrite(_pov, SolitairePov.from_fen(fen))
    }
  })

  let m_pov = () => read(_pov)

  let m_stacks = createMemo(() => {
    return m_pov().stacks.map(stack => {
      let [o_stack_type] = stack.split('@')

      return [stack, pile_pos[o_stack_type]].join('@')
    })
  })

  let m_reveals = createMemo(() => m_pov().reveals)
  let m_drags = createMemo(() => m_pov().drags)
  let m_drops = createMemo(() => m_pov().drops)

  function on_apply_drop(rule: DropRule) {
    hooks.send_user_apply_drop(rule)
    write(_pov, _ => _.user_apply_drop(rule))
  }

  let table = new Table(on_apply_drop)

  createEffect(() => table.a_rules.drops = m_drops())
  createEffect(() => table.a_rules.drags = m_drags())
  createEffect(() => table.a_cards.stacks = m_stacks())
  createEffect(() => table.a_rules.reveals = m_reveals())

  return table
}


export default function ctrl(options: {}) {

  let solitaire = Solitaire.make(_deck.slice(0))
  let fen = solitaire.pov.fen

  let _receive_fen = createSignal()

  let hooks = {
    send_user_apply_drop(rule: DropRule) {
      solitaire.user_apply_drop(rule)
      setTimeout(() => {
        owrite(_receive_fen, solitaire.pov.fen)
      }, Math.random() * 600)
    },
    _receive_fen
  }

  return make_solitaire(fen, hooks)
}
