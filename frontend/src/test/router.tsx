import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Auth } from "../auth/AuthProvider";
import type { Sync } from "../sync/SyncProvider";
import { TestProviders } from "./providers";

/** Render a component inside a `MemoryRouter`, so anything using react-router
 *  (e.g. `<Link>`, `useLocation`) has the context it needs. `route` seeds the
 *  initial history entry — handy for asserting hash-driven behaviour. Auth and
 *  sync contexts are provided too (signed out and idle unless overridden). */
export function renderWithRouter(
  ui: ReactElement,
  {
    route = "/",
    auth,
    sync,
    ...options
  }: { route?: string; auth?: Auth; sync?: Sync } & Omit<
    RenderOptions,
    "wrapper"
  > = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <TestProviders auth={auth} sync={sync}>
          {children}
        </TestProviders>
      </MemoryRouter>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
