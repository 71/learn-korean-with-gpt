import { Accessor, createSignal, JSXElement, Show } from "solid-js";

/**
 * Returns a value stored in local storage, and a setter which also saves the given value to local storage.
 *
 * The value must be (de)serializable to JSON.
 */
export function createLocalStorageSignal<T>(
  key: string,
  defaultValue: () => T,
): [Accessor<T>, (value: T) => void] {
  const existing = localStorage.getItem(key);
  const [value, setValue] = createSignal<T>(
    existing === null ? defaultValue() : JSON.parse(existing),
  );
  return [value, (newValue) => {
    setValue(() => newValue);
    localStorage.setItem(key, JSON.stringify(newValue));
  }];
}

/**
 * Evaluates to `children(value)` if `value` is not `undefined`, and to `fallback` otherwise.
 */
export function WhenDefined<T>(
  props: Readonly<
    {
      value: T | undefined;
      fallback?: JSXElement;
      children(value: T): JSXElement;
    }
  >,
) {
  return (
    <Show
      when={props.value !== undefined}
      fallback={props.fallback}
    >
      {props.children(props.value!)}
    </Show>
  );
}

/**
 * Serializes the selections in {@link document.getSelection()}.
 */
export function flattenSelectionRanges(
  element: Element,
): readonly { start: number; end: number }[] {
  const docSelection = document.getSelection();
  const selections: { start: number; end: number }[] = [];

  if (docSelection === null) {
    return selections;
  }

  for (let i = 0; i < docSelection.rangeCount; i++) {
    const range = docSelection.getRangeAt(i);

    if (range.commonAncestorContainer.parentElement === element) {
      selections.push({ start: range.startOffset, end: range.endOffset });
      continue;
    }

    let start = range.startOffset;
    let node = element.firstChild;

    if (node === null) {
      // When editing very fast, we may access `node` before it has been given a value.
      break;
    }

    while (node.firstChild !== range.startContainer) {
      start += node.textContent!.length;
      if (node.nextSibling === null) {
        return [];
      }
      node = node.nextSibling;
    }

    let end = start - range.startOffset + range.endOffset;

    while (node.firstChild !== range.endContainer) {
      end += node.textContent!.length;
      if (node.nextSibling === null) {
        return [];
      }
      node = node.nextSibling;
    }

    selections.push({ start, end });
  }

  return selections;
}
