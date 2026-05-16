const express = require("express");
const router = express.Router();
const otherController = require("../controllers/otherController");
const { authMiddleware } = require("../middlewares/authMiddleware");
const adminController = require("../controllers/adminReportController");
const { roleMiddleware } = require("../middlewares/roleMiddleware");
const { UserRole } = require("../utils/roleService");

// Notifications
router.get("/notifications", authMiddleware, otherController.getNotifications);
router.patch(
  "/notifications/read",
  authMiddleware,
  otherController.markAllAsRead,
);
router.patch("/:id/read", authMiddleware, otherController.markOneRead);

// Reports
router.post("/reports", authMiddleware, otherController.createReport);

router.get(
  "/reports",
  authMiddleware,
  roleMiddleware(UserRole.ADMIN),
  adminController.getPendingReports,
);

router.patch(
  "/reports/:id/take",
  authMiddleware,
  roleMiddleware(UserRole.ADMIN),
  adminController.takeReportForReview,
);

router.patch(
  "/reports/:id/resolve",
  authMiddleware,
  roleMiddleware(UserRole.ADMIN),
  adminController.resolveReport,
);

module.exports = router;
