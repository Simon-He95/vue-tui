const allowed = process.env.VUE_TUI_ALLOW_DIRECT_PUBLISH === "1";

if (!allowed) {
  console.error(
    "Direct npm/pnpm publish is disabled. Use the GitHub Release workflow to publish the verified tarball.",
  );
  process.exit(1);
}
