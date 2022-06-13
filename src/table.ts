import { ticks } from './shared'
import { createRoot, createEffect, onCleanup, createSignal, createMemo, mapArray } from 'solid-js'
import { owrite, read, write, loop_for } from './play'
import { make_position } from './make_util'
import { Vec2 } from 'soli2d'

/*
setCards(['', '', ''])

'zzzz2h3d@a-b'

'2h@100-50'

*/


function stack_pp(ref: StackRef) {
  return ref.split('@')
}

function pos_vs(pos: Pos) {
  return pos.split('-').map(_ => parseFloat(_))
}

function stack_cards(cards: Cards) {
  let res = []
  for (let i = 0; i < cards.length; i+= 2) {
    let rank = cards[i],
      suit = cards[i+1]
    res.push([rank, suit])
  }
  return res
}

export class Table {

  get stacks() {
    return this.a_stacks.stacks
  }



  constructor() {
    this.a_stacks = make_stacks(this)

    this.a_stacks.stacks = [
      'zzzz2h3d@5.2-2', 
      'zzzz2h3d@2.2-2', 
      'zzzz2h3d@1-2', 
      'zzzz2h3d@4-2', 
    ]
  }

}


const make_stacks = (table: Table) => {

  let _stacks = createSignal([])

  let m_poss_by_card = createMemo(() => {
    let stacks = read(_stacks)

    return stacks.flatMap(stack => {
      let [_cards, _pos] = stack_pp(stack)

      let v_pos = Vec2.make(...pos_vs(_pos))
      let cards = stack_cards(_cards)

      return cards.map((card, i) =>
       [card, v_pos.add(Vec2.make(0, 0.2 * i))])
    })
  })


  let _p_cards = make_poss_resource(
  m_poss_by_card,
  (card, pos, v_pos) => make_card(table, card, pos, v_pos),
  () => make_position(-1, 3.5))

  let m_cards = () => _p_cards.items

  createEffect(() => {
    let cards = m_cards()
    let cancel = loop_for(ticks.half * 20, (dt, dt0, i) => {
      cards.forEach(_ => _.settle_loop(dt, dt0, i))
    })
    onCleanup(() => {
      cancel()
    })
  })

  return {
    set stacks(stacks: Array<Stack>) {
      owrite(_stacks, stacks)
    },
    get stacks() {
      return m_cards()
    }
  }
}

let back_klass = ['back']
let rank_klasses = { '1': 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king' }
let suit_klasses = { 's': 'spades', 'd': 'diamonds', 'h': 'hearts', 'c': 'clubs' }

const make_card = (table: Table, 
                   card: Card, 
                   _pos: Pos,
                   v_pos: Pos) => {

  let [rank, suit] = card
  let back = rank === suit


  let m_klass = createMemo(() => (
            back ? back_klass : [ 
              rank_klasses[rank],
              suit_klasses[suit]
            ]).join(' '))

  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
  }))



  return {
    settle_loop(dt, dt0, i) {
      _pos.lerp(v_pos.x, v_pos.y, i)
    },
    get style() {
      return m_style()
    },
    get klass() {
      return m_klass()
    }
  }
}



function make_poss_resource<ItemRef, Item, Pos>(
  _m_poss_by_item: (_: ItemRef) => [Item, Pos] ,
  make_item: (_: Item, p: Pos) => any, 
  make_position: () => Pos) {

  let _m_items = createMemo(() => _m_poss_by_item().map(_ => _[0]))

  let m_items = createMemo(() => {
    let _poss_by_item = _m_poss_by_item()
    let _used_poss = []
    return mapArray(_m_items, _ => {
      let [item, v_pos] = _poss_by_item.find(_a => _a[0] === _ && !_used_poss.includes(_a) && _used_poss.push(_a))

      let _pos = acquire_pos(item)
      return make_item(item, _pos, v_pos)
    })()
  })

  let released_positions = new Map<Item, Array<Pos>>()

  function acquire_pos(item: Item) {
    let _ = released_positions.get(item)
    if (_ && _.length > 0) {
      return _.pop()
    } else {
      return make_position(item)
    }
  }

  let i = make_drag()
  setTimeout(() => {
    console.log(i)
    i = undefined
  },1000)

  return {
    
    release_pos(item: Item, pos: Position) {
      let res = released_positions.get(item)

      if (!res) {
        res = []
        released_positions.set(item, res)
      }
      res.push(pos)
    },
    get items() {
      return m_items()
    }
  }
}


const make_drag = () => {
  return createRoot(dispose => {
    let _drag_decay = createSignal()
    let m_drag_decay = createMemo(() => read(_drag_decay))


    createEffect(() => {
      let decay = m_drag_decay()
      if (decay) {
        createEffect(on(update, (dt, dt0) => {

          decay.target.pos.vs = decay.move

          if (decay.drop) {
            owrite(_drag_decay, undefined)
          }
        }))
      }
    })



    return {}
  }) 
}
