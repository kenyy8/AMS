# DFD Diagrams

This folder contains Data Flow Diagrams (DFD) for the project in Mermaid source format and rendered images.

Files:
- `dfd-level0.mmd` - Mermaid source for DFD Level 0 (high-level)
- `dfd-level1.mmd` - Mermaid source for DFD Level 1 (decomposed)
- `dfd-level0.svg`, `dfd-level0.png` (generated)
- `dfd-level1.svg`, `dfd-level1.png` (generated)

To render locally (requires Node.js):

```powershell
npx @mermaid-js/mermaid-cli -i docs/dfd-level0.mmd -o docs/dfd-level0.svg
npx @mermaid-js/mermaid-cli -i docs/dfd-level0.mmd -o docs/dfd-level0.png
npx @mermaid-js/mermaid-cli -i docs/dfd-level1.mmd -o docs/dfd-level1.svg
npx @mermaid-js/mermaid-cli -i docs/dfd-level1.mmd -o docs/dfd-level1.png
```

If you prefer, I can attempt to render these from this environment and commit the generated images.
