import express from "express";

import { buildPublicDemoHome } from "../demo-home.js";
import { buildHomePayload } from "./home-response.js";

export function createDemoRouter({ contentItemsRepository }) {
  const router = express.Router();

  async function sendDemoHome(response, variant) {
    const home = buildPublicDemoHome(variant);

    response.json({
      home: await buildHomePayload({
        home,
        effectiveUserId: home.id,
        source: "demo",
        contentItemsRepository,
        demoVariant: variant
      })
    });
  }

  router.get("/home", async (_request, response) => {
    await sendDemoHome(response, "default");
  });

  router.get("/home/:variant", async (request, response) => {
    const variant = typeof request.params.variant === "string" ? request.params.variant : "default";
    await sendDemoHome(response, variant);
  });

  return router;
}
