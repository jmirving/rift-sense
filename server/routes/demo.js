import express from "express";

import { buildPublicDemoHome } from "../demo-home.js";
import { buildHomePayload } from "./home-response.js";

export function createDemoRouter({ contentItemsRepository }) {
  const router = express.Router();

  router.get("/home", async (_request, response) => {
    const home = buildPublicDemoHome();

    response.json({
      home: await buildHomePayload({
        home,
        effectiveUserId: home.id,
        source: "demo",
        contentItemsRepository
      })
    });
  });

  return router;
}
