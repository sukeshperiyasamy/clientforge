import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
const target = "data/postiz";
if (existsSync(`${target}/docker-compose.yaml`)) {
  console.log("Existing local Postiz configuration retained.");
  process.exit(0);
}
if (!existsSync("vendor/postiz-deploy/docker-compose.yaml"))
  throw new Error(
    "Clone https://github.com/gitroomhq/postiz-docker-compose into vendor/postiz-deploy first.",
  );
mkdirSync(target, { recursive: true });
const password = randomBytes(24).toString("hex");
const temporalPassword = randomBytes(24).toString("hex");
const jwt = randomBytes(48).toString("hex");
let compose = readFileSync("vendor/postiz-deploy/docker-compose.yaml", "utf8")
  .replace(
    "random string that is unique to every install - just type random characters here!",
    jwt,
  )
  .replaceAll("postiz-password", password)
  .replace(
    "POSTGRES_PASSWORD: temporal",
    `POSTGRES_PASSWORD: ${temporalPassword}`,
  )
  .replace("POSTGRES_PWD=temporal", `POSTGRES_PWD=${temporalPassword}`)
  .replace('"4007:5000"', '"127.0.0.1:4007:5000"')
  .replace("name: temporal-network", "name: clientforge-temporal-network");
// Isolate containers from other Postiz installations on this Docker host.
compose = compose.replace(
  /container_name: ([\w-]+)/g,
  "container_name: clientforge-$1",
);
writeFileSync(`${target}/docker-compose.yaml`, compose, { mode: 0o600 });
cpSync("vendor/postiz-deploy/dynamicconfig", `${target}/dynamicconfig`, {
  recursive: true,
});
console.log(
  "Prepared ignored local Postiz configuration with unique credentials and loopback-only ports.",
);
