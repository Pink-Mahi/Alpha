# Cascade Desktop (VS Code fork)

Fork of VS Code (microsoft/vscode @ 1.99.3) for the Cascade agentic coding IDE.

## Layout
```
apps/desktop/
  product.json          # Cascade branding/product config (overrides upstream's)
  vscode/               # upstream VS Code source (cloned, depth=1, tag 1.99.3)
  extensions/cascade/   # our built-in Cascade extension (agent panel, command center)
  build/                # fork build scripts (apply product.json, patch, build)
  scripts/
    setup.ts            # one-time: apply product.json, install deps, patch
    build.ts            # build the desktop app
    run.ts              # launch the built app
```

## Setup (after cloning upstream into vscode/)
```bash
cd apps/desktop
bun scripts/setup.ts    # apply product.json, yarn install in vscode/, patch
bun scripts/build.ts    # build
bun scripts/run.ts      # launch
```

## Rebase policy
Weekly rebase onto the latest stable VS Code tag. See ADR-0003.

## License
VS Code is MIT-licensed. Our changes and the Cascade extension are closed-source
(per ADR-0009). Attribution to the VS Code project is retained in the About box
and in `vscode/LICENSE.txt`.
