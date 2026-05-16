const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.get('/profile',authMiddleware, userController.getProfile);
router.put('/profile', authMiddleware, upload.single("profilePicture"), userController.updateProfile);
router.get('/users', authMiddleware, userController.getUsers);
router.post('/:id/follow', authMiddleware, userController.followUser);
router.delete('/:id/unfollow', authMiddleware, userController.unfollowUser);
router.get('/:id/followers', authMiddleware, userController.getFollowers);
router.get('/:id/following', authMiddleware, userController.getFollowing);

module.exports = router;
