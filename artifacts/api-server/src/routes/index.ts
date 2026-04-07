import { Router, type IRouter } from "express";
import healthRouter from "./health";
import signalsRouter from "./signals";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(searchRouter);

export default router;
