const App = table => props => {


  return (<>
      <vcardtable>
       <cards>
         <For each={table.stacks}>{ card =>
           <card onMouseDown={_ => card.mouse_down = true} style={card.style} klass={card.klass}/>
         }</For>
       </cards>
      </vcardtable>
      </>)
}

export default App
