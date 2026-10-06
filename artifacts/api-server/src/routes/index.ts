import { Router, type IRouter } from "express";
import healthRouter from "./health";
import signalsRouter from "./signals";
import searchRouter from "./search";
import probabilityEvaluationRouter from "./probability-evaluation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(searchRouter);
router.use(probabilityEvaluationRouter);

export default router;
