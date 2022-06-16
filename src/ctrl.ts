import { Solitaire, SolitairePov } from 'lheadsup'
import { _deck } from 'lheadsup'

const pile_pos = (() => {

  let res = {}
  for (let i = 0; i < 7; i++) {
    let x = 1.3 + i * 1.1
    let y = 0.2

    res[`p-${i}`] = `${x}-${y}`
  }
  return res
})()


function make_solitaire(table: Table) {



  let pov = Solitaire.make(_deck.slice(0)).pov

  let m_stacks = () => {
    return pov.stacks.map(stack => {
      let [o_stack_type] = stack.split('@')

      return [stack, pile_pos[o_stack_type]].join('@')
    })
  }

  let m_drags = () => {
    return pov.drags
  }

  let m_drops = () => {
    return pov.drops
  }

    table.a_rules.drops = m_drops()
    table.a_rules.drags = m_drags()
    table.a_cards.stacks = m_stacks()


}


export default function ctrl(table: Table, options: {}) {

  make_solitaire(table)
}
