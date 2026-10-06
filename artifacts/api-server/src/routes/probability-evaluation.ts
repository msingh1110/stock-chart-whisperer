import { Router, type IRouter } from "express";
import { GetProbabilityEvaluationResponse } from "@workspace/api-zod";
import { evaluationStatus } from "../lib/probability-store";

const router: IRouter = Router();
router.get("/probability-evaluation", async (req, res): Promise<void> => {
  try {
    res.json(GetProbabilityEvaluationResponse.parse(await evaluationStatus()));
  } catch (err) {
    req.log.error({ err }, "Probability evaluation status unavailable");
    res.status(503).json({ error: "Probability evaluation storage is unavailable. Check the API logs." });
  }
});
export default router;
