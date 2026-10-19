/**
 * HRT-378, HRT-383, R22.2. A whole page of a church's website.
 *
 * This is the one renderer. The published page at the church's own address
 * calls it on the server with `editing` off, and the editor's canvas calls the
 * same component with `editing` on. Nothing about the layout, the type or the
 * spacing is decided twice, which is why what a church builds is what its
 * congregation reads.
 */

import * as React from "react";
import type { SiteDoc, SitePage, SiteSection } from "@connectapp/db/rules";
import { themeStyle } from "./theme";
import { SECTION_VIEWS } from "./registry";
import { SiteFooterView, SiteHeaderView } from "./header";
import type { SiteCtx } from "./kit";

/** One section, or nothing where its kind is not one we hold. */
export function SectionView({ section, site }: { section: SiteSection; site: SiteCtx }) {
  const View = SECTION_VIEWS[section.type];
  if (!View) return null;
  if (section.hidden && !site.editing) return null;
  /* What this church has changed about particular pieces of text in this
     section, put on the context so the kit can apply it and no section
     component has to know it exists. */
  const held = section.text ? { ...site, text: section.text } : site;
  return <View section={section} site={held} />;
}

/**
 * The element a website is drawn inside.
 *
 * It carries the theme's custom properties and the font variables, and it is
 * the only place either is set. A section reads `var(--s-primary)` and has no
 * idea which palette it came from, which is what lets a church change its
 * whole look without a single section being touched.
 */
export function SiteFrame({
  doc,
  children,
  className = "",
  as: Tag = "div",
}: {
  doc: SiteDoc;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "main";
}) {
  return (
    <Tag
      className={
        `site-root bg-[var(--s-bg)] font-[family-name:var(--s-body)]`
        + ` text-[length:var(--s-text)] text-[var(--s-ink)] ${className}`
      }
      style={themeStyle(doc.theme)}
    >
      {children}
    </Tag>
  );
}

export function SitePageView({
  page,
  site,
}: {
  page: SitePage;
  site: SiteCtx;
}) {
  /*
   * A transparent header sits over the first section, so the first section has
   * to be one that can hold it: a hero on a photograph. Anywhere else the
   * header is drawn on its own ground instead, decided here rather than in the
   * header, because only the page knows what it opens with.
   */
  const first = page.sections.find((one) => !one.hidden || site.editing);
  const canFloat = Boolean(
    first && first.type === "hero"
    && (first.variant === "photo" || first.variant === "immersive"),
  );
  const held: SiteCtx = canFloat
    ? site
    : { ...site, doc: { ...site.doc, header: { ...site.doc.header, transparent: false } } };

  /*
   * R22.7. One h1 a page, whatever a church has put on it.
   *
   * The first welcome carries it. A page with no welcome, or with a second one
   * added below the first, would otherwise have none or two, and the heading
   * order is how somebody reading with a screen reader moves around a page.
   */
  const ownerId = page.sections.find(
    (one) => one.type === "hero" && (!one.hidden || site.editing),
  )?.id ?? null;

  return (
    <>
      <SiteHeaderView site={held} />
      {ownerId === null ? <h1 className="sr-only">{page.title}</h1> : null}
      {page.sections.map((section) => (
        <SectionView
          key={section.id}
          section={section}
          site={section.id === ownerId ? { ...held, owns: true } : held}
        />
      ))}
      <SiteFooterView site={held} />
    </>
  );
}

/** The published page: the frame, the page, and nothing of the admin product. */
export function PublishedPage({ page, site }: { page: SitePage; site: SiteCtx }) {
  return (
    <SiteFrame doc={site.doc} as="main" className="min-h-dvh">
      <SitePageView page={page} site={site} />
    </SiteFrame>
  );
}
