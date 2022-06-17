import { onCleanup } from 'solid-js'

function unbindable(
  el: EventTarget,
  eventName: string,
  callback: EventListener,
  options?: AddEventListenerOptions
): Unbind {
  el.addEventListener(eventName, callback, options);
  return () => el.removeEventListener(eventName, callback, options);
}

type Unbind = () => void

const VHeadsUp = props => {
  let { table } = props

  return (<>
    <vheadsup ref={_ => setTimeout(() => table.$ref=_)} class={table.klass}>
      <cards>
      <For each={table.cards}>{card =>
        <Card ref={_ => setTimeout(() => card.$ref = _ ) } card={card}/>
      }</For>
      </cards>
      <chips-w>
        <For each={table.chips}>{chips =>
          <Chips chips={chips}/>
        }</For>
      </chips-w>
    </vheadsup>
      </>)
}


const Chips = props => {
  return (<chips style={props.chips.style} class={props.chips.klass}>{props.chips.amount}</chips>)
}

const VTable = props => {
  return (
    <vcardtable ref={_ => setTimeout(() => table.$ref=_)} class={table.klass}>
       <bases>
         <For each={table.bases}>{ (base, i) =>
           <Base base={base}/>
         }</For>
       </bases>
       <cards>
         <For each={table.cards}>{ (card, i) =>
           <Show when={card.flags.ghosting}
           fallback= {
           <Card ref={_ => setTimeout(() => card.$ref = _ ) } onMouseDown={_ => card.mouse_down = true} card={card}/>
           }>
           <Card card={card}/>
           </Show>
         }</For>
       </cards>
      </vcardtable>)

}

const Base = props => {
  return (<card-base ref={_ => setTimeout(() => props.base.$ref = _) } style={props.base.style} class={props.base.klass}/>)
}

const Card = props => {
  return (<card 
      ref={props.ref}
      onMouseDown={props.onMouseDown} style={props.card.style} class={props.card.klass}>
        <div class='top'>
          <rank>{props.card.rank}</rank>
          <suit>{props.card.suit}</suit>
        </div>
        <div class="front">{props.card.suit}</div>
      </card>)
}



const tables = {
  'headsup': VHeadsUp
}

const App = table => props => {


  let unbinds = []

  unbinds.push(unbindable(document, 'scroll', () => table.onScroll(), { capture: true, passive: true }))
  unbinds.push(unbindable(window, 'resize', () => table.onScroll(), { passive: true }))

  onCleanup(() => {
    unbinds.forEach(_ => _())
  })


  return (<>
    <Dynamic component={tables[table.view]} table={table}/>
    </>)
}



export default App
