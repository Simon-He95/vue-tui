import { describe, expect, it } from "vitest";
import type { Component } from "vue";
import { createTerminalRouter } from "../src/vue.js";

const Dummy: Component = {} as any;

describe("terminal router", () => {
  it("push/replace/back update currentRoute", async () => {
    const router = createTerminalRouter({
      routes: [
        { name: "home", component: Dummy },
        { name: "chat", component: Dummy },
      ],
      initialRoute: "home",
    });

    expect(router.currentRoute.value.name).toBe("home");

    await router.push("chat");
    expect(router.currentRoute.value.name).toBe("chat");

    await router.replace("home");
    expect(router.currentRoute.value.name).toBe("home");

    await router.back();
    expect(router.currentRoute.value.name).toBe("home");
  });

  it("beforeEach can redirect", async () => {
    const router = createTerminalRouter({
      routes: [
        { name: "home", component: Dummy },
        { name: "blocked", component: Dummy },
      ],
      initialRoute: "home",
    });

    router.beforeEach((to) => {
      if (to.name === "blocked") return "home";
    });

    await router.push("blocked");
    expect(router.currentRoute.value.name).toBe("home");
  });

  it("calls onLeave/onEnter hooks", async () => {
    const calls: string[] = [];
    const router = createTerminalRouter({
      routes: [
        {
          name: "home",
          component: Dummy,
          onEnter: () => {
            calls.push("enter:home");
          },
        },
        {
          name: "chat",
          component: Dummy,
          onLeave: () => {
            calls.push("leave:chat");
          },
          onEnter: () => {
            calls.push("enter:chat");
          },
        },
      ],
      initialRoute: "home",
    });

    await router.push("chat");
    await router.back();

    expect(calls).toEqual(["enter:chat", "leave:chat", "enter:home"]);
  });
});
