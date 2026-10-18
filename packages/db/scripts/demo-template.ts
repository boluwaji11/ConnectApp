/**
 * HRT-416. Builds the church every demo is a copy of.
 *
 * The loader takes about forty seconds and inserts a row at a time through the
 * repo functions the product uses, which is what keeps the demo from drifting
 * into showing something the product does not do. A visitor never waits for
 * it: they get a copy, which takes about half a second.
 *
 * Run it at deploy time, and again whenever the seed changes.
 *
 *   pnpm --filter @connectapp/db demo:template
 *   pnpm --filter @connectapp/db demo:template --rebuild
 */
import { rebuildDemoTemplate, ensureDemoTemplate, TEMPLATE_SLUG } from "../src/demo/church";
import { owner, closeConnections } from "../src/client";

const rebuild = process.argv.includes("--rebuild");

async function main(): Promise<void> {
  const at = Date.now();
  const id = rebuild ? await rebuildDemoTemplate() : await ensureDemoTemplate();
  const took = Date.now() - at;

  const [row] = await owner()<{ n: number }[]>`
    select count(*)::int as n from members where tenant_id = ${id}`;

  console.log(`${rebuild ? "Rebuilt" : "Ready"}: ${TEMPLATE_SLUG} (${id})`);
  console.log(`${row?.n ?? 0} members, ${(took / 1000).toFixed(1)}s`);
  if (!rebuild && took < 1000) console.log("It was already there. Pass --rebuild to make it again.");
}

main()
  .then(() => closeConnections())
  .catch(async (trouble) => {
    console.error(trouble instanceof Error ? trouble.message : trouble);
    await closeConnections();
    process.exit(1);
  });
