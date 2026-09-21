/** A minimal `MediaQueryList` stub for jsdom, which ships no `matchMedia`. The
 *  listener methods are no-ops — tests that need to drive change events build
 *  their own richer stub. */
export function createMatchMedia(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}
