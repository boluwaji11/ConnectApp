/**
 * SEC-001. The editor's markdown cannot become markup it did not write.
 *
 * `markdownToHtml` is the one place in the product that builds HTML from stored
 * text by hand, and its output reaches three sinks: the composer's read back
 * through `dangerouslySetInnerHTML`, the editor's own box through `innerHTML`,
 * and the body of outbound mail. It escaped angle brackets and not quotes, so a
 * stored link closed the `href` it was being written into and opened an
 * attribute of its own, which a browser parses as an event handler.
 *
 * The invariant asserted here is structural rather than a search for a word:
 * every tag this function writes carries only the attributes it meant to write,
 * and the only quotes inside a tag are the ones delimiting a value. A payload
 * that survives as inert text inside an escaped value is fine, and looking for
 * the word "onmouseover" would fail on exactly that harmless case.
 */
import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../lib/rich-text";

/** Every tag in the output, as the text between its brackets. */
const tags = (html: string): string[] =>
  [...html.matchAll(/<([^>]*)>/g)].map((m) => m[1]!);

/**
 * The attribute names a tag carries.
 *
 * Read by walking the quotes: the segments outside a quoted value are where an
 * attribute name can appear, so a value that happens to contain `=` is never
 * mistaken for one.
 */
function attributesOf(tag: string): string[] {
  const outside = tag.split('"').filter((_, i) => i % 2 === 0);
  return outside.flatMap((part) => [...part.matchAll(/([a-zA-Z-]+)\s*=/g)].map((m) => m[1]!));
}

/** Nothing this function writes may carry an attribute other than `href`. */
function onlyHrefs(html: string): void {
  for (const tag of tags(html)) {
    expect(attributesOf(tag), `attributes on <${tag}>`).toEqual(
      tag.startsWith("a ") ? ["href"] : [],
    );
    /* Two quotes on an anchor, none anywhere else: a third would mean a value
       ended early and whatever followed it was read as markup. */
    expect([...tag].filter((c) => c === '"').length, `quotes in <${tag}>`).toBe(
      tag.startsWith("a ") ? 2 : 0,
    );
  }
}

describe("markdownToHtml, as a boundary", () => {
  it("writes no attribute a payload asked for", () => {
    onlyHrefs(markdownToHtml(`[click](https://x"onmouseover="alert(document.domain)`));
    onlyHrefs(markdownToHtml(`[a](https://x"autofocus"onfocus="alert(1)`));
    onlyHrefs(markdownToHtml(`[a](https://x"style="position:fixed;inset:0)`));
  });

  it("escapes the quotes that carried the break out", () => {
    const html = markdownToHtml(`he said "no" and 'maybe'`);
    expect(html).toContain("&quot;no&quot;");
    expect(html).toContain("&#39;maybe&#39;");
  });

  it("still escapes an angle bracket", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).not.toContain("<script");
  });

  it("writes an ordinary link, with its query intact", () => {
    const html = markdownToHtml("[notes](https://example.org/a?b=1&c=2)");
    expect(html).toContain('href="https://example.org/a?b=1&amp;c=2"');
    expect(html).toContain(">notes</a>");
    onlyHrefs(html);
  });

  it("refuses a scheme that is not http or https", () => {
    for (const bad of [
      "[x](javascript:alert(1))",
      "[x](data:text/html,alert(1))",
      "[x](vbscript:msgbox(1))",
      "[x](https://user:pass@example.org/)",
    ]) {
      expect(markdownToHtml(bad), bad).not.toMatch(/<a /);
    }
  });

  it("leaves the words alone where it will not write the link", () => {
    expect(markdownToHtml("[x](javascript:alert(1))")).toContain("javascript:alert(1)");
  });
});
