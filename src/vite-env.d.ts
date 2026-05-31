/// <reference types="vite/client" />

// Raw-string imports of the legal source markdown (legal-source/*.md), rendered
// verbatim by src/components/legal/LegalDocument.tsx.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
