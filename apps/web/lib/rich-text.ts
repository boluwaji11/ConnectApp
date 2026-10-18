/**
 * R9.2. Between what somebody types and what we keep.
 *
 * The editor is a contenteditable box, so the browser hands back HTML. We do
 * not store that: it is turned into the small markdown the renderer already
 * understands, and read back the same way. Keeping markdown means nothing a
 * volunteer pastes can ever become a tag on a page a member reads, and the one
 * renderer stays the only thing that decides what an element may be.
 */

/**
 * An inline mark, applied a line at a time.
 *
 * Bolding across two lines gives a <strong> with blocks inside it, and wrapping
 * the whole thing in one pair of asterisks writes markdown where the opening
 * and closing marks sit on different lines. Nothing reads that back, so the
 * asterisks appeared in the box as text. Each line carries its own pair, and
 * the spaces at either end stay outside them.
 */
function marked(text: string, wrap: string): string {
  return text
    .split("\n")
    .map((line) => {
      const parts = /^(\s*)(.*?)(\s*)$/.exec(line);
      if (!parts) return line;
      const [, left = "", body = "", right = ""] = parts;
      return body ? `${left}${wrap}${body}${wrap}${right}` : line;
    })
    .join("\n");
}

/** The HTML the editor produces, as markdown. */
export function htmlToMarkdown(root: Node): string {
  const out: string[] = [];

  const walk = (node: Node, inList: null | "ul" | "ol"): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const kids = (list: null | "ul" | "ol" = inList) =>
      Array.from(el.childNodes)
        .map((child) => walk(child, list))
        .join("");

    switch (el.tagName) {
      case "BR":
        return "\n";
      case "STRONG":
      case "B":
        return marked(kids(), "**");
      case "EM":
      case "I":
        return marked(kids(), "_");
      /*
       * R16.12. Markdown has no underline of its own, so it is kept as the
       * pair this product uses for it. The alternative is storing a tag, and
       * nothing a volunteer types is ever stored as a tag.
       */
      case "U":
        return marked(kids(), "++");
      case "A": {
        const href = el.getAttribute("href") ?? "";
        return /^https?:\/\//i.test(href) ? `[${kids()}](${href})` : kids();
      }
      /*
       * No blank line of its own around a list. The only blank lines in what is
       * stored are then the ones somebody typed, which is what lets them come
       * back exactly where they were put.
       */
      case "UL":
        return `${Array.from(el.children)
          .map((li) => `- ${walk(li, "ul")}`)
          .join("\n")}\n`;
      case "OL":
        return `${Array.from(el.children)
          .map((li, i) => `${i + 1}. ${walk(li, "ol")}`)
          .join("\n")}\n`;
      case "LI":
        return kids(null);
      /*
       * R16.12. An indented block, which is what the browser makes when
       * somebody presses the indent button. Kept as a tab a line, so a letter
       * that sets a paragraph in comes back set in, and so nothing in the
       * stored text can be mistaken for markdown's own syntax.
       */
      case "BLOCKQUOTE":
        return `${kids()
          .replace(/\n$/, "")
          .split("\n")
          .map((line) => (line.trim() === "" ? line : `\t${line}`))
          .join("\n")}\n`;
      case "DIV":
      case "P": {
        const inside = kids();
        // An empty paragraph is the one break somebody pressed Enter for. The
        // browser writes it as a div holding a single line break, and counting
        // both would double every blank line each time the panel opened.
        return inside.trim() === "" ? "\n" : `${inside}\n`;
      }
      default:
        return kids();
    }
  };

  for (const child of Array.from(root.childNodes)) {
    const text = walk(child, null);
    // A list has to start its own line even where what came before it did not
    // end one, which happens with bare text at the top of the box.
    const starts = /^(-\s|\d+\.\s)/.test(text);
    const open = out.length > 0 && !out[out.length - 1]!.endsWith("\n");
    out.push(starts && open ? `\n${text}` : text);
  }

  return out.join("").replace(/\n{4,}/g, "\n\n\n").replace(/\s+$/, "");
}

