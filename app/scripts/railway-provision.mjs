// Provision a SEPARATE Postgres service ("app-db") in the existing Railway project
// "cour" via the Public GraphQL API (workspace token). Does NOT touch the indexer's
// Postgres/indexer/monitor services. Prints the public host:port + DB name (NOT the
// password). Reads RAILWAY_TOKEN + APP_PG_PASSWORD from env.
const TOKEN = process.env.RAILWAY_TOKEN;
const PW = process.env.APP_PG_PASSWORD;
if (!TOKEN || !PW) { console.error("need RAILWAY_TOKEN + APP_PG_PASSWORD env"); process.exit(1); }

const EP = "https://backboard.railway.com/graphql/v2";
const PROJECT = "3ea985e0-fa8e-4fa7-93bc-f69d9dc4b865";
const ENV = "ac20431f-1b6e-4c5f-a8fb-1b58af9c75c2";
const IMAGE = "ghcr.io/railwayapp-templates/postgres-ssl:18";

async function gql(query, variables) {
  const r = await fetch(EP, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// 0. guard: don't duplicate if app-db already exists
const proj = await gql(`query($id:String!){project(id:$id){services{edges{node{id name}}}}}`, { id: PROJECT });
const existing = proj.project.services.edges.find((e) => e.node.name === "app-db");
let serviceId;
if (existing) {
  serviceId = existing.node.id;
  console.error("app-db already exists:", serviceId);
} else {
  const c = await gql(
    `mutation($input:ServiceCreateInput!){serviceCreate(input:$input){id}}`,
    { input: { projectId: PROJECT, environmentId: ENV, name: "app-db", source: { image: IMAGE } } },
  );
  serviceId = c.serviceCreate.id;
  console.error("created app-db service:", serviceId);
}

// 1. volume (idempotent-ish: ignore if it errors because one exists)
try {
  await gql(`mutation($input:VolumeCreateInput!){volumeCreate(input:$input){id}}`, {
    input: { projectId: PROJECT, environmentId: ENV, serviceId, mountPath: "/var/lib/postgresql/data" },
  });
  console.error("volume created");
} catch (e) {
  console.error("volume step:", String(e).slice(0, 120));
}

// 2. variables (postgres-ssl init vars + a self-contained DATABASE_URL via private domain)
await gql(`mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}`, {
  input: {
    projectId: PROJECT,
    environmentId: ENV,
    serviceId,
    replace: false,
    skipDeploys: true,
    variables: {
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: PW,
      POSTGRES_DB: "railway",
      PGDATA: "/var/lib/postgresql/data/pgdata",
      SSL_CERT_DAYS: "820",
      PGPORT: "5432",
    },
  },
});
console.error("variables set");

// 3. public TCP proxy on 5432
const existingProxyData = await gql(
  `query($id:String!){service(id:$id){serviceInstances{edges{node{domains{tcpProxies{domain proxyPort applicationPort}}}}}}}`,
  { id: serviceId },
).catch(() => null);
let proxy = null;
const tp = existingProxyData?.service?.serviceInstances?.edges?.[0]?.node?.domains?.tcpProxies?.[0];
if (tp && tp.domain) {
  proxy = tp;
  console.error("tcp proxy exists");
} else {
  const p = await gql(`mutation($input:TCPProxyCreateInput!){tcpProxyCreate(input:$input){domain proxyPort applicationPort}}`, {
    input: { environmentId: ENV, serviceId, applicationPort: 5432 },
  });
  proxy = p.tcpProxyCreate;
  console.error("tcp proxy created");
}

// 4. deploy
await gql(`mutation($sid:String!,$eid:String!){serviceInstanceDeployV2(serviceId:$sid,environmentId:$eid)}`, {
  sid: serviceId,
  eid: ENV,
});
console.error("deploy triggered");

// Output the public connection target (password injected by the caller, not printed here)
console.log(JSON.stringify({ serviceId, host: proxy.domain, port: proxy.proxyPort, db: "railway", user: "postgres" }));
