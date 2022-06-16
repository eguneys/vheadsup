import { Solitaire, SolitairePov } from 'lheadsup'
import { _deck } from 'lheadsup'

const pile_pos = (() => {

  let res = []
  for (let i = 0; i < 7; i++) {
    let x = 1.3 + i * 1.1
    let y = 0.2

    res.push(`${x}-${y}`)
  }
  return res
})()


function make_solitaire(table: Table) {



  let pov = Solitaire.make(_deck.slice(0)).pov

  let m_cards = () => {
    return pov.piles.map((_, i) => {
      let cards = [...Array(_[0]).keys()].map(_ => 'zz').join('') + _[1]
      return [`p${i}`, cards, pile_pos[i]].join('@')
    })
  }


    table.a_rules.drops = [
      'p1@1@p3',
      'p1@2@p3',
      'p1@1@p4',
      'p2@1@p3'
    ]

    table.a_rules.drags = [
      'p1@2',
      'p2@2',
      'p3@1'
    ]

    table.a_cards.stacks = m_cards()


}


export default function ctrl(table: Table, options: {}) {

  make_solitaire(table)
}
