/**
 * What the CLI asks DashForDevs for once you are logged in: your organizations,
 * a new site in one, and that site's keys.
 *
 * PREVIEW ONLY for now. The server side does not exist yet:
 *   - accounts: list the signed-in user's orgs for a CLI token (scope accounts:orgs:read)
 *   - papi/organizations: create a site + its database, mint pk_/sk_ keys for a CLI token
 * Until then these return sample data, and preview keys are never written where
 * `dash4devs build` would try to use them.
 */
import crypto from "node:crypto";
import { sleep } from "./ui.js";

const rand = (n) => crypto.randomBytes(n).toString("hex");

function sampleOrgs(user) {
  const first = (user?.name || "my").split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "my";
  return [
    { id: "org_preview_1", slug: `${first}-studio`, name: `${user?.name || "My"}'s Studio`, role: "owner", sites: 3, hipaa: false },
    { id: "org_preview_2", slug: "sunny-side-bakery", name: "Sunny Side Bakery", role: "admin", sites: 1, hipaa: false },
    { id: "org_preview_3", slug: "paws-and-claws-vet", name: "Paws & Claws Vet", role: "developer", sites: 0, hipaa: true },
  ];
}

export async function listOrgs(creds) {
  await sleep(450);
  return sampleOrgs(creds?.user);
}

export async function createOrg(_creds, name) {
  await sleep(600);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-org";
  return { id: `org_preview_${rand(3)}`, slug, name, role: "owner", sites: 0, hipaa: false };
}

/** Create the site (and its own database) in the org. */
export async function createSite(_creds, org, { name }) {
  await sleep(500);
  return { id: `site_preview_${rand(4)}`, org: org.slug, name };
}

/** Mint the site's keys. In preview they are marked and unusable. */
export async function createKeys(_creds, _site, { environment = "test" } = {}) {
  await sleep(400);
  return {
    preview: true,
    environment,
    publicKey: `pk_${environment}_preview${rand(8)}`,
    secretKey: `sk_${environment}_preview${rand(16)}`,
  };
}
