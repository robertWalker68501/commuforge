export function getEditorContentStyle(isDark: boolean): string {
  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const border = isDark ? "#3f3f46" : "#d4d4d8";
  const surface = isDark ? "#27272a" : "#f4f4f5";
  const link = isDark ? "#60a5fa" : "#2563eb";

  return `
    html {
      background: transparent;
    }

    body {
      color: ${foreground};
      font-family: var(
        --font-sans,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif
      );
      font-size: 16px;
      line-height: 1.7;
      margin: 0;
      padding: 1rem;
    }

    body[data-mce-placeholder]::before {
      color: ${muted};
    }

    a {
      color: ${link};
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    img {
      display: block;
      height: auto;
      margin: 1rem auto;
      max-width: 100%;
    }

    figure {
      margin: 1.25rem 0;
    }

    figcaption {
      color: ${muted};
      font-size: 0.875rem;
      margin-top: 0.5rem;
      text-align: center;
    }

    blockquote {
      border-left: 4px solid ${border};
      color: ${muted};
      margin-left: 0;
      padding-left: 1rem;
    }

    code {
      background: ${surface};
      border-radius: 0.25rem;
      font-family: var(
        --font-mono,
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace
      );
      font-size: 0.875em;
      padding: 0.125rem 0.3rem;
    }

    pre {
      background: ${surface};
      border: 1px solid ${border};
      border-radius: 0.5rem;
      overflow-x: auto;
      padding: 1rem;
    }

    pre code {
      background: transparent;
      padding: 0;
    }

    table {
      border-collapse: collapse;
      margin: 1rem 0;
      width: 100%;
    }

    th,
    td {
      border: 1px solid ${border};
      padding: 0.5rem 0.75rem;
      text-align: left;
    }

    hr {
      border: 0;
      border-top: 1px solid ${border};
      margin: 2rem 0;
    }
  `;
}
