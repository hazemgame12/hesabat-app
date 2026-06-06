import { Router, type IRouter } from "express";
import healthRouter from "./health";
import articlesRouter from "./articles";
import settingsRouter from "./settings";
import servicesRouter from "./services";
import packagesRouter from "./packages";
import leadsRouter from "./leads";
import caseStudiesRouter from "./case-studies";
import uploadsRouter from "./uploads";
import socialPostsRouter from "./social-posts";
import aiRouter from "./ai";
import authRouter from "./auth";
import accountsRouter from "./accounts";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountsRouter);
router.use(dashboardRouter);
router.use(articlesRouter);
router.use(settingsRouter);
router.use(servicesRouter);
router.use(packagesRouter);
router.use(leadsRouter);
router.use(caseStudiesRouter);
router.use(uploadsRouter);
router.use(socialPostsRouter);
router.use(aiRouter);

export default router;
