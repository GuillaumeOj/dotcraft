import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

/** Render a component inside a `MemoryRouter`, so anything using react-router
 *  (e.g. `<Link>`, `useLocation`) has the context it needs. `route` seeds the
 *  initial history entry — handy for asserting hash-driven behaviour. */
export function renderWithRouter(
  ui: ReactElement,
  {
    route = "/",
    ...options
  }: { route?: string } & Omit<RenderOptions, "wrapper"> = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
