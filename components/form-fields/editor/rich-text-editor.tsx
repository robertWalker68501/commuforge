"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import { Editor } from "@tinymce/tinymce-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { useUploadThing } from "@/utils/uploadthing";

import {
  editorPresets,
  type EditorPreset,
} from "./editor-presets";

type TinyMceInit = NonNullable<
  ComponentProps<typeof Editor>["init"]
>;

type ImagesUploadHandler = NonNullable<
  TinyMceInit["images_upload_handler"]
>;

type ShadcnEditorTheme = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
  ring: string;
  radius: string;
  fontSans: string;
  fontMono: string;
};

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const LIGHT_FALLBACK: ShadcnEditorTheme = {
  background: "#ffffff",
  foreground: "#18181b",
  card: "#ffffff",
  cardForeground: "#18181b",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  accent: "#f4f4f5",
  accentForeground: "#18181b",
  primary: "#0d9488",
  primaryForeground: "#ffffff",
  border: "#e4e4e7",
  ring: "#14b8a6",
  radius: "0.625rem",
  fontSans:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

const DARK_FALLBACK: ShadcnEditorTheme = {
  background: "#09090b",
  foreground: "#fafafa",
  card: "#09090b",
  cardForeground: "#fafafa",
  muted: "#27272a",
  mutedForeground: "#a1a1aa",
  accent: "#27272a",
  accentForeground: "#fafafa",
  primary: "#2dd4bf",
  primaryForeground: "#042f2e",
  border: "#27272a",
  ring: "#2dd4bf",
  radius: "0.625rem",
  fontSans:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

function cssVar(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: string,
) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function readShadcnTheme(isDark: boolean): ShadcnEditorTheme {
  const fallback = isDark ? DARK_FALLBACK : LIGHT_FALLBACK;

  if (typeof window === "undefined") {
    return fallback;
  }

  const root = window.getComputedStyle(
    document.documentElement,
  );
  const body = window.getComputedStyle(document.body);

  return {
    background: cssVar(root, "--background", fallback.background),
    foreground: cssVar(root, "--foreground", fallback.foreground),
    card: cssVar(root, "--card", fallback.card),
    cardForeground: cssVar(
      root,
      "--card-foreground",
      fallback.cardForeground,
    ),
    muted: cssVar(root, "--muted", fallback.muted),
    mutedForeground: cssVar(
      root,
      "--muted-foreground",
      fallback.mutedForeground,
    ),
    accent: cssVar(root, "--accent", fallback.accent),
    accentForeground: cssVar(
      root,
      "--accent-foreground",
      fallback.accentForeground,
    ),
    primary: cssVar(root, "--primary", fallback.primary),
    primaryForeground: cssVar(
      root,
      "--primary-foreground",
      fallback.primaryForeground,
    ),
    border: cssVar(root, "--border", fallback.border),
    ring: cssVar(root, "--ring", fallback.ring),
    radius: cssVar(root, "--radius", fallback.radius),
    fontSans:
      cssVar(root, "--font-sans", "") ||
      body.fontFamily ||
      fallback.fontSans,
    fontMono: cssVar(
      root,
      "--font-mono",
      fallback.fontMono,
    ),
  };
}

function createContentStyle(theme: ShadcnEditorTheme) {
  return `
    html,
    body {
      background: ${theme.background};
      color: ${theme.foreground};
    }

    body {
      font-family: ${theme.fontSans};
      font-size: 16px;
      line-height: 1.7;
      margin: 0;
      min-height: 100%;
      padding: 1rem;
    }

    body[data-mce-placeholder]::before,
    .mce-content-body[data-mce-placeholder]::before,
    .mce-content-body.mce-content-readonly[data-mce-placeholder]::before {
      color: ${theme.mutedForeground} !important;
      opacity: 1 !important;
      -webkit-text-fill-color: ${theme.mutedForeground} !important;
    }

    ::selection {
      background: color-mix(in oklab, ${theme.primary} 30%, transparent);
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      color: ${theme.foreground};
      font-weight: 650;
      letter-spacing: -0.025em;
      line-height: 1.2;
    }

    a {
      color: ${theme.primary};
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    img {
      border-radius: ${theme.radius};
      display: block;
      height: auto;
      margin: 1.25rem auto;
      max-width: 100%;
    }

    figcaption,
    blockquote {
      color: ${theme.mutedForeground};
    }

    blockquote {
      border-left: 3px solid ${theme.primary};
      margin: 1.25rem 0;
      padding: 0.25rem 0 0.25rem 1rem;
    }

    code {
      background: ${theme.muted};
      border: 1px solid ${theme.border};
      border-radius: calc(${theme.radius} * 0.6);
      color: ${theme.foreground};
      font-family: ${theme.fontMono};
      font-size: 0.875em;
      padding: 0.125rem 0.35rem;
    }

    pre {
      background: ${theme.muted};
      border: 1px solid ${theme.border};
      border-radius: ${theme.radius};
      color: ${theme.foreground};
      font-family: ${theme.fontMono};
      overflow-x: auto;
      padding: 1rem;
    }

    pre code {
      background: transparent;
      border: 0;
      padding: 0;
    }

    table {
      border-collapse: collapse;
      margin: 1rem 0;
      width: 100%;
    }

    th,
    td {
      border: 1px solid ${theme.border};
      padding: 0.625rem 0.75rem;
      text-align: left;
    }

    th {
      background: ${theme.muted};
      color: ${theme.foreground};
      font-weight: 600;
    }
  `;
}

function createChromeStyle(theme: ShadcnEditorTheme) {
  return `
    .forgeui-rich-text-editor {
      --editor-background: ${theme.background};
      --editor-foreground: ${theme.foreground};
      --editor-card: ${theme.card};
      --editor-card-foreground: ${theme.cardForeground};
      --editor-muted: ${theme.muted};
      --editor-muted-foreground: ${theme.mutedForeground};
      --editor-accent: ${theme.accent};
      --editor-accent-foreground: ${theme.accentForeground};
      --editor-primary: ${theme.primary};
      --editor-border: ${theme.border};
      --editor-radius: ${theme.radius};
    }

    .forgeui-rich-text-editor .tox.tox-tinymce {
      background: var(--editor-background) !important;
      border: 0 !important;
      border-radius: calc(var(--editor-radius) - 1px) !important;
      color: var(--editor-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-editor-header,
    .forgeui-rich-text-editor .tox .tox-menubar,
    .forgeui-rich-text-editor .tox .tox-toolbar,
    .forgeui-rich-text-editor .tox .tox-toolbar-overlord,
    .forgeui-rich-text-editor .tox .tox-toolbar__primary,
    .forgeui-rich-text-editor .tox .tox-toolbar__overflow,
    .forgeui-rich-text-editor .tox .tox-statusbar {
      background: var(--editor-card) !important;
      color: var(--editor-card-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-editor-header {
      border-bottom: 1px solid var(--editor-border) !important;
      box-shadow: none !important;
    }

    .forgeui-rich-text-editor .tox .tox-mbtn,
    .forgeui-rich-text-editor .tox .tox-tbtn,
    .forgeui-rich-text-editor .tox .tox-split-button,
    .forgeui-rich-text-editor .tox .tox-split-button__chevron,
    .forgeui-rich-text-editor .tox .tox-statusbar a,
    .forgeui-rich-text-editor .tox .tox-statusbar__path-item,
    .forgeui-rich-text-editor .tox .tox-statusbar__wordcount {
      color: var(--editor-muted-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-tbtn svg,
    .forgeui-rich-text-editor .tox .tox-mbtn svg,
    .forgeui-rich-text-editor .tox .tox-split-button svg,
    .forgeui-rich-text-editor .tox .tox-icon svg {
      color: var(--editor-muted-foreground) !important;
      fill: var(--editor-muted-foreground) !important;
      stroke: var(--editor-muted-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-tbtn svg *,
    .forgeui-rich-text-editor .tox .tox-mbtn svg *,
    .forgeui-rich-text-editor .tox .tox-split-button svg *,
    .forgeui-rich-text-editor .tox .tox-icon svg * {
      fill: currentColor !important;
      stroke: currentColor !important;
    }

    .forgeui-rich-text-editor .tox .tox-tbtn:not(.tox-tbtn--enabled),
    .forgeui-rich-text-editor .tox .tox-mbtn:not(.tox-mbtn--active),
    .forgeui-rich-text-editor
      .tox
      .tox-mbtn:not([aria-expanded="true"]),
    .forgeui-rich-text-editor
      .tox
      .tox-split-button:not(:hover):not(:focus-within) {
      background: transparent !important;
      color: var(--editor-muted-foreground) !important;
    }

    .forgeui-rich-text-editor
      .tox
      .tox-tbtn:not(.tox-tbtn--enabled)
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-mbtn:not(.tox-mbtn--active)
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-mbtn:not([aria-expanded="true"])
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-split-button:not(:hover):not(:focus-within)
      svg {
      color: var(--editor-muted-foreground) !important;
      fill: var(--editor-muted-foreground) !important;
      stroke: var(--editor-muted-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-mbtn:hover,
    .forgeui-rich-text-editor .tox .tox-mbtn:focus,
    .forgeui-rich-text-editor .tox .tox-tbtn:hover,
    .forgeui-rich-text-editor .tox .tox-tbtn:focus {
      background: var(--editor-accent) !important;
      color: var(--editor-accent-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-tbtn--enabled,
    .forgeui-rich-text-editor .tox .tox-tbtn--enabled:hover,
    .forgeui-rich-text-editor .tox .tox-tbtn--enabled:focus,
    .forgeui-rich-text-editor .tox .tox-tbtn--active,
    .forgeui-rich-text-editor .tox .tox-mbtn--active,
    .forgeui-rich-text-editor .tox .tox-mbtn[aria-expanded="true"],
    .forgeui-rich-text-editor .tox .tox-split-button:focus,
    .forgeui-rich-text-editor .tox .tox-split-button:hover {
      background: color-mix(
        in oklab,
        var(--editor-primary) 18%,
        transparent
      ) !important;
      color: var(--editor-primary) !important;
    }

    .forgeui-rich-text-editor .tox .tox-tbtn--enabled svg,
    .forgeui-rich-text-editor .tox .tox-tbtn--active svg,
    .forgeui-rich-text-editor .tox .tox-mbtn--active svg,
    .forgeui-rich-text-editor
      .tox
      .tox-mbtn[aria-expanded="true"]
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-split-button:hover
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-split-button:focus-within
      svg {
      color: var(--editor-primary) !important;
      fill: var(--editor-primary) !important;
      stroke: var(--editor-primary) !important;
    }

    .forgeui-rich-text-editor .tox .tox-tbtn--enabled svg *,
    .forgeui-rich-text-editor .tox .tox-tbtn--active svg *,
    .forgeui-rich-text-editor .tox .tox-mbtn--active svg *,
    .forgeui-rich-text-editor
      .tox
      .tox-mbtn[aria-expanded="true"]
      svg *,
    .forgeui-rich-text-editor
      .tox
      .tox-split-button:hover
      svg *,
    .forgeui-rich-text-editor
      .tox
      .tox-split-button:focus-within
      svg * {
      fill: currentColor !important;
      stroke: currentColor !important;
    }

    .forgeui-rich-text-editor
      .tox
      .tox-collection__item--active,
    .forgeui-rich-text-editor
      .tox
      .tox-collection__item--enabled,
    .forgeui-rich-text-editor
      .tox
      .tox-collection__item[aria-checked="true"] {
      background: color-mix(
        in oklab,
        var(--editor-primary) 18%,
        transparent
      ) !important;
      color: var(--editor-primary) !important;
    }

    .forgeui-rich-text-editor
      .tox
      .tox-collection__item--active
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-collection__item--enabled
      svg,
    .forgeui-rich-text-editor
      .tox
      .tox-collection__item[aria-checked="true"]
      svg {
      fill: var(--editor-primary) !important;
    }

    .forgeui-rich-text-editor .tox .tox-toolbar__group,
    .forgeui-rich-text-editor .tox .tox-statusbar {
      border-color: var(--editor-border) !important;
    }

    .forgeui-rich-text-editor .tox .tox-edit-area::before {
      border: 0 !important;
    }

    .forgeui-rich-text-editor .tox .tox-edit-area__iframe {
      background: var(--editor-background) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop,
    .forgeui-rich-text-editor .tox .tox-pop__dialog,
    .forgeui-rich-text-editor .tox .tox-pop .tox-toolbar,
    .forgeui-rich-text-editor .tox .tox-pop .tox-toolbar__group,
    .forgeui-rich-text-editor .tox .tox-pop .tox-toolbar__primary {
      background: var(--editor-card) !important;
      color: var(--editor-card-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop {
      border: 1px solid var(--editor-border) !important;
      border-radius: var(--editor-radius) !important;
      box-shadow:
        0 10px 15px -3px rgb(0 0 0 / 0.2),
        0 4px 6px -4px rgb(0 0 0 / 0.2) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop::before,
    .forgeui-rich-text-editor .tox .tox-pop::after {
      border-bottom-color: var(--editor-card) !important;
      border-top-color: transparent !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop.tox-pop--bottom::before,
    .forgeui-rich-text-editor .tox .tox-pop.tox-pop--bottom::after {
      border-bottom-color: transparent !important;
      border-top-color: var(--editor-card) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button {
      background: transparent !important;
      color: var(--editor-muted-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-icon svg {
      color: var(--editor-muted-foreground) !important;
      fill: var(--editor-muted-foreground) !important;
      stroke: var(--editor-muted-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn svg *,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn svg *,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button svg *,
    .forgeui-rich-text-editor .tox .tox-pop .tox-icon svg * {
      fill: currentColor !important;
      stroke: currentColor !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn:hover,
    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn:focus,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn:hover,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn:focus,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button:hover,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button:focus-within {
      background: var(--editor-accent) !important;
      color: var(--editor-accent-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn:hover svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn:focus svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn:hover svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn:focus svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button:hover svg,
    .forgeui-rich-text-editor .tox .tox-pop .tox-split-button:focus-within svg {
      color: var(--editor-accent-foreground) !important;
      fill: var(--editor-accent-foreground) !important;
      stroke: var(--editor-accent-foreground) !important;
    }

    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn--enabled,
    .forgeui-rich-text-editor .tox .tox-pop .tox-tbtn--active,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn--active,
    .forgeui-rich-text-editor .tox .tox-pop .tox-mbtn[aria-expanded="true"] {
      background: color-mix(
        in oklab,
        var(--editor-primary) 18%,
        transparent
      ) !important;
      color: var(--editor-primary) !important;
    }

    /*
     * TinyMCE renders Quickbars and other floating UI in a portal
     * under .tox-tinymce-aux, outside .forgeui-rich-text-editor.
     * These global selectors intentionally use resolved theme values.
     */
    .tox-tinymce-aux .tox-pop,
    .tox-tinymce-aux .tox-pop__dialog,
    .tox-tinymce-aux .tox-pop .tox-toolbar,
    .tox-tinymce-aux .tox-pop .tox-toolbar__primary,
    .tox-tinymce-aux .tox-pop .tox-toolbar__group {
      background: ${theme.card} !important;
      background-color: ${theme.card} !important;
      color: ${theme.cardForeground} !important;
    }

    .tox-tinymce-aux .tox-pop {
      border: 1px solid ${theme.border} !important;
      border-radius: ${theme.radius} !important;
      box-shadow:
        0 10px 15px -3px rgb(0 0 0 / 0.2),
        0 4px 6px -4px rgb(0 0 0 / 0.2) !important;
    }

    /*
     * Remove every Oxide arrow color first. TinyMCE changes which
     * border side draws the triangle depending on popup placement.
     */
    .tox-tinymce-aux .tox-pop::before,
    .tox-tinymce-aux .tox-pop::after {
      border-color: transparent !important;
    }

    /*
     * The ::before triangle is the outer arrow/border.
     * The ::after triangle is the inner popup fill.
     */
    .tox-tinymce-aux .tox-pop.tox-pop--top::before {
      border-bottom-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--top::after {
      border-bottom-color: ${theme.card} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--bottom::before {
      border-top-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--bottom::after {
      border-top-color: ${theme.card} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--left::before {
      border-right-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--left::after {
      border-right-color: ${theme.card} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--right::before {
      border-left-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop.tox-pop--right::after {
      border-left-color: ${theme.card} !important;
    }

    /*
     * Some TinyMCE builds use directional arrow classes on child
     * elements rather than modifiers on .tox-pop.
     */
    .tox-tinymce-aux .tox-pop__arrow::before,
    .tox-tinymce-aux .tox-pop__arrow::after {
      border-color: transparent !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--top::before {
      border-bottom-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--top::after {
      border-bottom-color: ${theme.card} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--bottom::before {
      border-top-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--bottom::after {
      border-top-color: ${theme.card} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--left::before {
      border-right-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--left::after {
      border-right-color: ${theme.card} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--right::before {
      border-left-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop__arrow--right::after {
      border-left-color: ${theme.card} !important;
    }

    /*
     * Force the popup outline itself to the Shadcn border token,
     * including browser outlines and inset skin shadows.
     */
    .tox-tinymce-aux .tox-pop,
    .tox-tinymce-aux .tox-pop__dialog {
      border-color: ${theme.border} !important;
      outline-color: ${theme.border} !important;
    }

    .tox-tinymce-aux .tox-pop .tox-tbtn,
    .tox-tinymce-aux .tox-pop .tox-mbtn,
    .tox-tinymce-aux .tox-pop .tox-split-button,
    .tox-tinymce-aux .tox-pop button {
      background: transparent !important;
      background-color: transparent !important;
      color: ${theme.mutedForeground} !important;
    }

    .tox-tinymce-aux .tox-pop .tox-tbtn svg,
    .tox-tinymce-aux .tox-pop .tox-mbtn svg,
    .tox-tinymce-aux .tox-pop .tox-split-button svg,
    .tox-tinymce-aux .tox-pop .tox-icon svg,
    .tox-tinymce-aux .tox-pop button svg {
      color: ${theme.mutedForeground} !important;
      fill: ${theme.mutedForeground} !important;
      stroke: ${theme.mutedForeground} !important;
    }

    .tox-tinymce-aux .tox-pop .tox-tbtn svg *,
    .tox-tinymce-aux .tox-pop .tox-mbtn svg *,
    .tox-tinymce-aux .tox-pop .tox-split-button svg *,
    .tox-tinymce-aux .tox-pop .tox-icon svg *,
    .tox-tinymce-aux .tox-pop button svg * {
      fill: currentColor !important;
      stroke: currentColor !important;
    }

    .tox-tinymce-aux .tox-pop .tox-tbtn:hover,
    .tox-tinymce-aux .tox-pop .tox-tbtn:focus,
    .tox-tinymce-aux .tox-pop .tox-mbtn:hover,
    .tox-tinymce-aux .tox-pop .tox-mbtn:focus,
    .tox-tinymce-aux .tox-pop .tox-split-button:hover,
    .tox-tinymce-aux .tox-pop .tox-split-button:focus-within,
    .tox-tinymce-aux .tox-pop button:hover,
    .tox-tinymce-aux .tox-pop button:focus-visible {
      background: ${theme.accent} !important;
      background-color: ${theme.accent} !important;
      color: ${theme.accentForeground} !important;
    }

    .tox-tinymce-aux .tox-pop .tox-tbtn:hover svg,
    .tox-tinymce-aux .tox-pop .tox-tbtn:focus svg,
    .tox-tinymce-aux .tox-pop .tox-mbtn:hover svg,
    .tox-tinymce-aux .tox-pop .tox-mbtn:focus svg,
    .tox-tinymce-aux .tox-pop .tox-split-button:hover svg,
    .tox-tinymce-aux .tox-pop .tox-split-button:focus-within svg,
    .tox-tinymce-aux .tox-pop button:hover svg,
    .tox-tinymce-aux .tox-pop button:focus-visible svg {
      color: ${theme.accentForeground} !important;
      fill: ${theme.accentForeground} !important;
      stroke: ${theme.accentForeground} !important;
    }

    .tox-tinymce-aux .tox-pop .tox-tbtn--enabled,
    .tox-tinymce-aux .tox-pop .tox-tbtn--active,
    .tox-tinymce-aux .tox-pop .tox-mbtn--active,
    .tox-tinymce-aux .tox-pop .tox-mbtn[aria-expanded="true"] {
      background: color-mix(
        in oklab,
        ${theme.primary} 18%,
        transparent
      ) !important;
      background-color: color-mix(
        in oklab,
        ${theme.primary} 18%,
        transparent
      ) !important;
      color: ${theme.primary} !important;
    }
  `;
}

export type RichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  preset?: EditorPreset;
  height?: number;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  ariaDescribedBy?: string;
  enableMentions?: boolean;
};

export function RichTextEditor({
  id = "rich-text-editor",
  value,
  onChange,
  onBlur,
  placeholder = "Start writing...",
  preset = "standard",
  height = 500,
  disabled = false,
  invalid = false,
  className,
  ariaDescribedBy,
  enableMentions = false,
}: RichTextEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [theme, setTheme] = useState<ShadcnEditorTheme>(
    LIGHT_FALLBACK,
  );

  useEffect(() => {
    const updateTheme = () => {
      setTheme(readShadcnTheme(isDark));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => observer.disconnect();
  }, [isDark, resolvedTheme]);

  const { startUpload, isUploading } =
    useUploadThing("imageUploader");

  const handleImageUpload =
    useCallback<ImagesUploadHandler>(
      async (blobInfo, progress) => {
        const blob = blobInfo.blob();
        const file = new File(
          [blob],
          blobInfo.filename(),
          {
            type: blob.type || "image/jpeg",
            lastModified: Date.now(),
          },
        );

        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
          throw new Error(
            "Only JPG, PNG, GIF, and WebP images are allowed.",
          );
        }

        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error(
            "Images must be 4 MB or smaller.",
          );
        }

        progress(10);

        const uploadedFiles = await startUpload([file]);
        const uploadedFile = uploadedFiles?.[0];

        if (!uploadedFile) {
          throw new Error(
            "The image upload was not completed.",
          );
        }

        progress(90);

        const imageUrl =
          uploadedFile.ufsUrl ??
          uploadedFile.serverData?.url;

        if (!imageUrl) {
          throw new Error(
            "UploadThing did not return an image URL.",
          );
        }

        progress(100);
        return imageUrl;
      },
      [startUpload],
    );

  const presetConfig = editorPresets[preset];

  const contentStyle = useMemo(
    () => createContentStyle(theme),
    [theme],
  );

  const chromeStyle = useMemo(
    () => createChromeStyle(theme),
    [theme],
  );

  const editorConfig = useMemo<TinyMceInit>(
    () => ({
      height,
      menubar: presetConfig.menubar,
      plugins: presetConfig.plugins,
      toolbar: presetConfig.toolbar,
      quickbars_selection_toolbar:
        presetConfig.quickbarsSelectionToolbar,
      quickbars_insert_toolbar:
        presetConfig.quickbarsInsertToolbar,

      placeholder,
      branding: false,
      promotion: false,
      resize: true,
      statusbar: true,
      toolbar_mode: "sliding",

      skin: isDark ? "oxide-dark" : "oxide",
      content_css: isDark ? "dark" : "default",
      content_style: contentStyle,

      automatic_uploads: true,
      paste_data_images: true,
      images_reuse_filename: false,
      images_file_types: "jpg,jpeg,png,gif,webp",
      images_upload_handler: handleImageUpload,

      image_advtab: true,
      image_caption: true,
      image_title: true,
      file_picker_types: "image",

      link_default_target: "_blank",
      link_assume_external_targets: true,
      link_context_toolbar: true,

      browser_spellcheck: true,
      contextmenu: false,

      setup: enableMentions
        ? (editor) => {
            editor.ui.registry.addAutocompleter("mymusic-users", {
              trigger: "@",
              minChars: 1,
              maxResults: 8,
              columns: 1,
              fetch: async (pattern) => {
                const response = await fetch(
                  `/api/users/mentions?q=${encodeURIComponent(pattern)}`,
                );

                if (!response.ok) {
                  return [];
                }

                const data = (await response.json()) as {
                  users?: Array<{
                    username: string;
                    displayUsername: string | null;
                    name: string;
                  }>;
                };

                return (data.users ?? []).map((user) => ({
                  type: "autocompleteitem" as const,
                  value: user.username,
                  text: `@${user.displayUsername || user.username} — ${user.name}`,
                }));
              },
              onAction: (autocompleteApi, rng, username) => {
                editor.selection.setRng(rng);
                editor.insertContent(`@${username}&nbsp;`);
                autocompleteApi.hide();
              },
            });
          }
        : undefined,
    }),
    [
      contentStyle,
      handleImageUpload,
      height,
      isDark,
      placeholder,
      presetConfig,
      enableMentions,
    ],
  );

  return (
    <div
      className={cn(
        "forgeui-rich-text-editor space-y-2",
        className,
      )}
    >
      <style>{chromeStyle}</style>

      <div
        data-invalid={invalid || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "overflow-hidden rounded-md border bg-background shadow-xs",
          "transition-[border-color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          invalid &&
            "border-destructive ring-destructive/20 dark:ring-destructive/40",
          (disabled || isUploading) &&
            "pointer-events-none opacity-60",
        )}
      >
        <Editor
          key={`${resolvedTheme}-${theme.background}-${theme.primary}`}
          id={id}
          apiKey={
            process.env.NEXT_PUBLIC_TINYMCE_API_KEY
          }
          value={value}
          disabled={disabled || isUploading}
          onEditorChange={onChange}
          onBlur={onBlur}
          init={editorConfig}
          scriptLoading={{ async: true }}
        />
      </div>

      <div
        className="min-h-4 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {isUploading ? "Uploading image..." : null}
      </div>
    </div>
  );
}
