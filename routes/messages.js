const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Conversations 
router.get("/conversations", authMiddleware, messageController.getConversations);
router.get("/conversations/search", authMiddleware, messageController.searchConversations);
router.patch("/conversations/delivered-bulk", authMiddleware, messageController.markBulkAsDelivered);



router.get("/conversations/:conversationId", authMiddleware, messageController.getMessages);
router.patch("/conversations/:conversationId/delivered", authMiddleware, messageController.markAsDelivered);
router.patch("/conversations/:conversationId/seen", authMiddleware, messageController.markMessagesAsSeen);

//Messages

router.post("/", authMiddleware, messageController.sendMessage);
router.patch("/:messageId/react", authMiddleware, messageController.reactToMessage);


router.patch("/:messageId", authMiddleware, messageController.editMessage); 
router.delete("/:messageId", authMiddleware, messageController.deleteMessage);
router.get("/:messageId/reactions", authMiddleware, messageController.getReactionUsers);

module.exports = router;