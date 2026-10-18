import { signOut } from "@/app/actions";

/**
 * HRT-439. Leaving from a screen that is not inside the portal yet.
 *
 * A form rather than a link to /sign-in. Somebody who is signed in and stuck
 * at the second factor is still signed in, and /sign-in sends them straight
 * back where they came from, so the link read as broken.
 */
export function Leave() {
  return (
    <form action={signOut} className="inline">
      <button type="submit" className="font-medium text-primary underline-offset-4 hover:underline">
        Sign in as someone else
      </button>
    </form>
  );
}
