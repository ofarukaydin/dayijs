type RequestIdleCallbackHandle = any;
type RequestIdleCallbackOptions = {
  timeout: number;
};
type RequestIdleCallbackDeadline = {
  readonly didTimeout: boolean;
  timeRemaining: () => number;
};

declare global {
  interface Window {
    requestIdleCallback: (
      callback: (deadline: RequestIdleCallbackDeadline) => void,
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle;
    cancelIdleCallback: (handle: RequestIdleCallbackHandle) => void;
  }
}

type Props = { children?: Fiber[] } & Record<string, any>;

export type Fiber = {
  type: string | ((props?: Record<string, any>) => Fiber);
  props: Props;
  dom?: HTMLElement | Text;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber;
  effectTag?: "PLACEMENT" | "UPDATE" | "DELETION";
};

const createElement = (
  type: string,
  props?: Record<string, any> | undefined,
  ...children: any[]
) => {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
};

const createTextElement = (text: string) => {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
};

const createDom = (fiber: Fiber) => {
  console.log(fiber.type, "type");
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type as string);

  updateDom(dom, {}, fiber.props);

  return dom;
};

const isEvent = (key: string) => key.startsWith("on");
const isProperty = (key: string) => key !== "children" && !isEvent(key);
const isNew = (prev: Props, next: Props) => (key: string) => prev[key] !== next[key];
const isGone = (prev: Props, next: Props) => (key: string) => !(key in next);

const updateDom = (dom: HTMLElement | Text, prevProps: Props, nextProps: Props) => {
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      (dom as any)[name] = "";
    });

  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      (dom as any)[name] = nextProps[name];
    });
};

const commitDeletion = (fiber: Fiber | undefined, domParent: HTMLElement | Text) => {
  if (fiber?.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber?.child, domParent);
  }
};

const commitWork = (fiber?: Fiber) => {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber?.dom) {
    domParentFiber = domParentFiber?.parent;
  }

  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom) {
    domParent?.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate?.props || {}, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
};

const commitRoot = () => {
  deletions.forEach(commitWork);
  commitWork(wipRoot?.child);
  currentRoot = wipRoot;
  wipRoot = undefined;
};

const render = (element: Fiber, container: HTMLElement | Text | undefined) => {
  wipRoot = {
    type: element.type,
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
};

let nextUnitOfWork: Fiber | undefined = undefined;
let currentRoot: Fiber | undefined = undefined;
let wipRoot: Fiber | undefined = undefined;
let deletions: Fiber[] = [];

const workLoop = (deadline: RequestIdleCallbackDeadline) => {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  window.requestIdleCallback(workLoop);
};
window.requestIdleCallback(workLoop);

const reconcileChildren = (fiber: Fiber, elements: Fiber[]) => {
  let index = 0;
  let prevSibling = undefined;
  let oldFiber = fiber?.alternate?.child;

  while (index < elements.length || oldFiber) {
    const element = elements[index];
    let newFiber: Fiber = {
      type: element.type,
      props: element.props,
      parent: fiber,
    };

    const sameType = oldFiber && element && element.type == oldFiber.type;

    if (sameType && oldFiber) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber?.dom,
        parent: fiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: undefined,
        parent: fiber,
        alternate: undefined,
        effectTag: "PLACEMENT",
      };
    }
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (index === 0) {
      fiber.child = newFiber;
    } else if (prevSibling) {
      prevSibling.sibling = newFiber;
    }
    prevSibling = newFiber;
    index++;
  }
};

const updateFunctionComponent = (fiber: Fiber) => {
  if (fiber.type instanceof Function) {
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber, children);
  }
};
const updateHostComponent = (fiber: Fiber) => {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props?.children || []);
};

const performUnitOfWork = (fiber: Fiber): Fiber | undefined => {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber: Fiber | undefined = fiber;

  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
  return;
};

export default { createElement, render };
