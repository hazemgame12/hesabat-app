import { Router, type IRouter } from "express";
import healthRouter from "./health";
import articlesRouter from "./articles";
import settingsRouter from "./settings";
import servicesRouter from "./services";
import packagesRouter from "./packages";
import leadsRouter from "./leads";
import caseStudiesRouter from "./case-studies";
import uploadsRouter from "./uploads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(articlesRouter);
router.use(settingsRouter);
router.use(servicesRouter);
router.use(packagesRouter);
router.use(leadsRouter);
router.use(caseStudiesRouter);
router.use(uploadsRouter);

export default router;
