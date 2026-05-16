const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.post('/:id/reply', authMiddleware, commentController.replyComment);
router.post('/:id/like', authMiddleware, commentController.likeComment);

module.exports = router;
