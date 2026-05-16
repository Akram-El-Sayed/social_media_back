const Joi = require("joi");

const hashtagItems = Joi.string()
  .pattern(/^[a-zA-Z0-9_]+$/)
  .min(1)
  .max(50)
  .messages({
    "string.pattern.base":
      "Hashtag can only contain letters, numbers, and underscores",
  });

const createPostValidation = Joi.object({
  content: Joi.string().allow("").optional(),
  privacy: Joi.string()
    .valid("public", "private", "friends-only")
    .default("public"),
  hashtags: Joi.array().items(hashtagItems).min(1).max(30).required(),
});

const updatePostValidation = Joi.object({
  content: Joi.string().optional(),
  privacy: Joi.string().valid("public", "private", "friends-only").optional(),
  hashtags: Joi.array().items(hashtagItems).min(1).max(30).optional(),
});

const sharePostValidation = Joi.object({
  receiverId: Joi.string().hex().length(24).required(),
  text: Joi.string().allow("").max(500).optional(),
});

module.exports = {
  createPostValidation,
  updatePostValidation,
  sharePostValidation,
};
