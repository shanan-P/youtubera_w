// This file contains type declarations for Remix.
// It's used by the TypeScript compiler to understand the types of modules that are not explicitly typed.
/// <reference types="@remix-run/node" />

// Allow importing CSS (and ?url) in TS files
declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.css?url" {
  const url: string;
  export default url;
}