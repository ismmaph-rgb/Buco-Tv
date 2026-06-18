import { Router, type IRouter } from "express";
import healthRouter from "./health";
import channelsRouter from "./channels";
import streamRouter from "./stream";

const router: IRouter = Router();

router.use(healthRouter);
router.use(channelsRouter);
router.use(streamRouter);

export default router;
