import type { App, Component } from "vue";
import type {
  NavigationGuard,
  NavigationGuardReturn,
  TerminalRoute,
  TerminalRouteLocationRaw,
  TerminalRouter,
  TerminalRouteRecord,
} from "./types.js";
import { ref } from "vue";
import { TerminalRouteKey, TerminalRouterKey } from "./context.js";

function normalize(
  to: TerminalRouteLocationRaw,
  records: Map<string, TerminalRouteRecord>,
): TerminalRoute {
  const raw = typeof to === "string" ? { name: to } : to;
  const record = records.get(raw.name);
  return {
    name: raw.name,
    params: raw.params,
    meta: record?.meta,
  };
}

function isRedirect(v: NavigationGuardReturn): v is TerminalRouteLocationRaw {
  return typeof v === "string" || (typeof v === "object" && v != null && "name" in v);
}

export function createTerminalRouter(
  options: Readonly<{
    routes: readonly TerminalRouteRecord[];
    initialRoute: TerminalRouteLocationRaw;
  }>,
): TerminalRouter {
  const records = new Map<string, TerminalRouteRecord>(options.routes.map((r) => [r.name, r]));

  const currentRoute = ref<TerminalRoute>(normalize(options.initialRoute, records));
  const history: TerminalRoute[] = [currentRoute.value];
  let index = 0;

  const befores: NavigationGuard[] = [];
  const resolves: NavigationGuard[] = [];
  const afters: Array<(to: TerminalRoute, from: TerminalRoute | null) => void> = [];

  async function runGuards(
    list: NavigationGuard[],
    to: TerminalRoute,
    from: TerminalRoute | null,
  ): Promise<NavigationGuardReturn> {
    for (const guard of list) {
      const r = await guard(to, from);
      if (r === false) return false;
      if (isRedirect(r)) return r;
    }
    return true;
  }

  async function navigate(
    toRaw: TerminalRouteLocationRaw,
    mode: "push" | "replace" | "pop",
  ): Promise<void> {
    const from = currentRoute.value;
    const to = normalize(toRaw, records);
    const fromRecord = records.get(from.name) ?? null;
    const toRecord = records.get(to.name) ?? null;

    const r1 = await runGuards(befores, to, from);
    if (r1 === false) return;
    if (isRedirect(r1)) return navigate(r1, mode);

    const r2 = await runGuards(resolves, to, from);
    if (r2 === false) return;
    if (isRedirect(r2)) return navigate(r2, mode);

    if (fromRecord?.onLeave) await fromRecord.onLeave(to, from);

    currentRoute.value = to;
    if (mode === "replace") {
      history[index] = to;
    } else if (mode === "push") {
      history.splice(index + 1);
      history.push(to);
      index = history.length - 1;
    }

    if (toRecord?.onEnter) await toRecord.onEnter(to, from);

    for (const hook of afters) hook(to, from);
  }

  const router: TerminalRouter = {
    currentRoute,
    async push(to) {
      await navigate(to, "push");
    },
    async replace(to) {
      await navigate(to, "replace");
    },
    async back() {
      if (index <= 0) return;
      const from = currentRoute.value;
      const to = history[index - 1]!;
      const fromRecord = records.get(from.name) ?? null;
      const toRecord = records.get(to.name) ?? null;

      const r1 = await runGuards(befores, to, from);
      if (r1 === false) return;
      if (isRedirect(r1)) return navigate(r1, "push");

      const r2 = await runGuards(resolves, to, from);
      if (r2 === false) return;
      if (isRedirect(r2)) return navigate(r2, "push");

      if (fromRecord?.onLeave) await fromRecord.onLeave(to, from);

      index -= 1;
      currentRoute.value = to;

      if (toRecord?.onEnter) await toRecord.onEnter(to, from);

      for (const hook of afters) hook(to, from);
    },
    beforeEach(guard) {
      befores.push(guard);
      return () => {
        const idx = befores.indexOf(guard);
        if (idx >= 0) befores.splice(idx, 1);
      };
    },
    beforeResolve(guard) {
      resolves.push(guard);
      return () => {
        const idx = resolves.indexOf(guard);
        if (idx >= 0) resolves.splice(idx, 1);
      };
    },
    afterEach(hook) {
      afters.push(hook);
      return () => {
        const idx = afters.indexOf(hook);
        if (idx >= 0) afters.splice(idx, 1);
      };
    },
    install(app: App) {
      app.provide(TerminalRouterKey, router);
      app.provide(TerminalRouteKey, currentRoute);
    },
  };

  return router;
}

export function resolveTerminalRouteComponent(
  router: TerminalRouter,
  routes: readonly TerminalRouteRecord[],
): Component | null {
  const cur = router.currentRoute.value;
  const rec = routes.find((r) => r.name === cur.name);
  return rec?.component ?? null;
}
