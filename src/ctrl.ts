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


function make_solitaire(fen: string) {

  let _pov = createSignal(SolitairePov.from_fen(fen), { equals: false })

  let m_pov = () => read(_pov)

  let m_stacks = createMemo(() => {
    let pov = m_pov()
    return pov.stacks.map(stack => {
      let [o_stack_type] = stack.split('@')

      return [stack, pile_pos[o_stack_type]].join('@')
    })
  })

  let m_drags = createMemo(() => {
    let pov = m_pov()
    return pov.drags
  })

  let m_drops = createMemo(() => {
    let pov = m_pov()
    return pov.drops
  })

  function on_apply_drop(rule: DropRule) {
    write(_pov, _ => _.user_apply_drop(rule))
  }

  let table = new Table(on_apply_drop)

  createEffect(() => {
    table.a_rules.drops = m_drops()
  })
  createEffect(() => {
    table.a_rules.drags = m_drags()
  })
  createEffect(() => {
    table.a_cards.stacks = m_stacks()
  })

  return table
}


export default function ctrl(options: {}) {
  let fen = Solitaire.make(_deck.slice(0)).pov.fen
  return make_solitaire(fen)
}
