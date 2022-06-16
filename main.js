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
  function getOwner() {
    return Owner;
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

  const _tmpl$ = /*#__PURE__*/template(`<vcardtable><bases></bases><cards></cards></vcardtable>`),
        _tmpl$2 = /*#__PURE__*/template(`<card-base></card-base>`),
        _tmpl$3 = /*#__PURE__*/template(`<card><div class="top"><rank></rank><suit></suit></div><div class="front"></div></card>`);

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
            _el$2 = _el$.firstChild,
            _el$3 = _el$2.nextSibling;

      (_ => setTimeout(() => table.$ref = _))(_el$);

      insert(_el$2, createComponent(For, {
        get each() {
          return table.bases;
        },

        children: (base, i) => createComponent(Base, {
          base: base
        })
      }));

      insert(_el$3, createComponent(For, {
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
          },

          get children() {
            return createComponent(Card, {
              card: card
            });
          }

        })
      }));

      createRenderEffect(() => className(_el$, table.klass));

      return _el$;
    })();
  };

  const Base = props => {
    return (() => {
      const _el$4 = document.importNode(_tmpl$2, true);

      (_ => setTimeout(() => props.base.$ref = _))(_el$4);

      _el$4._$owner = getOwner();

      createRenderEffect(_p$ => {
        const _v$ = props.base.style,
              _v$2 = props.base.klass;
        _p$._v$ = style(_el$4, _v$, _p$._v$);
        _v$2 !== _p$._v$2 && className(_el$4, _p$._v$2 = _v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });

      return _el$4;
    })();
  };

  const Card = props => {
    return (() => {
      const _el$5 = _tmpl$3.cloneNode(true),
            _el$6 = _el$5.firstChild,
            _el$7 = _el$6.firstChild,
            _el$8 = _el$7.nextSibling,
            _el$9 = _el$6.nextSibling;

      addEventListener(_el$5, "mousedown", props.onMouseDown, true);

      const _ref$ = props.ref;
      typeof _ref$ === "function" ? _ref$(_el$5) : props.ref = _el$5;

      insert(_el$7, () => props.card.rank);

      insert(_el$8, () => props.card.suit);

      insert(_el$9, () => props.card.suit);

      createRenderEffect(_p$ => {
        const _v$3 = props.card.style,
              _v$4 = props.card.klass;
        _p$._v$3 = style(_el$5, _v$3, _p$._v$3);
        _v$4 !== _p$._v$4 && className(_el$5, _p$._v$4 = _v$4);
        return _p$;
      }, {
        _v$3: undefined,
        _v$4: undefined
      });

      return _el$5;
    })();
  };

  delegateEvents(["mousedown"]);

  function card(suit, rank) { return rank + suit; }
  function card_suit(card) { return card[1]; }
  function card_color(card) { return colors$1[card_suit(card)]; }
  const colors$1 = { 'c': 'b', 's': 'b', 'h': 'r', 'd': 'r' };
  const suits$1 = ['c', 'h', 'd', 's'];
  const ranks$1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  function is_suit(_) { return suits$1.indexOf(_) > -1; }
  function is_rank(_) { return ranks$1.indexOf(_) > -1; }
  function is_card(_) { return _.length === 2 && is_rank(_[0]) && is_suit(_[1]); }
  const _deck = suits$1.flatMap(suit => ranks$1.map(rank => card(suit, rank)));
  [...Array(2).keys()].flatMap(_ => _deck.slice(0));
  [...Array(4).keys()].flatMap(_ => _deck.slice(0));

  function uci_pile(_) {
      let res = [];
      for (let i = 0; i < _.length; i += 2) {
          let card = _.slice(i, i + 2);
          if (is_card(card)) {
              res.push(card);
          }
      }
      return res;
  }
  function solitaire_fen(solitaire) {
      let piles = solitaire.piles.map(_ => [_[0], _[1].join('')].join(':')).join('/');
      let holes = solitaire.holes.map(_ => _.join('')).join('/');
      return [piles, holes].join(' ');
  }
  function fen_solitaire(fen) {
      let [_piles, _holes] = fen.split(' ');
      let piles = _piles.split('/').map(_ => {
          let [nb, pile] = _.split(':');
          return [parseInt(nb), uci_pile(pile)];
      });
      let holes = _holes.split('/').map(uci_pile);
      return new SolitairePov(piles, holes);
  }

  class Solitaire {
      constructor(piles, holes) {
          this.piles = piles;
          this.holes = holes;
      }
      get pov() {
          return SolitairePov.from_solitaire(this);
      }
      user_apply_drop(rule) {
          let [_o_name, _o_i, _drop_name] = rule.split('@');
          let [_, _o_stack_i] = _o_name.split('-');
          let [__, _drop_stack_i] = _drop_name.split('-');
          let o_i = parseInt(_o_i), drop_stack_i = parseInt(_drop_stack_i), o_stack_i = parseInt(_o_stack_i);
          let [o_backs, _o_pile] = this.piles[o_stack_i];
          let _drop_pile = this.piles[drop_stack_i][1];
          drop_pile(_o_pile, o_i - o_backs.length, _drop_pile);
          if (_o_pile.length === 0 && o_backs.length > 0) {
              let reveal_card = o_backs.pop();
              _o_pile.push(reveal_card);
          }
      }
  }
  Solitaire.make = (_deck) => {
      let piles = [];
      for (let i = 0; i < 7; i++) {
          piles.push([_deck.splice(0, i),
              _deck.splice(0, 1)]);
      }
      let holes = [[], [], [], []];
      return new Solitaire(piles, holes);
  };
  class SolitairePov {
      constructor(piles, holes) {
          this.piles = piles;
          this.holes = holes;
      }
      get fen() {
          return solitaire_fen(this);
      }
      get stacks() {
          return this.piles.map((_, i) => {
              let cards = [...Array(_[0]).keys()].map(_ => 'zz').join('') + _[1].join('');
              return [`p-${i}`, cards].join('@');
          });
      }
      get drags() {
          return this.piles.map((_, o_stack_i) => {
              _[0];
              let fronts = _[1];
              return [`p-${o_stack_i}`, fronts.length].join('@');
          });
      }
      get drops() {
          return this.piles.flatMap((o_stack, o_stack_i) => {
              let [back, fronts] = o_stack;
              return fronts.flatMap((_, f_i) => {
                  let o_i = back + f_i;
                  return this.piles
                      .map((drop_stack, drop_stack_i) => {
                      if (can_drop_piles(o_stack, f_i, drop_stack)) {
                          return [`p-${o_stack_i}`, o_i, `p-${drop_stack_i}`].join('@');
                      }
                  }).filter(Boolean);
              });
          });
      }
      get reveals() {
          return this.piles.map((o_stack, o_stack_i) => {
              let [back, fronts] = o_stack;
              if (fronts.length === 0 && back > 0) {
                  return [`p-${o_stack_i}`, back - 1].join('@');
              }
          }).filter(Boolean);
      }
      user_apply_drop(rule) {
          let [_o_name, _o_i, _drop_name] = rule.split('@');
          let [_, _o_stack_i] = _o_name.split('-');
          let [__, _drop_stack_i] = _drop_name.split('-');
          let o_i = parseInt(_o_i), drop_stack_i = parseInt(_drop_stack_i), o_stack_i = parseInt(_o_stack_i);
          let [o_back, _o_pile] = this.piles[o_stack_i];
          let _drop_pile = this.piles[drop_stack_i][1];
          drop_pile(_o_pile, o_i - o_back, _drop_pile);
      }
  }
  SolitairePov.from_fen = (fen) => {
      return fen_solitaire(fen);
  };
  SolitairePov.from_solitaire = (solitaire) => {
      let piles = solitaire.piles.map(_ => [_[0].length, _[1]]);
      let holes = solitaire.holes;
      return new SolitairePov(piles, holes);
  };
  function can_drop_piles(o_stack, f_i, drop_stack) {
      let [back, fronts] = o_stack;
      let card = fronts[f_i];
      let [drop_back, drop_fronts] = drop_stack;
      let drop_on_card = drop_fronts.slice(-1)[0];
      if (!drop_on_card) {
          if (drop_back === 0) {
              return true;
          }
          return false;
      }
      return card_color(card) !== card_color(drop_on_card);
  }
  function drop_pile(o_pile, o_f, drop_pile) {
      let cards = o_pile.splice(o_f);
      drop_pile.push(...cards);
  }

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
  function write(signal, fn) {
    return signal[1](_ => {
      fn(_);
      return _;
    });
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
    let immediate;

    function release_immediate(_p) {
      immediate = _p;
    }

    function acquire_pos(item, v, instant_track = false) {
      if (immediate) {
        let res = immediate;
        immediate = undefined;
        return res;
      }

      let _ = released_positions.get(item);

      if (!instant_track && _ && _.length > 0) {
        _.sort((a, b) => b.vs.distance(v) - a.vs.distance(v));

        return _.pop();
      } else {
        return make_position(item, v);
      }
    }

    return {
      release_immediate,
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

  const colors = {
    h: 'red',
    'd': 'red',
    'c': 'black',
    's': 'black'
  };
  const suits = ['h', 'd', 'c', 's'];
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const cards = ranks.flatMap(rank => suits.map(suit => rank + suit));
  const cards4 = [...Array(4).keys()].flatMap(_ => cards.slice(0));
  const backs4 = cards4.map(_ => 'zz');

  function hit_rectangle(rect, v) {
    let left = rect[0],
        top = rect[1],
        right = left + rect[2],
        bottom = top + rect[3];
    return left <= v.x && v.x <= right && top <= v.y && v.y <= bottom;
  }

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
    get klass() {
      return this.m_klass();
    }

    get dragging() {
      return !!this.m_drag()?.decay;
    }

    get cards() {
      return this.a_cards.cards;
    }

    get bases() {
      return this.a_cards.bases;
    }

    onScroll() {
      owrite(this._$clear_bounds);
    }

    set $ref($ref) {
      owrite(this._$ref, $ref);
    }

    apply_drop(rule) {
      this.on_apply_drop(rule);
    }

    constructor(on_apply_drop) {
      this.on_apply_drop = on_apply_drop;
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
      this.a_rules = make_rules();
      createEffect(on(() => this.dragging, (v, prev) => {
        if (!!prev && !v) {
          this.a_cards.drop();
        }
      }));
      this.m_klass = createMemo(() => [this.dragging ? 'dragging' : '']);
    }

  }

  function make_rules(table) {
    let _reveals = createSignal([]);

    let m_reveals = createMemo(() => {
      let reveals = read(_reveals);
      return reveals.map(_ => {
        let [o_stack_type, o_i] = _.split('@');

        return {
          o_stack_type: '__' + o_stack_type,
          o_i: parseInt(o_i)
        };
      });
    });

    let _drags = createSignal([]);

    let m_drags = createMemo(() => {
      let drags = read(_drags);
      return new Map(drags.map(_ => {
        let [name, nb] = _.split('@');

        return ['__' + name, parseInt(nb)];
      }));
    });

    let _drops = createSignal([]);

    let m_drops = createMemo(() => {
      let drops = read(_drops);
      return drops.map(_ => {
        let [from, o_i, to] = _.split('@');

        return {
          o_stack_type: '__' + from,
          o_i: parseInt(o_i),
          drop_stack_type: '__' + to,
          _
        };
      });
    });
    return {
      get reveals() {
        return m_reveals();
      },

      set reveals(reveals) {
        owrite(_reveals, reveals);
      },

      set drops(drops) {
        owrite(_drops, drops);
      },

      set drags(drags) {
        owrite(_drags, drags);
      },

      can_drag(o_stack_type, o_stack_i, o_stack_n, o_i) {
        let stack = m_drags().get(o_stack_type);

        if (stack) {
          return stack >= o_stack_n - o_i;
        }
      },

      drop_rule(o_stack_type, o_stack_i, o_stack_n, o_i, drop_stack_type) {
        let drop = m_drops().find(_ => _.o_stack_type === o_stack_type && _.o_i === o_i && _.drop_stack_type === drop_stack_type);
        return drop?._;
      },

      can_drop(o_stack_type, o_stack_i, o_stack_n, o_i, drop_stack_type) {
        return !!m_drops().find(_ => _.o_stack_type === o_stack_type && _.o_i === o_i && _.drop_stack_type === drop_stack_type);
      }

    };
  }

  function make_stack(table, stack, o_stack_i) {
    let [o_name, o_cards, o_pos] = stack.split('@');

    let _pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)));

    let o_stack_type = '__' + o_name;
    let gap = 0.2;
    let o_stack_n = o_cards.length / 2;
    let cards = [];

    for (let i = 0; i < o_cards.length; i += 2) {
      let o_i = i / 2;
      let v = Vec2.make(_pos.x, _pos.y + o_i * gap);
      cards.push([o_stack_type, o_stack_i, o_i, o_cards.slice(i, i + 2), `${v.x}-${v.y}`].join('@'));
    }

    let m_can_drop_base = createMemo(() => {
      let {
        can_drop_args
      } = table.a_cards;

      if (can_drop_args) {
        return table.a_rules.can_drop(...can_drop_args, o_name) && m_o_top();
      }
    });
    let base_flags = make_card_flags();
    let m_base_klass = createMemo(() => [base_flags.hovering_drop ? 'hovering-drop' : '', m_can_drop_base() ? 'can-drop' : ''].join(' ').trim().replace(/\s+/g, ' '));
    let m_base_style = createMemo(() => ({
      transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
    }));

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
        return _pos.mul(rect);
      }
    });
    let vs_rect_bounds = createMemo(() => {
      let rect = vs_rect();
      let abs = m_abs_pos();

      if (rect && abs) {
        return [abs.x, abs.y, rect.x, rect.y];
      }
    });
    let m_drop_rule = createMemo(() => {
      let {
        can_drop_args
      } = table.a_cards;

      if (can_drop_args) {
        return table.a_rules.drop_rule(...can_drop_args, o_stack_type);
      }
    });
    let base = {
      get drop_rule() {
        return m_drop_rule();
      },

      vs_rect,
      vs_rect_bounds,
      o_stack_i,

      set $ref($ref) {
        owrite(_$ref, $ref);
      },

      flags: base_flags,

      get klass() {
        return m_base_klass();
      },

      get style() {
        return m_base_style();
      }

    };
    return {
      base,
      o_name,
      o_stack_n,

      get pos() {
        return _pos;
      },

      cards
    };
  }

  function make_cards(table) {
    let _drags = createSignal([]);

    let _stacks = createSignal([]);

    let _can_drop_args = createSignal();

    let sticky_pos = make_sticky_pos((c, v) => make_position(v.x, v.y));
    cards4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)));
    backs4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)));
    let gap = 0.2;
    let m_stack_more = createMemo(mapArray(_stacks[0], (_, i) => make_stack(table, _, i())));
    let m_stack_cards = createMemo(() => m_stack_more().flatMap(_ => _.cards));
    let m_stack_bases = createMemo(() => m_stack_more().map(_ => _.base));

    let _cards = createMemo(() => {
      return [...m_stack_cards(), ...read(_drags)];
    });

    let m_cards = createMemo(mapArray(_cards, _ => {
      let [o_stack_type, o_stack_i, o_i, o_card, o_pos] = _.split('@');

      let m_o_stack_n = createMemo(() => {
        if (o_stack_type[0] === 'd') {
          return read(_drags).length;
        } else {
          return m_stack_more()[o_stack_i].o_stack_n;
        }
      });
      let [x, y] = o_pos.split('-').map(_ => parseFloat(_));

      let _p = sticky_pos.acquire_pos(o_card, Vec2.make(x, y));

      let res = make_card(table, _, m_o_stack_n, _p);
      onCleanup(() => {
        if (res.revealing) {
          sticky_pos.release_immediate(_p);
        } else {
          if (!res.flags.ghosting) {
            sticky_pos.release_pos(o_card, _p);
          }
        }
      });
      return res;
    }));

    let _drag_target = make_position(0, 0);

    let m_drag_cards = createMemo(() => {
      return m_cards().filter(_ => _.o_stack_type[0] === 'd');
    });
    let m_top_cards = createMemo(() => {
      return m_cards().filter(_ => !_.o_drag && _.o_top);
    });
    createEffect(on(() => _drag_target.vs, vs => {
      let drags = m_drag_cards();
      drags.forEach((_, o_i, _arr) => {
        let _i = 1 - o_i / _arr.length,
            _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8;

        let v = Vec2.make(0, o_i * gap);

        _.lerp_abs_rel(vs, v, 0.1 + _i2 * 0.9);
      });
    }));
    let m_drag_card = createMemo(() => {
      let drags = m_drag_cards();
      return drags[0];
    });
    createEffect(() => {
      let drag_card = m_drag_card();
      let top_cards = m_top_cards();
      let bases = m_stack_bases();
      const center = drag_card?.abs_pos_center;

      if (center) {
        let hit_top = top_cards.find(_ => {
          let res = _.vs_rect_bounds();

          if (res) {
            return hit_rectangle(res, center);
          }
        });
        top_cards.forEach(_ => _.flags.hovering_drop = _ === hit_top);
        let hit_base = bases.find(_ => {
          let res = _.vs_rect_bounds();

          if (res) {
            return hit_rectangle(res, center);
          }
        });
        bases.forEach(_ => _.flags.hovering_drop = _ === hit_base);
      } else {
        top_cards.forEach(_ => _.flags.hovering_drop = false);
        bases.forEach(_ => _.flags.hovering_drop = _ === false);
      }
    });

    function drop_target_for_pos_n(stack_i, i) {
      let {
        pos,
        o_stack_n
      } = m_stack_more()[stack_i];
      return Vec2.make(pos.x, pos.y + (i + o_stack_n) * gap);
    }

    return {
      drop() {
        let drags = m_drag_cards();
        let top_cards = m_top_cards();
        let bases = m_stack_bases();
        const drop_target = top_cards.find(_ => _.flags.hovering_drop) || bases.find(_ => _.flags.hovering_drop);
        drags.forEach((_, i, _arr) => {
          let settle_vs = _.v_pos;

          if (drop_target?.drop_rule) {
            settle_vs = drop_target_for_pos_n(drop_target.o_stack_i, i);
          }

          _.settle_for(settle_vs, () => {
            if (i !== _arr.length - 1) {
              return;
            }

            const rule = drop_target?.drop_rule;
            m_cards().forEach(_ => _.flags.ghosting = false);
            owrite(_drags, []);
            owrite(_can_drop_args, undefined);

            if (rule) {
              table.apply_drop(rule);
            }
          });
        });
      },

      set stacks(stacks) {
        owrite(_stacks, stacks);
      },

      get bases() {
        return m_stack_bases();
      },

      get cards() {
        return m_cards();
      },

      get can_drop_args() {
        return read(_can_drop_args);
      },

      get drag_card() {
        return m_drag_card();
      },

      find_on_drag_start() {
        if (read(_drags).length > 0) {
          return;
        }

        let cards = m_cards();
        let card = cards.find(_ => _.mouse_down);

        if (card && card.can_drag) {
          let stack_cards = cards.filter(_ => _.o_stack_i === card.o_stack_i);
          let drags = stack_cards.filter(_ => _.o_i >= card.o_i);
          drags.forEach(_ => _.flags.ghosting = true);
          let {
            o_stack_type,
            o_stack_i,
            o_stack_n,
            o_i,
            abs_pos
          } = card;

          if (abs_pos) {
            _drag_target.x = abs_pos.x;
            _drag_target.y = abs_pos.y;
          }

          let __o_stack_type = '_' + o_stack_type.slice(1);

          owrite(_can_drop_args, [__o_stack_type, o_stack_i, o_stack_n, o_i]);
          owrite(_drags, drags.map((_, o_i, _arr) => ['d_' + o_stack_type.slice(2), o_i, o_i, _.card_sr, _.o_pos].join('@')));
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

    let _hovering_drop = createSignal(false);

    return {
      get hovering_drop() {
        return read(_hovering_drop);
      },

      set hovering_drop(v) {
        owrite(_hovering_drop, v);
      },

      get ghosting() {
        return read(_ghosting);
      },

      set ghosting(v) {
        owrite(_ghosting, v);
      }

    };
  }

  function make_card(table, o_card, m_o_stack_n, _pos) {
    let [o_stack_type, _o_stack_i, _o_i, o_sr, o_pos] = o_card.split('@');
    let [o_rank, o_suit] = o_sr.split('');
    let [o_x, o_y] = o_pos.split('-').map(_ => parseFloat(_));
    let o_stack_i = parseInt(_o_stack_i),
        o_i = parseInt(_o_i);
    let v_pos = Vec2.make(o_x, o_y);
    let o_back = o_suit === o_rank;
    let o_drag = o_stack_type[0] === 'd';
    let m_o_top = createMemo(() => o_i === m_o_stack_n() - 1);
    let m_lerp_i = createMemo(() => 1 - o_i / m_o_stack_n());
    let flags = make_card_flags();
    let m_revealing = createMemo(() => !!table.a_rules.reveals.find(_ => _.o_stack_type === o_stack_type && _.o_i === o_i));
    let m_can_drag = createMemo(() => {
      let o_stack_n = m_o_stack_n();
      return table.a_rules.can_drag(o_stack_type, o_stack_i, o_stack_n, o_i);
    });
    let m_can_drop = createMemo(() => {
      let {
        can_drop_args
      } = table.a_cards;

      if (can_drop_args) {
        return table.a_rules.can_drop(...can_drop_args, o_stack_type) && m_o_top();
      }
    });
    let m_drop_rule = createMemo(() => {
      let {
        can_drop_args
      } = table.a_cards;

      if (can_drop_args) {
        return table.a_rules.drop_rule(...can_drop_args, o_stack_type);
      }
    });

    function settle_for(v_pos, on_settled = () => {}) {
      loop_for(ticks.thirds, (dt, dt0, _it) => {
        _pos.lerp(v_pos.x, v_pos.y, m_lerp_i() * 0.2 + _it * 0.8);

        if (_it === 1) {
          on_settled(_it);
        }
      });
    }

    if (!o_drag) {
      settle_for(v_pos);
    } else {
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
    let vs_rect_bounds = createMemo(() => {
      let rect = vs_rect();
      let abs = m_abs_pos();

      if (rect && abs) {
        return [abs.x, abs.y, rect.x, rect.y];
      }
    });
    let m_abs_pos_center = createMemo(() => {
      let rect = vs_rect();

      if (rect) {
        return _pos.vs.add(Vec2.unit.half).mul(rect);
      }
    });
    let m_klass = createMemo(() => [flags.hovering_drop ? 'hovering-drop' : '', flags.ghosting ? 'ghosting' : '', m_revealing() ? 'revealing' : '', m_can_drag() ? 'can-drag' : '', m_can_drop() ? 'can-drop' : '', ...(o_back ? back_klass : [colors[o_suit], rank_klasses[o_rank], suit_klasses[o_suit]])].join(' ').trim().replace(/\s+/g, ' '));
    let m_style = createMemo(() => ({
      transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
    }));
    return {
      get drop_rule() {
        return m_drop_rule();
      },

      get can_drop_args() {
        let o_stack_n = m_o_stack_n();

        let __o_stack_type = '_' + o_stack_type.slice(1);

        return [__o_stack_type, o_stack_i, o_stack_n, o_i];
      },

      get can_drop() {
        return m_can_drop();
      },

      get can_drag() {
        return m_can_drag();
      },

      get revealing() {
        return m_revealing();
      },

      settle_for,
      flags,
      o_stack_type,
      o_stack_i,

      get o_stack_n() {
        return m_o_stack_n();
      },

      o_i,

      get o_top() {
        return m_o_top();
      },

      get o_drag() {
        return o_drag;
      },

      get color() {
        return colors[o_suit];
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
      vs_rect_bounds,

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

      get abs_pos_center() {
        return m_abs_pos_center();
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

  const pile_pos = (() => {
    let res = {};

    for (let i = 0; i < 7; i++) {
      let x = 1.3 + i * 1.1;
      let y = 0.2;
      res[`p-${i}`] = `${x}-${y}`;
    }

    return res;
  })();

  function make_solitaire(fen, hooks) {
    let _pov = createSignal(SolitairePov.from_fen(fen), {
      equals: false
    });

    createEffect(() => {
      let fen = read(hooks._receive_fen);

      if (fen) {
        owrite(_pov, SolitairePov.from_fen(fen));
      }
    });

    let m_pov = () => read(_pov);

    let m_stacks = createMemo(() => {
      return m_pov().stacks.map(stack => {
        let [o_stack_type] = stack.split('@');
        return [stack, pile_pos[o_stack_type]].join('@');
      });
    });
    let m_reveals = createMemo(() => m_pov().reveals);
    let m_drags = createMemo(() => m_pov().drags);
    let m_drops = createMemo(() => m_pov().drops);

    function on_apply_drop(rule) {
      hooks.send_user_apply_drop(rule);
      write(_pov, _ => _.user_apply_drop(rule));
    }

    let table = new Table(on_apply_drop);
    createEffect(() => table.a_rules.drops = m_drops());
    createEffect(() => table.a_rules.drags = m_drags());
    createEffect(() => table.a_cards.stacks = m_stacks());
    createEffect(() => table.a_rules.reveals = m_reveals());
    return table;
  }

  function ctrl(options) {
    let solitaire = Solitaire.make(_deck.slice(0));
    let fen = solitaire.pov.fen;

    let _receive_fen = createSignal();

    let hooks = {
      send_user_apply_drop(rule) {
        solitaire.user_apply_drop(rule);
        setTimeout(() => {
          owrite(_receive_fen, solitaire.pov.fen);
        }, Math.random() * 600);
      },

      _receive_fen
    };
    return make_solitaire(fen, hooks);
  }

  function VCardTable(element, options = {}) {
    let table = ctrl();
    render(App(table), element);
    return {};
  }

  return VCardTable;

})();
