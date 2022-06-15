var VCardTable = (function () {
  'use strict';

  const sharedConfig = {};
  function setHydrateContext(context) {
    sharedConfig.context = context;
  }

  const equalFn = (a, b) => a === b;
  const $TRACK = Symbol("solid-track");
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const NOTPENDING = {};
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let Listener = null;
  let Pending = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
          owner = Owner,
          unowned = fn.length === 0,
          root = unowned && !false ? UNOWNED : {
      owned: null,
      cleanups: null,
      context: null,
      owner: detachedOwner || owner
    },
          updateFn = unowned ? fn : () => fn(() => cleanNode(root));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      pending: NOTPENDING,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.pending !== NOTPENDING ? s.pending : s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE);
    c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.pending = NOTPENDING;
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function batch(fn) {
    if (Pending) return fn();
    let result;
    const q = Pending = [];
    try {
      result = fn();
    } finally {
      Pending = null;
    }
    runUpdates(() => {
      for (let i = 0; i < q.length; i += 1) {
        const data = q[i];
        if (data.pending !== NOTPENDING) {
          const pending = data.pending;
          data.pending = NOTPENDING;
          writeSignal(data, pending);
        }
      }
    }, false);
    return result;
  }
  function untrack(fn) {
    let result,
        listener = Listener;
    Listener = null;
    result = fn();
    Listener = listener;
    return result;
  }
  function on(deps, fn, options) {
    const isArray = Array.isArray(deps);
    let prevInput;
    let defer = options && options.defer;
    return prevValue => {
      let input;
      if (isArray) {
        input = Array(deps.length);
        for (let i = 0; i < deps.length; i++) input[i] = deps[i]();
      } else input = deps();
      if (defer) {
        defer = false;
        return undefined;
      }
      const result = untrack(() => fn(input, prevInput, prevValue));
      prevInput = input;
      return result;
    };
  }
  function onCleanup(fn) {
    if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
    return fn;
  }
  function readSignal() {
    const runningTransition = Transition ;
    if (this.sources && (this.state || runningTransition )) {
      const updates = Updates;
      Updates = null;
      this.state === STALE || runningTransition  ? updateComputation(this) : lookUpstream(this);
      Updates = updates;
    }
    if (Listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!this.observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        this.observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    if (Pending) {
      if (node.pending === NOTPENDING) Pending.push(node);
      node.pending = value;
      return value;
    }
    if (node.comparator) {
      if (node.comparator(node.value, value)) return value;
    }
    let TransitionRunning = false;
    node.value = value;
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i += 1) {
          const o = node.observers[i];
          if (TransitionRunning && Transition.disposed.has(o)) ;
          if (TransitionRunning && !o.tState || !TransitionRunning && !o.state) {
            if (o.pure) Updates.push(o);else Effects.push(o);
            if (o.observers) markDownstream(o);
          }
          if (TransitionRunning) ;else o.state = STALE;
        }
        if (Updates.length > 10e5) {
          Updates = [];
          if (false) ;
          throw new Error();
        }
      }, false);
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const owner = Owner,
          listener = Listener,
          time = ExecCount;
    Listener = Owner = node;
    runComputation(node, node.value, time);
    Listener = listener;
    Owner = owner;
  }
  function runComputation(node, value, time) {
    let nextValue;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      handleError(err);
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.observers && node.observers.length) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: null,
      pure
    };
    if (Owner === null) ;else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    const runningTransition = Transition ;
    if (node.state === 0 || runningTransition ) return;
    if (node.state === PENDING || runningTransition ) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state || runningTransition ) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if (node.state === STALE || runningTransition ) {
        updateComputation(node);
      } else if (node.state === PENDING || runningTransition ) {
        const updates = Updates;
        Updates = null;
        lookUpstream(node, ancestors[0]);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      handleError(err);
    } finally {
      Updates = null;
      if (!wait) Effects = null;
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    if (Effects.length) batch(() => {
      runEffects(Effects);
      Effects = null;
    });else {
      Effects = null;
    }
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
        userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);else queue[userLength++] = e;
    }
    if (sharedConfig.context) setHydrateContext();
    const resume = queue.length;
    for (i = 0; i < userLength; i++) runTop(queue[i]);
    for (i = resume; i < queue.length; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    const runningTransition = Transition ;
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        if (source.state === STALE || runningTransition ) {
          if (source !== ignore) runTop(source);
        } else if (source.state === PENDING || runningTransition ) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    const runningTransition = Transition ;
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state || runningTransition ) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
              index = node.sourceSlots.pop(),
              obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
                s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.owned) {
      for (i = 0; i < node.owned.length; i++) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = 0; i < node.cleanups.length; i++) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
    node.context = null;
  }
  function handleError(err) {
    throw err;
  }

  const FALLBACK = Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [],
        mapped = [],
        disposers = [],
        len = 0,
        indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [],
          i,
          j;
      newItems[$TRACK];
      return untrack(() => {
        let newLen = newItems.length,
            newIndices,
            newIndicesNext,
            temp,
            tempdisposers,
            tempIndexes,
            start,
            end,
            newEnd,
            item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        }
        else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
          for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === undefined ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== undefined && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, len = newLen);
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }

  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback ? fallback : undefined));
  }
  function Show(props) {
    let strictEqual = false;
    const condition = createMemo(() => props.when, undefined, {
      equals: (a, b) => strictEqual ? a === b : !a === !b
    });
    return createMemo(() => {
      const c = condition();
      if (c) {
        const child = props.children;
        return (strictEqual = typeof child === "function" && child.length > 0) ? untrack(() => child(c)) : child;
      }
      return props.fallback;
    });
  }

  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
        aEnd = a.length,
        bEnd = bLength,
        aStart = 0,
        bStart = 0,
        after = a[aEnd - 1].nextSibling,
        map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
                sequence = 1,
                t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }

  const $$EVENTS = "_$DX_DELEGATE";
  function render(code, element, init) {
    let disposer;
    createRoot(dispose => {
      disposer = dispose;
      element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
    });
    return () => {
      disposer();
      element.textContent = "";
    };
  }
  function template(html, check, isSVG) {
    const t = document.createElement("template");
    t.innerHTML = html;
    let node = t.content.firstChild;
    if (isSVG) node = node.firstChild;
    return node;
  }
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function className(node, value) {
    if (value == null) node.removeAttribute("class");else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
    } else node.addEventListener(name, handler);
  }
  function style(node, value, prev = {}) {
    const nodeStyle = node.style;
    const prevString = typeof prev === "string";
    if (value == null && prevString || typeof value === "string") return nodeStyle.cssText = value;
    prevString && (nodeStyle.cssText = undefined, prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function eventHandler(e) {
    const key = `$$${e.type}`;
    let node = e.composedPath && e.composedPath()[0] || e.target;
    if (e.target !== node) {
      Object.defineProperty(e, "target", {
        configurable: true,
        value: node
      });
    }
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    if (sharedConfig.registry && !sharedConfig.done) {
      sharedConfig.done = true;
      document.querySelectorAll("[id^=pl-]").forEach(elem => elem.remove());
    }
    while (node !== null) {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node = node.host && node.host !== node && node.host instanceof Node ? node.host : node.parentNode;
    }
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    if (sharedConfig.context && !current) current = [...parent.childNodes];
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
          multi = marker !== undefined;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (sharedConfig.context) return current;
      if (t === "number") value = value.toString();
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data = value;
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      if (sharedConfig.context) return current;
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      if (normalizeIncomingArray(array, value, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (sharedConfig.context) {
        for (let i = 0; i < array.length; i++) {
          if (array[i].parentNode) return current = array;
        }
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (Array.isArray(current)) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value instanceof Node) {
      if (sharedConfig.context && value.parentNode) return current = multi ? [value] : value;
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else ;
    return current;
  }
  function normalizeIncomingArray(normalized, array, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
          t;
      if (item instanceof Node) {
        normalized.push(item);
      } else if (item == null || item === true || item === false) ; else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item) || dynamic;
      } else if ((t = typeof item) === "string") {
        normalized.push(document.createTextNode(item));
      } else if (t === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item]) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else normalized.push(document.createTextNode(item.toString()));
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }

  const _tmpl$ = /*#__PURE__*/template(`<vcardtable><cards></cards></vcardtable>`),
        _tmpl$2 = /*#__PURE__*/template(`<card><div class="top"><rank></rank><suit></suit></div><div class="front"></div></card>`);

  function unbindable(el, eventName, callback, options) {
    el.addEventListener(eventName, callback, options);
    return () => el.removeEventListener(eventName, callback, options);
  }

  const App = table => props => {
    let unbinds = [];
    unbinds.push(unbindable(document, 'scroll', () => table.onScroll(), {
      capture: true,
      passive: true
    }));
    unbinds.push(unbindable(window, 'resize', () => table.onScroll(), {
      passive: true
    }));
    onCleanup(() => {
      unbinds.forEach(_ => _());
    });
    return (() => {
      const _el$ = _tmpl$.cloneNode(true),
            _el$2 = _el$.firstChild;

      (_ => setTimeout(() => table.$ref = _))(_el$);

      insert(_el$2, createComponent(For, {
        get each() {
          return table.cards;
        },

        children: (card, i) => createComponent(Show, {
          get when() {
            return card.flags.ghosting;
          },

          get fallback() {
            return createComponent(Card, {
              ref: _ => setTimeout(() => card.$ref = _),
              onMouseDown: _ => card.mouse_down = true,
              card: card
            });
          }

        })
      }), null);

      insert(_el$2, createComponent(For, {
        get each() {
          return table.drag_cards;
        },

        children: card => createComponent(Card, {
          ref: _ => setTimeout(() => card.$ref = _),
          onMouseDown: _ => card.mouse_down = true,
          card: card
        })
      }), null);

      return _el$;
    })();
  };

  const Card = props => {
    return (() => {
      const _el$3 = _tmpl$2.cloneNode(true),
            _el$4 = _el$3.firstChild,
            _el$5 = _el$4.firstChild,
            _el$6 = _el$5.nextSibling,
            _el$7 = _el$4.nextSibling;

      addEventListener(_el$3, "mousedown", props.onMouseDown, true);

      const _ref$ = props.ref;
      typeof _ref$ === "function" ? _ref$(_el$3) : props.ref = _el$3;

      insert(_el$5, () => props.card.rank);

      insert(_el$6, () => props.card.suit);

      insert(_el$7, () => props.card.suit);

      createRenderEffect(_p$ => {
        const _v$ = props.card.style,
              _v$2 = props.card.klass;
        _p$._v$ = style(_el$3, _v$, _p$._v$);
        _v$2 !== _p$._v$2 && className(_el$3, _p$._v$2 = _v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });

      return _el$3;
    })();
  };

  delegateEvents(["mousedown"]);

  class Vec2 {
    static from_angle = n => new Vec2(Math.cos(n), Math.sin(n));
    static make = (x, y) => new Vec2(x, y);

    static get unit() {
      return new Vec2(1, 1);
    }

    static get zero() {
      return new Vec2(0, 0);
    }

    get vs() {
      return [this.x, this.y];
    }

    get mul_inverse() {
      return new Vec2(1 / this.x, 1 / this.y);
    }

    get inverse() {
      return new Vec2(-this.x, -this.y);
    }

    get half() {
      return new Vec2(this.x / 2, this.y / 2);
    }

    get length_squared() {
      return this.x * this.x + this.y * this.y;
    }

    get length() {
      return Math.sqrt(this.length_squared);
    }

    get normalize() {
      if (this.length === 0) {
        return Vec2.zero;
      }

      return this.scale(1 / this.length);
    }

    get perpendicular() {
      return new Vec2(-this.y, this.x);
    }

    get clone() {
      return new Vec2(this.x, this.y);
    }

    get angle() {
      return Math.atan2(this.y, this.x);
    }

    constructor(x, y) {
      this.x = x;
      this.y = y;
    }

    dot(v) {
      return this.x * v.x + this.y * v.y;
    }

    cross(v) {
      return this.x * v.y - this.y * v.x;
    }

    project_to(v) {
      let lsq = v.length_squared;
      let dp = this.dot(v);
      return Vec2.make(dp * v.x / lsq, dp * v.y / lsq);
    }

    distance(v) {
      return this.sub(v).length;
    }

    addy(n) {
      return Vec2.make(this.x, this.y + n);
    }

    add_angle(n) {
      return Vec2.from_angle(this.angle + n);
    }

    scale(n) {
      let {
        clone
      } = this;
      return clone.scale_in(n);
    }

    scale_in(n) {
      this.x *= n;
      this.y *= n;
      return this;
    }

    add(v) {
      let {
        clone
      } = this;
      return clone.add_in(v);
    }

    add_in(v) {
      this.x += v.x;
      this.y += v.y;
      return this;
    }

    sub(v) {
      let {
        clone
      } = this;
      return clone.sub_in(v);
    }

    sub_in(v) {
      this.x -= v.x;
      this.y -= v.y;
      return this;
    }

    mul(v) {
      let {
        clone
      } = this;
      return clone.mul_in(v);
    }

    mul_in(v) {
      this.x *= v.x;
      this.y *= v.y;
      return this;
    }

    div(v) {
      let {
        clone
      } = this;
      return clone.div_in(v);
    }

    div_in(v) {
      this.x /= v.x;
      this.y /= v.y;
      return this;
    }

    set_in(x, y = this.y) {
      this.x = x;
      this.y = y;
      return this;
    }

  }

  function loop_for(duration, fn) {
    let _elapsed = 0;
    return loop((dt, dt0) => {
      _elapsed += dt;
      let i = Math.min(1, _elapsed / duration);
      fn(dt, dt0, i);

      if (i === 1) {
        return true;
      }
    });
  }
  function loop(fn) {
    let animation_frame_id;
    let fixed_dt = 1000 / 60;
    let timestamp0,
        min_dt = fixed_dt,
        max_dt = fixed_dt * 2,
        dt0 = fixed_dt;

    function step(timestamp) {
      let dt = timestamp0 ? timestamp - timestamp0 : fixed_dt;
      dt = Math.min(max_dt, Math.max(min_dt, dt));

      if (fn(dt, dt0)) {
        return;
      }

      dt0 = dt;
      timestamp0 = timestamp;
      animation_frame_id = requestAnimationFrame(step);
    }

    animation_frame_id = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animation_frame_id);
    };
  }
  function owrite(signal, fn) {
    if (typeof fn === 'function') {
      return signal[1](fn);
    } else {
      signal[1](_ => fn);
    }
  }
  function read(signal) {
    if (Array.isArray(signal)) {
      return signal[0]();
    } else {
      return signal();
    }
  }
  class DragDecay {
    static make = (drag, orig, target, no_start = false) => {
      return new DragDecay(drag, orig, target, no_start);
    };

    get move() {
      return Vec2.make(...this.drag.move).add(this.decay);
    }

    get translate() {
      return Vec2.make(...this.drag.move).sub(this.start);
    }

    get drop() {
      return this.drag.drop;
    }

    constructor(drag, orig, target, no_start) {
      this.drag = drag;
      this.orig = orig;
      this.target = target;
      this.no_start = no_start;
      this.start = Vec2.make(...(no_start ? drag.move : drag.start));
      this.decay = orig.sub(this.start);
    }

  }

  function make_position(x, y) {
    let _x = createSignal(x);

    let _y = createSignal(y);

    let m_p = createMemo(() => point(read(_x), read(_y)));
    let m_vs = createMemo(() => Vec2.make(read(_x), read(_y)));
    return {
      get point() {
        return m_p();
      },

      get x() {
        return read(_x);
      },

      set x(v) {
        owrite(_x, v);
      },

      get y() {
        return read(_y);
      },

      set y(v) {
        owrite(_y, v);
      },

      lerp(x, y, t = 0.5) {
        owrite(_x, _ => rlerp(_, x, ease(t)));
        owrite(_y, _ => rlerp(_, y, ease(t)));
      },

      lerp_vs(vs, t = 0.5) {
        batch(() => {
          owrite(_x, _ => rlerp(_, vs.x, ease(t)));
          owrite(_y, _ => rlerp(_, vs.y, ease(t)));
        });
      },

      get vs() {
        return m_vs();
      },

      get clone() {
        return untrack(() => make_position(read(_x), read(_y)));
      }

    };
  }

  const make_id_gen = () => {
    let id = 0;
    return () => ++id;
  };

  const id_gen = make_id_gen();
  /* https://gist.github.com/gre/1650294 */

  function ease(t) {
    return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rlerp(a, b, t) {
    let res = lerp(a, b, t);
    return Math.round(res * 100) / 100;
  }

  function point(x, y) {
    return `${x} ${y} ${id_gen()}`;
  }
  point(0, 0);

  function eventPosition(e) {
    if (e.clientX !== undefined && e.clientY !== undefined) {
      return [e.clientX, e.clientY];
    }

    if (e.targetTouches?.[0]) {
      return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    }
  }

  function move_threshold(move, start) {
    let dx = move[0] - start[0],
        dy = move[1] - start[1];
    let length = Math.sqrt(dx * dx + dy * dy);
    return length > 3;
  }

  class Mouse {
    _wheel = 0;
    _wheel0 = 0;

    get bounds() {
      if (!this._bounds) {
        this._bounds = this.$canvas.getBoundingClientRect();
      }

      return this._bounds;
    }

    get wheel() {
      return this._wheel;
    }

    get drag() {
      if (!!this._drag?.move) {
        return this._drag;
      }
    }

    get click() {
      if (!this._drag?.move && !!this._drag?.drop) {
        return this._drag.drop;
      }
    }

    get lclick() {
      if (this._drag?.button === 0) {
        return this.click;
      }
    }

    get rclick() {
      if (this._drag?.button === 2) {
        return this.click;
      }
    }

    get click_down() {
      if (!this._drag0 && !!this._drag && !this._drag?.move && !this._drag?.drop) {
        return this._drag.start;
      }
    }

    get hover() {
      if (!this._drag) {
        return this._hover;
      }
    }

    get drag_delta() {
      if (!!this._drag?.move) {
        return [this._drag.move[0] - this._drag.start[0], this._drag.move[1] - this._drag.start[1]];
      }
    }

    get up() {
      return this._up > 0;
    }

    constructor($canvas) {
      this.$canvas = $canvas;
    }

    eventPosition(e) {
      let res = eventPosition(e);
      let {
        bounds
      } = this;
      let scaleX = 1,
          scaleY = 1;

      if (res) {
        res[0] -= bounds.left;
        res[1] -= bounds.top;
        res[0] *= scaleX;
        res[1] *= scaleY;
      }

      return res;
    }

    disposes = [];

    dispose() {
      this.disposes.forEach(_ => _());
    }

    init() {
      this._up = 0;
      this._up0 = 0;
      let {
        $canvas,
        disposes
      } = this;
      $canvas.addEventListener('wheel', ev => {
        this._wheel = Math.sign(ev.deltaY);
      });
      $canvas.addEventListener('mousedown', ev => {
        if (!this._drag) {
          this._drag1 = {
            button: ev.button,
            start: this.eventPosition(ev)
          };
        }
      });
      $canvas.addEventListener('mousemove', ev => {
        if (this._drag) {
          this._drag.r_move = this.eventPosition(ev);
        } else {
          this._hover = this.eventPosition(ev);
        }
      });
      $canvas.addEventListener('contextmenu', ev => {
        ev.preventDefault();

        if (!this._drag) {
          this._drag1 = {
            button: ev.button,
            start: this.eventPosition(ev)
          };
        }
      });

      let onMouseUp = ev => {
        if (this._drag) {
          this._drag.drop = this.eventPosition(ev);
          this._drop0 = this._drag;
        }

        this._up = 1;
      };

      document.addEventListener('mouseup', onMouseUp);
      disposes.push(() => document.removeEventListener('mouseup', onMouseUp));

      const onScroll = () => {
        this._bounds = undefined;
      };

      window.addEventListener('resize', onScroll);
      document.addEventListener('scroll', onScroll);
      disposes.push(() => window.removeEventListener('resize', onScroll));
      disposes.push(() => document.removeEventListener('scroll', onScroll));
      return this;
    }

    update(dt, dt0) {
      if (this._up0 === this._up) {
        this._up = 0;
      } else {
        this._up0 = this._up;
      }

      if (this._wheel0 === this._wheel) {
        this._wheel = 0;
      } else {
        this._wheel0 = this._wheel;
      }

      if (this._drag) {
        this._drag.move0 = this._drag.move;

        if (this._drag.r_move !== undefined) {
          if (this._drag.move || move_threshold(this._drag.r_move, this._drag.start)) {
            this._drag.move = this._drag.r_move;
          }
        }

        if (!this._drop0) {
          if (this._drag.drop) {
            this._drag1 = undefined;
          }
        } else {
          this._drop0 = undefined;
        }
      }

      this._drag0 = this._drag;

      if (this._drag1 !== this._drag) {
        this._drag = this._drag1;
      }
    }

  }

  function make_sticky_pos(make_position) {
    let released_positions = new Map();

    function acquire_pos(item, v, instant_track = false) {
      let _ = released_positions.get(item);

      if (!instant_track && _ && _.length > 0) {
        _.sort((a, b) => b.vs.distance(v) - a.vs.distance(v));

        return _.pop();
      } else {
        return make_position(item, v);
      }
    }

    return {
      acquire_pos,

      release_pos(item, pos) {
        let res = released_positions.get(item);

        if (!res) {
          res = [];
          released_positions.set(item, res);
        }

        res.push(pos);
      }

    };
  }
  function make_drag(table, $ref) {
    let {
      on_hover,
      on_up,
      on_click,
      find_inject_drag,
      on_drag_update,
      find_on_drag_start
    } = table;

    let _drag_decay = createSignal();

    let m_drag_decay = createMemo(() => read(_drag_decay));

    let _update = createSignal([16, 16], {
      equals: false
    });

    let update = createMemo(() => read(_update));
    let mouse = new Mouse($ref).init();
    loop((dt, dt0) => {
      mouse.update(dt, dt0);
      owrite(_update, [dt, dt0]);
      let {
        click,
        hover,
        drag,
        up
      } = mouse;

      if (click) {
        on_click(click);
      }

      if (hover) {
        on_hover(hover);
      }

      if (up) {
        on_up();
      }

      if (drag && !!drag.move0) {
        if (!read(_drag_decay)) {
          let inject_drag = find_inject_drag();

          if (inject_drag) {
            owrite(_drag_decay, new DragDecay(drag, inject_drag.abs_pos, inject_drag));
          }
        }
      }

      if (drag && !drag.move0) {
        let res = find_on_drag_start(drag);

        if (res) {
          owrite(_drag_decay, new DragDecay(drag, res.vs, res));
        }
      }
    });
    createEffect(on(update, (dt, dt0) => {
      let decay = m_drag_decay();

      if (decay) {
        on_drag_update(decay);
        decay.target.lerp_vs(decay.move);

        if (decay.drop) {
          owrite(_drag_decay, undefined);
        }
      }
    }));
    return {
      get decay() {
        return m_drag_decay();
      }

    };
  }

  const rate = 1000 / 60;
  const ticks = {
    seconds: 60 * rate,
    half: 30 * rate,
    thirds: 20 * rate,
    lengths: 15 * rate,
    sixth: 10 * rate,
    five: 5 * rate,
    three: 3 * rate,
    one: 1 * rate
  };

  const suits = ['h', 'd', 'c', 's'];
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const cards = ranks.flatMap(rank => suits.map(suit => rank + suit));
  const cards4 = [...Array(4).keys()].flatMap(_ => cards.slice(0));
  const backs4 = cards4.map(_ => 'zz');

  function make_hooks(table) {
    return {
      on_hover() {},

      on_up() {
        table.cards.forEach(_ => _.mouse_down = false);
      },

      on_click() {},

      find_inject_drag() {},

      on_drag_update() {},

      find_on_drag_start() {
        return table.a_cards.find_on_drag_start();
      }

    };
  }

  class Table {
    get cards() {
      return this.a_cards.cards;
    }

    onScroll() {
      owrite(this._$clear_bounds);
    }

    set $ref($ref) {
      owrite(this._$ref, $ref);
    }

    constructor() {
      this._$ref = createSignal(undefined, {
        equals: false
      });
      let m_ref = createMemo(() => read(this._$ref));
      this._$clear_bounds = createSignal(undefined, {
        equals: false
      });
      this.m_rect = createMemo(() => {
        read(this._$clear_bounds);
        return m_ref()?.getBoundingClientRect();
      });
      this.m_drag = createMemo(() => {
        let $ref = m_ref();

        if ($ref) {
          return make_drag(make_hooks(this), $ref);
        }
      });
      this.a_cards = make_cards(this);
      createEffect(on(() => this.m_drag()?.decay, (v, prev) => {
        if (!!prev && !v) {
          this.a_cards.drop();
        }
      }));
      setTimeout(() => {
        this.a_cards.stacks = ['zzzz2h3d@2.2-2', 'zzzz2h3d@1-2', '2c@3-1'];
      }, 3000);
      setTimeout(() => {
        this.a_cards.stacks = ['zzzz2h3d@2.2-2', 'zzzz2h3d@1-2', '2c@4-2'];
      }, 1000);
    }

  }

  function make_cards(table) {
    let _drags = createSignal([]);

    let _stacks = createSignal([]);

    let sticky_pos = make_sticky_pos((c, v) => make_position(v.x, v.y));
    cards4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)));
    backs4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)));
    let gap = 0.2;
    let m_stack_cards = createMemo(() => {
      let stacks = read(_stacks);
      return stacks.flatMap((stack, o_stack_i, _arr) => {
        let o_stack_n = _arr.length;
        let [o_cards, o_pos] = stack.split('@');

        let _pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)));

        let res = [];

        for (let i = 0; i < o_cards.length; i += 2) {
          let o_i = i / 2;
          let v = Vec2.make(_pos.x, _pos.y + o_i * gap);
          res.push(['rr', o_stack_i, o_stack_n, o_i, o_cards.slice(i, i + 2), `${v.x}-${v.y}`].join('@'));
        }

        return res;
      });
    });

    let _cards = createMemo(() => {
      return [...m_stack_cards(), ...read(_drags)];
    });

    let m_cards = createMemo(mapArray(_cards, _ => {
      let [o_stack_type, o_stack_i, o_stack_n, o_i, o_card, o_pos] = _.split('@');

      let [x, y] = o_pos.split('-').map(_ => parseFloat(_));

      let _p = sticky_pos.acquire_pos(o_card, Vec2.make(x, y));

      onCleanup(() => {
        sticky_pos.release_pos(o_card, _p);
      });
      return make_card(table, _, _p);
    }));

    let _drag_target = make_position(0, 0);

    createEffect(on(() => _drag_target.vs, vs => {
      let drags = m_cards().filter(_ => _.o_stack_type === 'drag');
      drags.forEach((_, o_i, _arr) => {
        let _i = 1 - o_i / _arr.length,
            _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8;

        let v = Vec2.make(0, o_i * gap);

        _.lerp_abs_rel(vs, v, 0.1 + _i2 * 0.9);
      });
    }));
    return {
      drop() {
        let drags = m_cards().filter(_ => _.o_stack_type === 'drag');
        drags.forEach(_ => {
          _.settle_for(_.v_pos, () => {
            m_cards().forEach(_ => _.flags.ghosting = false);
            owrite(_drags, []);
          });
        });
      },

      set stacks(stacks) {
        owrite(_stacks, stacks);
      },

      get cards() {
        return m_cards();
      },

      find_on_drag_start() {
        if (read(_drags).length > 0) {
          return;
        }

        let cards = m_cards();
        let card = cards.find(_ => _.mouse_down);

        if (card) {
          let stack_cards = cards.filter(_ => _.stack_i === card.stack_i);
          let drags = stack_cards.filter(_ => _.o_i >= card.o_i);
          drags.forEach(_ => _.flags.ghosting = true);
          let {
            abs_pos
          } = card;

          if (abs_pos) {
            _drag_target.x = abs_pos.x;
            _drag_target.y = abs_pos.y;
          }

          owrite(_drags, drags.map((_, o_i, _arr) => ['drag', o_i, _arr.length, o_i, _.card_sr, _.o_pos].join('@')));
          return _drag_target;
        }
      }

    };
  }

  let back_klass = ['back'];
  let rank_klasses = {
    '1': 'ace',
    '2': 'two',
    '3': 'three',
    '4': 'four',
    '5': 'five',
    '6': 'six',
    '7': 'seven',
    '8': 'eight',
    '9': 'nine',
    'T': 'ten',
    'J': 'jack',
    'Q': 'queen',
    'K': 'king'
  };
  let suit_klasses = {
    's': 'spades',
    'd': 'diamonds',
    'h': 'hearts',
    'c': 'clubs'
  };

  function make_card_flags() {
    let _ghosting = createSignal(false);

    return {
      get ghosting() {
        return read(_ghosting);
      },

      set ghosting(v) {
        owrite(_ghosting, v);
      }

    };
  }

  function make_card(table, o_card, _pos) {
    let [o_stack_type, o_stack_i, o_stack_n, o_i, o_sr, o_pos] = o_card.split('@');
    let [o_rank, o_suit] = o_sr.split('');
    let [o_x, o_y] = o_pos.split('-').map(_ => parseFloat(_));
    let v_pos = Vec2.make(o_x, o_y);
    let o_back = o_suit === o_rank;

    let _lerp_i = 1 - o_stack_i / o_stack_n;

    function settle_for(v_pos, on_settled = () => {}) {
      loop_for(ticks.thirds, (dt, dt0, _it) => {
        _pos.lerp(v_pos.x, v_pos.y, _lerp_i * 0.2 + _it * 0.8);

        if (_it === 1) {
          on_settled(_it);
        }
      });
    }

    {
      _pos.x = v_pos.x;
      _pos.y = v_pos.y;
    }

    let _$ref = createSignal();

    let m_rect = createMemo(() => {
      read(table._$clear_bounds);
      return read(_$ref)?.getBoundingClientRect();
    });
    let vs_rect = createMemo(() => {
      let r = m_rect();

      if (r) {
        return Vec2.make(r.width, r.height);
      }
    });
    let m_abs_pos = createMemo(() => {
      let rect = vs_rect();

      if (rect) {
        return _pos.vs.mul(rect);
      }
    });
    let m_klass = createMemo(() => (o_back ? back_klass : [rank_klasses[o_rank], suit_klasses[o_suit]]).join(' '));
    let m_style = createMemo(() => ({
      transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
    }));
    return {
      settle_for,
      flags: make_card_flags(),

      get o_stack_type() {
        return o_stack_type;
      },

      get stack_i() {
        return o_stack_i;
      },

      get o_i() {
        return o_i;
      },

      get suit() {
        return o_suit;
      },

      get rank() {
        return o_rank;
      },

      card_sr: o_sr,
      card_ref: o_card,
      vs_rect,

      set $ref($ref) {
        owrite(_$ref, $ref);
      },

      lerp_abs(move) {
        let rect = vs_rect();

        if (rect) {
          _pos.lerp_vs(move.div(rect));
        }
      },

      lerp_abs_rel(move, rel, i) {
        let rect = vs_rect();

        if (rect) {
          _pos.lerp_vs(move.div(rect).add(rel), i);
        }
      },

      v_pos,

      get o_pos() {
        let x = _pos.x,
            y = _pos.y;
        return `${x}-${y}`;
      },

      get pos() {
        return _pos;
      },

      get abs_pos() {
        return m_abs_pos();
      },

      lerp_rel(x, y, i) {
        _pos.lerp(x, y, i);
      },

      get style() {
        return m_style();
      },

      get klass() {
        return m_klass();
      }

    };
  }

  function VCardTable(element, options = {}) {
    let table = new Table();
    render(App(table), element);
    return {};
  }

  return VCardTable;

})();
