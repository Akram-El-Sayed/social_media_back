const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const commentController = require('../controllers/commentController');
const messageController = require('../controllers/messageController')
const { authMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');


// Post CRUD
// Create post
router.post('/', authMiddleware, upload.array("media" ,10 ), postController.createPost);

//Get posts of specific user 
router.get('/user/:id/posts', authMiddleware, postController.getUserWithPosts);

// Get all posts (feed)
router.get('/feed', authMiddleware, postController.getPosts);

// Get All Reels
router.get('/reels', authMiddleware, postController.getReels);

// Search with Hashtag
router.get("/hashtag/:tag", authMiddleware, postController.getPostsByHashtag );

// Get single post
router.get('/:id', authMiddleware, postController.getPost);

// Update post
router.put('/:id', authMiddleware, upload.array("media", 10), postController.updatePost);

// Delete post
router.delete('/:id', authMiddleware, postController.deletePost);


// Likes
router.post('/:id/like', authMiddleware, postController.likePost);
router.get('/:id/likes', authMiddleware, postController.getPostLikes);

// Comments
router.post('/:id/comments', authMiddleware, commentController.addComment);
router.get('/:id/comments', authMiddleware, commentController.getComments);

//reel view
router.post('/:id/view', authMiddleware, postController.addReelView);

//Feed view
router.post("/:id/feed-view", authMiddleware, postController.addFeedView);

//Share Post
router.post("/:postId/share", authMiddleware, messageController.sharePost);

module.exports = router;
