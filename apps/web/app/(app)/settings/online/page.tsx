import QRCode from "qrcode";
import { withTenant, getStripeAccount, canManageGiving } from "@connectapp/db";
import { requireSession } from "@/lib/session";
import { shellData } from "@/lib/shell-data";
import { publicLink } from "@/lib/church-address";
import { SettingsHeading } from "../heading";
import { Denied } from "@/components/denied";
import { Banner } from "@connectapp/ui";
import { stripeConfigured, stripeLive } from "@/lib/stripe";
import { syncStripe, accountFace } from "./actions";
import { OnlineGiving } from "./online-giving";
import { t } from "@connectapp/i18n";
import { tabMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

/** R17.1. What the browser tab says. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  return tabMetadata(t("settings.tab.online"));
}

/**
 * R13.1, R13.2. How a church takes a gift by card or bank.
 *
 * The account belongs to the church. Gifts settle to the church's own bank,
 * ConnectApp takes no application fee, and card details never reach this
 * server: the giver types them into Stripe's own page.
 */
export default async function OnlineGivingPage({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  const session = await requireSession();
  const manage = canManageGiving(session);

  /*
   * R13.1. What we hold about the account goes out of date on its own.
   *
   * Stripe decides whether an account may take a payment some moments after
   * the church finishes the form, and it tells us through a webhook that a
   * church running this on a laptop may not have listening. So while the
   * account is not yet taking gifts, this screen asks Stripe each time it is
   * opened. Once it is taking them, nothing is asked: the webhook keeps it
   * right from there.
   */
  const stale = manage && stripeConfigured();

  /* R24.11. The church comes from the frame, which has already read it. */
  const profile = (await shellData(session)).church;

  let account = manage
    ? await withTenant(
        { tenantId: session.tenantId, role: session.role },
        (tx) => getStripeAccount(tx),
      )
    : null;

  /* The account was read once and then read again to answer the same
     question. It is read again here only when Stripe has been asked for
     something newer. */
  /* R13.1. And where Stripe says it does not know the account we hold, the
     screen says so rather than falling over: the id is theirs, so this is
     either an account deleted at their end or keys pointing somewhere else. */
  /*
   * R13.1. An account written down under the other set of keys is not an
   * account this platform can use.
   *
   * The pill on this screen is drawn from our own row rather than from
   * Stripe, and the row is only re-read while the account is not yet taking
   * gifts. So a church that connected while the platform was on test keys
   * went on reading "Active for online giving" after the swap to live, with
   * an id the live key cannot see, and would have found out at the moment
   * somebody tried to give. Where the mode on the row disagrees with the key
   * this platform holds, Stripe is asked again whatever the row says.
   */
  const wrongMode = Boolean(account) && account?.livemode !== stripeLive();

  let unreachable = false;
  /* SEC-002. Both calls below are manage-only actions now, so a reader who may
     not manage giving must not make them: they would throw rather than render. */
  if (stale && manage && account && (!account.chargesEnabled || wrongMode)) {
    unreachable = (await syncStripe()).error === "stripe.unreachable";
    account = await withTenant(
      { tenantId: session.tenantId, role: session.role },
      (tx) => getStripeAccount(tx),
    );
  }

  /*
   * R13.1. An account Stripe will not answer for is not an account.
   *
   * Drawing what we last held about it offers the church a Finish setup it
   * cannot finish, beside a Test mode badge about an account that is gone.
   * The way out is a new one, so the screen asks for a new one: the same face
   * a church sees before it has connected at all, with the banner above
   * saying why it is being asked again.
   */
  const read = { account: unreachable ? null : account, profile };

  /*
   * R13.1. What this church has not told us, which Stripe will therefore ask
   * it for. Said before the press rather than after it: the legal name in
   * particular has to match the church's IRS documents, and a mismatch is
   * what holds verification up for a fortnight.
   */
  const missing = read.account
    ? []
    : [
        read.profile?.legalName ? null : "legalName",
        read.profile?.website ? null : "website",
        read.profile?.addressLine1 ? null : "address",
      ].filter((one): one is string => one !== null);

  /* R13.7, R17.1. What the church prints on a card, and what Stripe holds
     about the account. R24.11. Neither waits on the other: one is a lookup
     here and the other is a call to Stripe. */
  const [address, face] = await Promise.all([
    publicLink(session.tenantSlug, "give"),
    read.account && manage ? accountFace() : { name: null, bank: null, payouts: null },
  ]);

  /*
   * R13.7. The code itself, drawn here so the screen can show it and hand it
   * over as a file. There is nothing secret in it: it is the church's own
   * public giving address.
   */
  const qr = read.account?.chargesEnabled
    ? await QRCode.toDataURL(address, { errorCorrectionLevel: "M", margin: 1, width: 512 })
    : null;

  return (
    <div className="flex flex-col gap-5">
      <SettingsHeading title="settings.tab.online" lede="settings.lede.online" />
      {unreachable ? <Banner tone="danger">{t("stripe.unreachable")}</Banner> : null}
      {manage ? (
        <OnlineGiving
          church={session.tenantSlug}
          account={read.account}
          missing={missing}
          configured={stripeConfigured()}
          address={address}
          qr={qr}
          face={face}
          signedInAs={session.displayName}
        />
      ) : (
        <Denied role={session.role} action="manageGiving" church={session.tenantSlug} />
      )}
    </div>
  );
}
