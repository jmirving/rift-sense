import jwt from "jsonwebtoken";

const secret = process.env.NEXUS_JWT_SECRET || "riftsense-local-dev-secret";
const issuer = process.env.NEXUS_AUTH_ISSUER || "nexus";
const audience = process.env.NEXUS_AUTH_AUDIENCE || "riftsense";
const subjectId = process.env.NEXUS_DEV_SUBJECT || "usr_local_dev";

const token = jwt.sign(
  {
    sub: subjectId,
    iss: issuer,
    aud: audience
  },
  secret,
  {
    algorithm: "HS256",
    expiresIn: "12h"
  }
);

console.log(token);

