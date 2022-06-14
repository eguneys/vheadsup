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


const App = table => props => {


  let unbinds = []

  unbinds.push(unbindable(document, 'scroll', () => table.onScroll(), { capture: true, passive: true }))
  unbinds.push(unbindable(window, 'resize', () => table.onScroll(), { passive: true }))

  onCleanup(() => {
    unbinds.forEach(_ => _())
  })


  return (<>
      <vcardtable ref={_ => setTimeout(() => table.$ref=_)}>
       <cards>
         <For each={table.cards}>{ card =>
           <Show when={card.dragging}
           fallback= {
           <card ref={_ => setTimeout(() => card.$ref = _ ) } onMouseDown={_ => card.mouse_down = true} style={card.style} class={card.klass}/>
           }>
           </Show>
         }</For>
         <For each={table.drag_cards}>{ card =>
         <card ref={_ => setTimeout(() => card.$ref = _ ) } onMouseDown={_ => card.mouse_down = true} style={card.style} class={card.klass}/>
           }</For>
       </cards>
      </vcardtable>
      </>)
}

export default App