/**
 * Text as it is safe to put anywhere in markup, including inside an attribute.
 *
 * The quotes matter as much as the angle brackets. Without them a stored link
 * closed the `href` it was being written into and opened an attribute of its
 * own: `[x](https://a"onmouseover="...)` became
 * `<a href="https://a"onmouseover="...">`, which a browser parses as an event
 * handler, and the three places this output is written (the composer's read
 * back, the editor's own box, and outbound mail) all run it.
 */
const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * The five replacements above, undone.
 *
 * The address has already been escaped by the time the link rule reaches it, so
 * a legitimate `?a=1&b=2` arrives as `?a=1&amp;b=2`. It is read back here
 * before being parsed as a URL and escaped again on the way out. `&amp;` is
 * last, so a stored `&amp;lt;` cannot be unwound twice into a bracket.
 */
const unescape = (text: string): string =>
  text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

/**
 * A link's address, or nothing where it is not one we will write.
 *
 * Parsed rather than pattern matched, so the decision is made by the same
 * reading of the address a browser would do, and only `http` and `https`
 * survive it. A URL carrying credentials is refused as well: it renders as
 * somebody else's name in the status bar.
 */
function linkHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Inline marks, as the few tags the editor works with. */
function inlineHtml(text: string): string {
  let out = escape(text);
  /*
   * The address is read as a URL rather than matched against a pattern, and
   * written back escaped. An address we will not write stays as the words
   * somebody typed rather than becoming a tag with nothing behind it.
   */
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, target: string) => {
    const href = linkHref(unescape(target));
    return href ? `<a href="${escape(href)}">${label}</a>` : whole;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  /*
   * A mark with nothing to close it runs to the end of its line, which is what
   * somebody who bolded across a line break meant. Anything still left over is
   * dropped: a box that shows asterisks is a box that looks broken.
   */
  out = out.replace(/\*\*([^*]+)$/, "<strong>$1</strong>");
  return out.replace(/\*\*/g, "");
}

/**
 * Markdown as the HTML the editor opens with.
 *
 * Every angle bracket and every quote in the stored text is escaped before a
 * tag is added, so the only elements here are the ones this function writes and
 * the only attributes are the ones it puts on them. The quotes are the half
 * that was missing: escaping brackets alone left a stored link able to close
 * its own `href` and add an event handler after it.
 */
export function markdownToHtml(markdown: string): string {
  // A form posts its fields with CRLF line endings, so what comes back out of
  // storage carries them. Everything below counts in newlines.
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(inlineHtml(lines[i]!.replace(/^\s*[-*]\s+/, "")));
        i += 1;
      }
      out.push(`<ul>${items.map((one) => `<li>${one}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(inlineHtml(lines[i]!.replace(/^\s*\d+\.\s+/, "")));
        i += 1;
      }
      out.push(`<ol>${items.map((one) => `<li>${one}</li>`).join("")}</ol>`);
      continue;
    }

    // An empty line, or one holding nothing but marks that lost their pair.
    if (line.trim() === "" || /^[*_\s]+$/.test(line)) {
      // A blank line between two blocks is one somebody typed, so it comes
      // back. One at the very top or the very bottom is not worth keeping.
      if (out.length > 0 && lines.slice(i + 1).some((one) => one.trim() !== "")) {
        out.push("<div><br></div>");
      }
      i += 1;
      continue;
    }

    /* R16.12. A run of indented lines comes back as the block the browser
       indents, so pressing outdent on it undoes what indent did. */
    if (line.startsWith("\t")) {
      const inside: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("\t")) {
        inside.push(`<div>${inlineHtml(lines[i]!.slice(1))}</div>`);
        i += 1;
      }
      out.push(`<blockquote>${inside.join("")}</blockquote>`);
      continue;
    }

    out.push(`<div>${inlineHtml(line)}</div>`);
    i += 1;
  }

  return out.join("");
}

/**
 * R9.5. The same description as one line of text.
 *
 * A card that is itself a link cannot carry the markdown rendering, because the
 * links inside it would nest. This takes the marks off and leaves the words.
 */
export function plainFromMarkdown(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\+\+([^+]+)\+\+/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
